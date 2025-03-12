<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Enable error logging to a file
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', dirname(__FILE__) . '/score_errors.log');

// Log submission attempts
$logFile = dirname(__FILE__) . '/score_submissions.log';
$requestData = file_get_contents('php://input');
$clientIP = $_SERVER['REMOTE_ADDR'];
$timestamp = date('Y-m-d H:i:s');

// Log raw request
file_put_contents(
    $logFile, 
    "[{$timestamp}] IP: {$clientIP} Request: {$requestData}\n", 
    FILE_APPEND
);

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Load configuration
require_once('config.php');

// Check if database features are enabled
if (!isset($DB_CONFIG['enabled']) || !$DB_CONFIG['enabled']) {
    echo json_encode(['success' => false, 'message' => 'Database features are disabled']);
    exit;
}

// Validate input
$input = json_decode(file_get_contents('php://input'), true);

// Log decoded input
file_put_contents(
    $logFile, 
    "[{$timestamp}] Decoded input: " . print_r($input, true) . "\n", 
    FILE_APPEND
);

if (!isset($input['name']) || !isset($input['score'])) {
    http_response_code(400);
    $response = ['success' => false, 'error' => 'Missing required fields'];
    echo json_encode($response);
    file_put_contents($logFile, "[{$timestamp}] Error: Missing fields\n", FILE_APPEND);
    exit;
}

// Sanitize input
$name = substr(htmlspecialchars(trim($input['name'])), 0, 20); // Limit to 20 chars
$score = (int)$input['score'];

// Get token and stats if available
$token = $input['token'] ?? null;
$clientTimestamp = $input['timestamp'] ?? null;
$stats = $input['stats'] ?? null;

// Validate the submission
$validationResult = validateSubmission($name, $score, $token, $clientTimestamp, $stats, $clientIP);
if (!$validationResult['valid']) {
    http_response_code(400);
    $response = ['success' => false, 'error' => 'Validation failed', 'message' => $validationResult['message']];
    echo json_encode($response);
    file_put_contents($logFile, "[{$timestamp}] Validation error: {$validationResult['message']}\n", FILE_APPEND);
    exit;
}

// Log sanitized input
file_put_contents(
    $logFile, 
    "[{$timestamp}] Sanitized input: name='{$name}', score={$score}\n", 
    FILE_APPEND
);

if (empty($name) || $score <= 0) {
    http_response_code(400);
    $response = ['success' => false, 'error' => 'Invalid input'];
    echo json_encode($response);
    file_put_contents($logFile, "[{$timestamp}] Error: Invalid input\n", FILE_APPEND);
    exit;
}

try {
    // Connect to database using config
    $pdo = new PDO("mysql:host={$DB_CONFIG['host']};dbname={$DB_CONFIG['database']};charset=utf8mb4", 
                  $DB_CONFIG['user'], 
                  $DB_CONFIG['password']);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Insert the score
    $stmt = $pdo->prepare('INSERT INTO jbcave_highscores (player_name, score) VALUES (?, ?)');
    $result = $stmt->execute([$name, $score]);
    
    // Log the result
    file_put_contents(
        $logFile, 
        "[{$timestamp}] DB Insert result: " . ($result ? "Success" : "Failed") . "\n", 
        FILE_APPEND
    );
    
    if ($result) {
        $newId = $pdo->lastInsertId();
        file_put_contents($logFile, "[{$timestamp}] New record ID: {$newId}\n", FILE_APPEND);
        
        // Return success with ID
        $response = ['success' => true, 'id' => $newId];
        echo json_encode($response);
    } else {
        throw new Exception("Insert failed but did not throw exception");
    }
    
} catch (PDOException $e) {
    http_response_code(500);
    $response = ['success' => false, 'error' => 'Database error', 'message' => $e->getMessage()];
    echo json_encode($response);
    
    // Log the error
    file_put_contents(
        $logFile, 
        "[{$timestamp}] PDO Error: " . $e->getMessage() . "\n", 
        FILE_APPEND
    );
} catch (Exception $e) {
    http_response_code(500);
    $response = ['success' => false, 'error' => 'Server error', 'message' => $e->getMessage()];
    echo json_encode($response);
    
    // Log the error
    file_put_contents(
        $logFile, 
        "[{$timestamp}] Error: " . $e->getMessage() . "\n", 
        FILE_APPEND
    );
}

/**
 * Validate score submission to prevent cheating
 * 
 * @param string $name Player name
 * @param int $score Score value
 * @param string $token Verification token (optional)
 * @param int $clientTimestamp Client timestamp (optional)
 * @param string $stats Game statistics (optional)
 * @param string $clientIP Client IP address
 * @return array Validation result ['valid' => bool, 'message' => string]
 */
function validateSubmission($name, $score, $token, $clientTimestamp, $stats, $clientIP) {
    // 1. Rate limiting - prevent too many submissions from same IP
    if (!validateRateLimit($clientIP)) {
        return ['valid' => false, 'message' => 'Too many submissions, please wait'];
    }
    
    // 2. Score sanity check - extremely high scores are suspicious
    if ($score > 10000) {
        return ['valid' => false, 'message' => 'Score exceeds maximum allowed value'];
    }
    
    // 3. If we have a timestamp, check if the game duration makes sense
    if ($clientTimestamp && $stats) {
        $parts = explode(':', $stats);
        $playTime = (int)($parts[0] ?? 0);
        
        // Calculate expected game time
        $expectedTime = $score / 0.6 * (1000 / 60); // Based on score formula in game.js
        
        // If play time is too short for score, it's suspicious
        if ($playTime < $expectedTime * 0.5) {
            return ['valid' => false, 'message' => 'Play time too short for score'];
        }
        
        // If play time is way too long, also suspicious
        if ($playTime > $expectedTime * 5) {
            return ['valid' => false, 'message' => 'Play time too long for score'];
        }
    }
    
    // If all checks pass, score is considered valid
    return ['valid' => true, 'message' => 'Score validated'];
}

/**
 * Check if an IP has submitted too many scores recently
 * 
 * @param string $ip Client IP address
 * @return bool True if within rate limits, false if exceeded
 */
function validateRateLimit($ip) {
    $rateLimitFile = dirname(__FILE__) . '/rate_limits.json';
    
    // Load existing rate limit data
    $rateLimits = [];
    if (file_exists($rateLimitFile)) {
        $rateLimits = json_decode(file_get_contents($rateLimitFile), true) ?? [];
    }
    
    $now = time();
    $ipKey = md5($ip); // Hash IP for privacy
    
    // Clear old entries (older than 1 hour)
    foreach ($rateLimits as $key => $data) {
        if ($now - $data['timestamp'] > 3600) {
            unset($rateLimits[$key]);
        }
    }
    
    // Check if IP exists and has exceeded limit
    if (isset($rateLimits[$ipKey])) {
        $data = $rateLimits[$ipKey];
        
        // If more than 10 submissions in 10 minutes, block
        if ($data['count'] >= 10 && $now - $data['timestamp'] < 600) {
            return false;
        }
        
        // Update count
        $rateLimits[$ipKey] = [
            'timestamp' => $now,
            'count' => $data['count'] + 1
        ];
    } else {
        // First submission from this IP
        $rateLimits[$ipKey] = [
            'timestamp' => $now,
            'count' => 1
        ];
    }
    
    // Save updated rate limits
    file_put_contents($rateLimitFile, json_encode($rateLimits));
    
    return true;
}