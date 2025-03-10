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