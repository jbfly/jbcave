<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Load database configuration
require_once('config.php');

// Validate input
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['name']) || !isset($input['score'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required fields']);
    exit;
}

// Sanitize input
$name = substr(htmlspecialchars(trim($input['name'])), 0, 20); // Limit to 20 chars
$score = (int)$input['score'];

if (empty($name) || $score <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid input']);
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
    echo json_encode(['error' => 'Database error', 'details' => $e->getMessage()]);
}
?>
