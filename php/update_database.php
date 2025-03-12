<?php
// Enable error display
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

echo "<h1>Database Update Script</h1>";

// Load database configuration
require_once('config.php');

try {
    // Connect to database
    $pdo = new PDO("mysql:host={$DB_CONFIG['host']};dbname={$DB_CONFIG['database']};charset=utf8mb4", 
                  $DB_CONFIG['user'], 
                  $DB_CONFIG['password']);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "<p>Connected to database successfully.</p>";
    
    // Check if the ip_address column exists
    $stmt = $pdo->query("SHOW COLUMNS FROM jbcave_highscores LIKE 'ip_address'");
    $ipAddressExists = ($stmt->rowCount() > 0);
    
    if (!$ipAddressExists) {
        echo "<p>Adding ip_address column...</p>";
        $pdo->exec("ALTER TABLE jbcave_highscores ADD COLUMN ip_address VARCHAR(45) DEFAULT NULL");
        echo "<p>✅ ip_address column added successfully.</p>";
    } else {
        echo "<p>✅ ip_address column already exists.</p>";
    }
    
    // Check if the flagged column exists
    $stmt = $pdo->query("SHOW COLUMNS FROM jbcave_highscores LIKE 'flagged'");
    $flaggedExists = ($stmt->rowCount() > 0);
    
    if (!$flaggedExists) {
        echo "<p>Adding flagged column...</p>";
        $pdo->exec("ALTER TABLE jbcave_highscores ADD COLUMN flagged TINYINT(1) NOT NULL DEFAULT 0");
        echo "<p>✅ flagged column added successfully.</p>";
    } else {
        echo "<p>✅ flagged column already exists.</p>";
    }
    
    // Create suspicion_details table if it doesn't exist
    $stmt = $pdo->query("SHOW TABLES LIKE 'suspicion_details'");
    $tableExists = ($stmt->rowCount() > 0);
    
    if (!$tableExists) {
        echo "<p>Creating suspicion_details table...</p>";
        $pdo->exec("CREATE TABLE suspicion_details (
            id INT AUTO_INCREMENT PRIMARY KEY,
            score_id INT,
            reason VARCHAR(255),
            user_agent TEXT,
            stats TEXT,
            token TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (score_id) REFERENCES jbcave_highscores(id) ON DELETE CASCADE
        )");
        echo "<p>✅ suspicion_details table created successfully.</p>";
    } else {
        echo "<p>✅ suspicion_details table already exists.</p>";
    }
    
    echo "<h2>Database is now up-to-date!</h2>";
    echo "<p>You can now use the new flagging features.</p>";
    echo "<p><a href=\"check_errors.php\">Check for errors</a></p>";
    
} catch (PDOException $e) {
    echo "<p>❌ Database error: " . htmlspecialchars($e->getMessage()) . "</p>";
    echo "<p>Make sure your MySQL user has ALTER TABLE privileges.</p>";
}
?>