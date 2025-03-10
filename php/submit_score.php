<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

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

if (!isset($input['name']) || !isset($input['score'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing required fields']);
    exit;
}

// Sanitize input
$name = substr(htmlspecialchars(trim($input['name'])), 0, 20); // Limit to 20 chars
$score = (int)$input['score'];

if (empty($name) || $score <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid input']);
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
    $stmt->execute([$name, $score]);
    
    // Return success
    echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database error', 'message' => $e->getMessage()]);
}
?>