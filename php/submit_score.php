<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Log submission attempts
$logFile = dirname(__FILE__) . '/score_submissions.log';
$requestData = file_get_contents('php://input');
$clientIP = $_SERVER['REMOTE_ADDR'];
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
$timestamp = date('Y-m-d H:i:s');

// Log raw request
file_put_contents(
    $logFile, 
    "[{$timestamp}] IP: {$clientIP} UA: {$userAgent} Request: {$requestData}\n", 
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

// Check if the score is suspicious, but don't block it
$suspicionResults = checkSuspiciousActivity($name, $score, $token, $clientTimestamp, $stats, $clientIP, $userAgent);
$isSuspicious = $suspicionResults['suspicious'];
$suspicionReason = $suspicionResults['reason'];

// Log sanitized input
file_put_contents(
    $logFile, 
    "[{$timestamp}] Sanitized input: name='{$name}', score={$score}, suspicious={$isSuspicious}, reason={$suspicionReason}\n", 
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
    
    // Insert the score with ip_address and flagged status
    $stmt = $pdo->prepare('INSERT INTO jbcave_highscores (player_name, score, ip_address, flagged) VALUES (?, ?, ?, ?)');
    $result = $stmt->execute([$name, $score, $clientIP, $isSuspicious ? 1 : 0]);
    
    // Log the result
    file_put_contents(
        $logFile, 
        "[{$timestamp}] DB Insert result: " . ($result ? "Success" : "Failed") . "\n", 
        FILE_APPEND
    );
    
    if ($result) {
        $newId = $pdo->lastInsertId();
        file_put_contents($logFile, "[{$timestamp}] New record ID: {$newId}\n", FILE_APPEND);
        
        if ($isSuspicious) {
            // Custom messages for different types of cheating
            $hackingResponses = [
                "n00b detected. Mr. Bonewitz has been notified.",
                "Think you're l33t? That's cute. We've logged your IP.",
                "Interesting approach. Your attempt has been flagged for review.",
                "Nice try! But we've seen this trick before.",
                "Challenge accepted. Game on, hacker!",
                "Hmm, that's an impressive score. Almost TOO impressive...",
                "Did you really think it would be that easy?",
                "Plot twist: Bonewitz WANTS you to try hacking his game.",
                "Your score seems... improbable. But we'll let the physics teacher decide.",
                "Achievement Unlocked: Got Flagged By The System!"
            ];
            
            // Randomly select a response
            $randomResponse = $hackingResponses[array_rand($hackingResponses)];
            
            // Create "hacker" response with more details (educational aspect)
            $response = [
                'success' => true, 
                'id' => $newId,
                'status' => 'flagged',
                'message' => $randomResponse,
                
                // Provide some details about why it was flagged (educational)
                'debug' => [
                    'flagReason' => $suspicionReason,
                    'ip' => preg_replace('/(\d+)\.(\d+)\.(\d+)\.(\d+)/', '$1.$2.XX.XX', $clientIP), // Partially redacted
                    'timestamp' => time(),
                    'difficulty' => 'Level 1 - Basic Checks',
                    'hint' => 'Try modifying gameStats values before they get sent. The browser console is your friend.'
                ]
            ];
        } else {
            // Normal success response
            $response = [
                'success' => true, 
                'id' => $newId,
                'message' => 'Score submitted successfully!'
            ];
        }
        
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
 * Check for suspicious activity without blocking submissions
 * 
 * @param string $name Player name
 * @param int $score Score value
 * @param string $token Verification token (optional)
 * @param int $clientTimestamp Client timestamp (optional)
 * @param string $stats Game statistics (optional)
 * @param string $clientIP Client IP address
 * @param string $userAgent User agent string
 * @return array Suspicion result ['suspicious' => bool, 'reason' => string]
 */
function checkSuspiciousActivity($name, $score, $token, $clientTimestamp, $stats, $clientIP, $userAgent) {
    $reasons = [];
    
    // 1. Check for extremely high scores
    if ($score > 5000) {
        $reasons[] = "Unusually high score: {$score}";
    }
    
    // 2. Check for missing token or stats
    if (empty($token) || empty($stats)) {
        $reasons[] = "Missing verification data";
    }
    
    // 3. If we have stats, check if they make sense
    if (!empty($stats)) {
        $parts = explode(':', $stats);
        $playTime = (int)($parts[0] ?? 0);
        $jumps = (int)($parts[1] ?? 0);
        $obstacles = (int)($parts[2] ?? 0);
        
        // Calculate expected game time (score is accumulated at 0.6 points per frame at 60fps)
        $expectedTimeMs = ($score / 0.6) * (1000 / 60);
        
        // If play time is too short for score, it's suspicious
        if ($playTime < $expectedTimeMs * 0.5) {
            $reasons[] = "Play time too short: {$playTime}ms for score {$score}";
        }
        
        // Check for unreasonable jump count
        if ($jumps > 0 && $jumps < ($score / 100)) {
            $reasons[] = "Too few jumps: {$jumps} for score {$score}";
        }
    }
    
    // 4. Get suspicious words from a basic list (expand as needed)
    $suspiciousWords = ['hack', 'cheat', 'test', 'admin', 'root', 'system'];
    foreach ($suspiciousWords as $word) {
        if (stripos($name, $word) !== false) {
            $reasons[] = "Suspicious name: {$name}";
            break;
        }
    }
    
    // 5. Check for offensive words (additional feature)
    $offensiveWords = ['slur', 'offensive', 'badword']; // Add more as needed
    foreach ($offensiveWords as $word) {
        if (stripos($name, $word) !== false) {
            $reasons[] = "Potentially inappropriate name";
            break;
        }
    }
    
    // Return the result
    $isSuspicious = count($reasons) > 0;
    return [
        'suspicious' => $isSuspicious,
        'reason' => $isSuspicious ? implode("; ", $reasons) : "None"
    ];
}