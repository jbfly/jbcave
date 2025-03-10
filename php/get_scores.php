<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

// Load database configuration
require_once('config.php');

// Number of scores to return
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
$limit = min(100, max(1, $limit)); // Ensure limit is between 1 and 100

try {
    // Connect to database using config
    $pdo = new PDO("mysql:host={$DB_CONFIG['host']};dbname={$DB_CONFIG['database']};charset=utf8mb4", 
                  $DB_CONFIG['user'], 
                  $DB_CONFIG['password']);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Get top scores
    $stmt = $pdo->prepare('SELECT player_name, score, date_added FROM jbcave_highscores ORDER BY score DESC LIMIT ?');
    $stmt->bindParam(1, $limit, PDO::PARAM_INT);
    $stmt->execute();
    
    $scores = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Return scores as JSON
    echo json_encode(['success' => true, 'scores' => $scores]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error', 'details' => $e->getMessage()]);
}
?>
