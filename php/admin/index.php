<?php
// Simple admin password protection
session_start();

// Super simple authentication - not secure but good enough for this demo
// In a real application, you'd want proper authentication
$admin_password = "jbcave123"; // Change this!

// Check if already logged in
$is_authenticated = isset($_SESSION['admin_auth']) && $_SESSION['admin_auth'] === true;

// Handle login form submission
if (isset($_POST['password'])) {
    if ($_POST['password'] === $admin_password) {
        $_SESSION['admin_auth'] = true;
        $is_authenticated = true;
    } else {
        $login_error = "Incorrect password";
    }
}

// Handle logout
if (isset($_GET['logout'])) {
    $_SESSION['admin_auth'] = false;
    $is_authenticated = false;
    header("Location: index.php");
    exit;
}

// Actions for removing/unflagging scores
if ($is_authenticated) {
    // Load configuration
    require_once('../config.php');
    
    // Connect to database
    try {
        $pdo = new PDO("mysql:host={$DB_CONFIG['host']};dbname={$DB_CONFIG['database']};charset=utf8mb4", 
                      $DB_CONFIG['user'], 
                      $DB_CONFIG['password']);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // Handle actions
        if (isset($_GET['action'])) {
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            
            if ($_GET['action'] === 'unflag' && $id > 0) {
                // Unflag a score
                $stmt = $pdo->prepare("UPDATE jbcave_highscores SET flagged = 0 WHERE id = ?");
                $stmt->execute([$id]);
                $message = "Score ID $id has been unflagged.";
            }
            else if ($_GET['action'] === 'delete' && $id > 0) {
                // Delete a score
                $stmt = $pdo->prepare("DELETE FROM jbcave_highscores WHERE id = ?");
                $stmt->execute([$id]);
                $message = "Score ID $id has been deleted.";
            }
            else if ($_GET['action'] === 'delete_all_flagged') {
                // Delete all flagged scores
                $stmt = $pdo->prepare("DELETE FROM jbcave_highscores WHERE flagged = 1");
                $count = $stmt->execute();
                $message = "All flagged scores have been deleted.";
            }
        }
        
        // Get flagged scores
        $flaggedScores = $pdo->query("
            SELECT h.*, 
                   (SELECT COUNT(*) FROM jbcave_highscores WHERE ip_address = h.ip_address) as ip_count
            FROM jbcave_highscores h 
            WHERE h.flagged = 1 
            ORDER BY h.score DESC
        ")->fetchAll(PDO::FETCH_ASSOC);
        
        // Get suspicion details for flagged scores
        $scoreDetails = [];
        if (count($flaggedScores) > 0) {
            // Check if suspicion_details table exists
            $tableExists = $pdo->query("SHOW TABLES LIKE 'suspicion_details'")->fetchColumn();
            
            if ($tableExists) {
                $scoreIds = array_column($flaggedScores, 'id');
                $idList = implode(',', $scoreIds);
                
                if (!empty($idList)) {
                    $detailsQuery = $pdo->query("
                        SELECT * FROM suspicion_details
                        WHERE score_id IN ($idList)
                    ");
                    
                    while ($row = $detailsQuery->fetch(PDO::FETCH_ASSOC)) {
                        $scoreDetails[$row['score_id']] = $row;
                    }
                }
            }
        }
        
        // Get top player names by IP
        $playersByIP = $pdo->query("
            SELECT ip_address, GROUP_CONCAT(DISTINCT player_name SEPARATOR ', ') as player_names,
                   COUNT(*) as submission_count
            FROM jbcave_highscores
            WHERE ip_address IS NOT NULL
            GROUP BY ip_address
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC
            LIMIT 20
        ")->fetchAll(PDO::FETCH_ASSOC);
        
        // Get global statistics
        $stats = [
            'total_scores' => $pdo->query("SELECT COUNT(*) FROM jbcave_highscores")->fetchColumn(),
            'flagged_scores' => $pdo->query("SELECT COUNT(*) FROM jbcave_highscores WHERE flagged = 1")->fetchColumn(),
            'unique_players' => $pdo->query("SELECT COUNT(DISTINCT player_name) FROM jbcave_highscores")->fetchColumn(),
            'unique_ips' => $pdo->query("SELECT COUNT(DISTINCT ip_address) FROM jbcave_highscores WHERE ip_address IS NOT NULL")->fetchColumn(),
            'avg_score' => $pdo->query("SELECT AVG(score) FROM jbcave_highscores")->fetchColumn(),
            'max_score' => $pdo->query("SELECT MAX(score) FROM jbcave_highscores")->fetchColumn()
        ];
        
    } catch (PDOException $e) {
        $db_error = "Database error: " . $e->getMessage();
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JBCave Admin Dashboard</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }
        h1 {
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .login-form {
            max-width: 400px;
            margin: 100px auto;
            padding: 20px;
            background: white;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        input[type="password"] {
            width: 100%;
            padding: 10px;
            margin: 10px 0;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        button, .btn {
            background: #3498db;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 5px 0;
        }
        button:hover, .btn:hover {
            background: #2980b9;
        }
        .btn-danger {
            background: #e74c3c;
        }
        .btn-danger:hover {
            background: #c0392b;
        }
        .btn-warning {
            background: #f1c40f;
            color: #333;
        }
        .btn-warning:hover {
            background: #f39c12;
        }
        .btn-success {
            background: #2ecc71;
        }
        .btn-success:hover {
            background: #27ae60;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        table, th, td {
            border: 1px solid #ddd;
        }
        th, td {
            padding: 12px;
            text-align: left;
        }
        th {
            background-color: #f2f2f2;
            color: #333;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        tr:hover {
            background-color: #f1f1f1;
        }
        .flagged {
            color: #e74c3c;
            font-weight: bold;
        }
        .stats-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .stat-card {
            background: white;
            border-radius: 5px;
            padding: 15px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: #3498db;
            margin: 10px 0;
        }
        .details-toggle {
            cursor: pointer;
            color: #3498db;
            text-decoration: underline;
        }
        .score-details {
            display: none;
            background: #f9f9f9;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
        }
        .card {
            background: white;
            border-radius: 5px;
            padding: 15px;
            margin: 20px 0;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .error {
            color: #e74c3c;
            font-weight: bold;
        }
        .success {
            color: #2ecc71;
            font-weight: bold;
        }
        .tabs {
            display: flex;
            margin-bottom: 20px;
            border-bottom: 2px solid #ddd;
        }
        .tab {
            padding: 10px 15px;
            cursor: pointer;
            margin-right: 5px;
        }
        .tab.active {
            border-bottom: 3px solid #3498db;
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
    </style>
</head>
<body>
    <?php if (!$is_authenticated): ?>
        <!-- Login Form -->
        <div class="login-form">
            <h2>JBCave Admin Login</h2>
            <?php if (isset($login_error)): ?>
                <p class="error"><?php echo $login_error; ?></p>
            <?php endif; ?>
            <form method="post">
                <input type="password" name="password" placeholder="Enter admin password" required>
                <button type="submit">Login</button>
            </form>
        </div>
    <?php else: ?>
        <!-- Admin Dashboard -->
        <div class="container">
            <h1>JBCave Admin Dashboard</h1>
            
            <div class="tabs">
                <div class="tab active" data-tab="flagged">Flagged Scores</div>
                <div class="tab" data-tab="players">Player Analysis</div>
                <div class="tab" data-tab="stats">Game Statistics</div>
            </div>
            
            <?php if (isset($db_error)): ?>
                <p class="error"><?php echo $db_error; ?></p>
            <?php endif; ?>
            
            <?php if (isset($message)): ?>
                <p class="success"><?php echo $message; ?></p>
            <?php endif; ?>
            
            <!-- Flagged Scores Tab -->
            <div class="tab-content active" id="flagged-tab">
                <h2>Flagged Scores <span class="flagged">(<?php echo count($flaggedScores); ?>)</span></h2>
                
                <?php if (count($flaggedScores) > 0): ?>
                    <p>
                        <a href="?action=delete_all_flagged" class="btn btn-danger" onclick="return confirm('Are you sure you want to delete ALL flagged scores?')">
                            Delete All Flagged Scores
                        </a>
                    </p>
                    
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Player</th>
                                <th>Score</th>
                                <th>Date</th>
                                <th>IP Address</th>
                                <th>IP Count</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($flaggedScores as $score): ?>
                                <tr>
                                    <td><?php echo $score['id']; ?></td>
                                    <td><?php echo htmlspecialchars($score['player_name']); ?></td>
                                    <td><?php echo number_format($score['score']); ?></td>
                                    <td><?php echo $score['date_added']; ?></td>
                                    <td><?php echo $score['ip_address']; ?></td>
                                    <td><?php echo $score['ip_count']; ?></td>
                                    <td>
                                        <a href="?action=unflag&id=<?php echo $score['id']; ?>" class="btn btn-success">Unflag</a>
                                        <a href="?action=delete&id=<?php echo $score['id']; ?>" class="btn btn-danger" onclick="return confirm('Are you sure?')">Delete</a>
                                        
                                        <?php if (isset($scoreDetails[$score['id']])): ?>
                                            <div class="details-toggle" onclick="toggleDetails(<?php echo $score['id']; ?>)">Show Details</div>
                                            <div id="details-<?php echo $score['id']; ?>" class="score-details">
                                                <p><strong>Reason:</strong> <?php echo htmlspecialchars($scoreDetails[$score['id']]['reason']); ?></p>
                                                <p><strong>User Agent:</strong> <?php echo htmlspecialchars($scoreDetails[$score['id']]['user_agent']); ?></p>
                                                <p><strong>Stats:</strong> <?php echo htmlspecialchars($scoreDetails[$score['id']]['stats']); ?></p>
                                                <p><strong>Token:</strong> <?php echo htmlspecialchars($scoreDetails[$score['id']]['token']); ?></p>
                                                <p><strong>Timestamp:</strong> <?php echo $scoreDetails[$score['id']]['timestamp']; ?></p>
                                            </div>
                                        <?php endif; ?>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php else: ?>
                    <p>No flagged scores found.</p>
                <?php endif; ?>
            </div>
            
            <!-- Player Analysis Tab -->
            <div class="tab-content" id="players-tab">
                <h2>Player Analysis</h2>
                
                <div class="card">
                    <h3>Users Sharing IPs</h3>
                    <?php if (count($playersByIP) > 0): ?>
                        <table>
                            <thead>
                                <tr>
                                    <th>IP Address</th>
                                    <th>Player Names</th>
                                    <th>Submissions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($playersByIP as $ipData): ?>
                                    <tr>
                                        <td><?php echo $ipData['ip_address']; ?></td>
                                        <td><?php echo htmlspecialchars($ipData['player_names']); ?></td>
                                        <td><?php echo $ipData['submission_count']; ?></td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php else: ?>
                        <p>No players sharing IPs found.</p>
                    <?php endif; ?>
                </div>
                
                <div class="card">
                    <h3>Name Search</h3>
                    <form method="get">
                        <input type="text" name="search" placeholder="Search by name..." value="<?php echo isset($_GET['search']) ? htmlspecialchars($_GET['search']) : ''; ?>">
                        <button type="submit">Search</button>
                    </form>
                    
                    <?php if (isset($_GET['search']) && !empty($_GET['search'])): 
                        $search = '%' . $_GET['search'] . '%';
                        $stmt = $pdo->prepare("
                            SELECT id, player_name, score, date_added, ip_address, flagged
                            FROM jbcave_highscores
                            WHERE player_name LIKE ?
                            ORDER BY score DESC
                        ");
                        $stmt->execute([$search]);
                        $searchResults = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    ?>
                        <h4>Search Results for "<?php echo htmlspecialchars($_GET['search']); ?>"</h4>
                        <?php if (count($searchResults) > 0): ?>
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Player</th>
                                        <th>Score</th>
                                        <th>Date</th>
                                        <th>IP Address</th>
                                        <th>Flagged</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php foreach ($searchResults as $result): ?>
                                        <tr>
                                            <td><?php echo $result['id']; ?></td>
                                            <td><?php echo htmlspecialchars($result['player_name']); ?></td>
                                            <td><?php echo number_format($result['score']); ?></td>
                                            <td><?php echo $result['date_added']; ?></td>
                                            <td><?php echo $result['ip_address']; ?></td>
                                            <td><?php echo $result['flagged'] ? 'Yes' : 'No'; ?></td>
                                            <td>
                                                <?php if ($result['flagged']): ?>
                                                    <a href="?action=unflag&id=<?php echo $result['id']; ?>" class="btn btn-success">Unflag</a>
                                                <?php else: ?>
                                                    <a href="?action=flag&id=<?php echo $result['id']; ?>" class="btn btn-warning">Flag</a>
                                                <?php endif; ?>
                                                <a href="?action=delete&id=<?php echo $result['id']; ?>" class="btn btn-danger" onclick="return confirm('Are you sure?')">Delete</a>
                                            </td>
                                        </tr>
                                    <?php endforeach; ?>
                                </tbody>
                            </table>
                        <?php else: ?>
                            <p>No results found.</p>
                        <?php endif; ?>
                    <?php endif; ?>
                </div>
            </div>
            
            <!-- Statistics Tab -->
            <div class="tab-content" id="stats-tab">
                <h2>Game Statistics</h2>
                
                <div class="stats-container">
                    <div class="stat-card">
                        <h3>Total Scores</h3>
                        <div class="stat-value"><?php echo number_format($stats['total_scores']); ?></div>
                    </div>
                    
                    <div class="stat-card">
                        <h3>Flagged Scores</h3>
                        <div class="stat-value"><?php echo number_format($stats['flagged_scores']); ?></div>
                    </div>
                    
                    <div class="stat-card">
                        <h3>Unique Players</h3>
                        <div class="stat-value"><?php echo number_format($stats['unique_players']); ?></div>
                    </div>
                    
                    <div class="stat-card">
                        <h3>Unique IPs</h3>
                        <div class="stat-value"><?php echo number_format($stats['unique_ips']); ?></div>
                    </div>
                    
                    <div class="stat-card">
                        <h3>Average Score</h3>
                        <div class="stat-value"><?php echo number_format($stats['avg_score']); ?></div>
                    </div>
                    
                    <div class="stat-card">
                        <h3>Highest Score</h3>
                        <div class="stat-value"><?php echo number_format($stats['max_score']); ?></div>
                    </div>
                </div>
                
                <!-- Score Distribution (Future enhancement) -->
            </div>
            
            <p><a href="?logout=1" class="btn">Logout</a></p>
        </div>
        
        <script>
            // Toggle details for flagged scores
            function toggleDetails(id) {
                const details = document.getElementById('details-' + id);
                if (details.style.display === 'block') {
                    details.style.display = 'none';
                } else {
                    details.style.display = 'block';
                }
            }
            
            // Tab switching
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    // Remove active class from all tabs
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    
                    // Add active class to clicked tab
                    this.classList.add('active');
                    document.getElementById(this.dataset.tab + '-tab').classList.add('active');
                });
            });
        </script>
    <?php endif; ?>
</body>
</html>