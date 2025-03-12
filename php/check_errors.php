<?php
// Enable error display
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

echo "<h1>PHP Error Log Check</h1>";

// Check for error logs
$logs = [
    __DIR__ . '/score_errors.log',
    '/var/log/apache2/error.log',
    '/var/log/httpd/error_log',
    '/var/log/php_errors.log'
];

foreach ($logs as $log) {
    echo "<h2>Checking: " . htmlspecialchars($log) . "</h2>";
    
    if (file_exists($log) && is_readable($log)) {
        echo "<p>Log file exists and is readable.</p>";
        
        // Get the last 20 lines of the log
        $lines = [];
        $file = new SplFileObject($log);
        $file->seek(PHP_INT_MAX); // Seek to end of file
        $lastLine = $file->key(); // Get total lines
        
        $start = max(0, $lastLine - 20); // Get last 20 lines
        $file->seek($start);
        
        echo "<pre>";
        while (!$file->eof()) {
            echo htmlspecialchars($file->fgets());
        }
        echo "</pre>";
    } else {
        echo "<p>Log file does not exist or is not readable.</p>";
    }
}

// Check if submissions log exists
$submissionsLog = __DIR__ . '/score_submissions.log';
if (file_exists($submissionsLog) && is_readable($submissionsLog)) {
    echo "<h2>Recent Score Submissions</h2>";
    
    // Get the last 10 lines of the submissions log
    $lines = [];
    $file = new SplFileObject($submissionsLog);
    $file->seek(PHP_INT_MAX);
    $lastLine = $file->key();
    
    $start = max(0, $lastLine - 10);
    $file->seek($start);
    
    echo "<pre>";
    while (!$file->eof()) {
        echo htmlspecialchars($file->fgets());
    }
    echo "</pre>";
} else {
    echo "<p>Score submissions log not found.</p>";
}

// Check database structure
echo "<h2>Database Table Structure</h2>";

try {
    require_once('config.php');
    
    $pdo = new PDO("mysql:host={$DB_CONFIG['host']};dbname={$DB_CONFIG['database']};charset=utf8mb4", 
                  $DB_CONFIG['user'], 
                  $DB_CONFIG['password']);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Check highscores table structure
    $stmt = $pdo->query("DESCRIBE jbcave_highscores");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "<h3>jbcave_highscores table structure:</h3>";
    echo "<table border='1'>";
    echo "<tr><th>Field</th><th>Type</th><th>Null</th><th>Key</th><th>Default</th><th>Extra</th></tr>";
    
    foreach ($columns as $col) {
        echo "<tr>";
        foreach ($col as $key => $value) {
            echo "<td>" . htmlspecialchars($value ?? 'NULL') . "</td>";
        }
        echo "</tr>";
    }
    echo "</table>";
    
} catch (PDOException $e) {
    echo "<p>Database error: " . htmlspecialchars($e->getMessage()) . "</p>";
}
?>