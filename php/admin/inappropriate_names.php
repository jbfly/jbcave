<?php
$flaggedWords = [];
// Simple admin password protection
session_start();

// Check if already logged in
$is_authenticated = isset($_SESSION['admin_auth']) && $_SESSION['admin_auth'] === true;

if (!$is_authenticated) {
    header("Location: index.php");
    exit;
}

// Load configuration
require_once('../config.php');

// Message system
$message = '';
$message_type = '';

// Connect to database
try {
    $pdo = new PDO("mysql:host={$DB_CONFIG['host']};dbname={$DB_CONFIG['database']};charset=utf8mb4", 
                  $DB_CONFIG['user'], 
                  $DB_CONFIG['password']);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Handle actions
    if (isset($_POST['action'])) {
        if ($_POST['action'] === 'delete' && isset($_POST['id'])) {
            $id = (int)$_POST['id'];
            $stmt = $pdo->prepare("DELETE FROM jbcave_highscores WHERE id = ?");
            $stmt->execute([$id]);
            $message = "Score with ID $id has been deleted.";
            $message_type = 'success';
        }
        else if ($_POST['action'] === 'censor' && isset($_POST['id']) && isset($_POST['new_name'])) {
            $id = (int)$_POST['id'];
            $newName = substr(htmlspecialchars(trim($_POST['new_name'])), 0, 20);
            
            if (!empty($newName)) {
                $stmt = $pdo->prepare("UPDATE jbcave_highscores SET player_name = ? WHERE id = ?");
                $stmt->execute([$newName, $id]);
                $message = "Username has been censored.";
                $message_type = 'success';
            } else {
                $message = "New name cannot be empty.";
                $message_type = 'error';
            }
        }
    }
    
    // Search functionality
    $search = isset($_GET['search']) ? $_GET['search'] : '';
    $whereClause = '';
    $params = [];
    
    if (!empty($search)) {
        $whereClause = "WHERE player_name LIKE ?";
        $params[] = "%$search%";
    }
    
    // Get recent scores with paging
    $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $perPage = 20;
    $offset = ($page - 1) * $perPage;
    
    // Count total for pagination
    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM jbcave_highscores $whereClause");
    $countStmt->execute($params);
    $totalScores = $countStmt->fetchColumn();
    $totalPages = ceil($totalScores / $perPage);
    
    // Get scores for current page
    $stmt = $pdo->prepare("
        SELECT id, player_name, score, date_added, ip_address, flagged
        FROM jbcave_highscores
        $whereClause
        ORDER BY date_added DESC
        LIMIT $perPage OFFSET $offset
    ");
    $stmt->execute($params);
    $scores = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
// Import from a separate configuration file
if (file_exists(__DIR__ . '/word_list_config.php')) {
    include(__DIR__ . '/word_list_config.php');
} else {
    // Default minimal list if config doesn't exist
    $flaggedWords = ['profane', 'offensive', 'inappropriate'];
}
    
} catch (PDOException $e) {
    $db_error = "Database error: " . $e->getMessage();
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Username Management - JBCave Admin</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }
        h1, h2 {
            color: #2c3e50;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .message {
            padding: 10px;
            margin-bottom: 20px;
            border-radius: 4px;
        }
        .success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .search-form {
            margin-bottom: 20px;
            display: flex;
        }
        .search-form input[type="text"] {
            flex-grow: 1;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px 0 0 4px;
        }
        .search-form button {
            padding: 8px 16px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 0 4px 4px 0;
            cursor: pointer;
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
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        .highlight {
            background-color: #ffe0e0;
        }
        .actions {
            display: flex;
            gap: 5px;
        }
        .btn {
            padding: 5px 10px;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            text-decoration: none;
            font-size: 12px;
            display: inline-block;
        }
        .btn-delete {
            background-color: #e74c3c;
        }
        .btn-edit {
            background-color: #f39c12;
        }
        .pagination {
            display: flex;
            justify-content: center;
            margin-top: 20px;
        }
        .pagination a, .pagination span {
            padding: 8px 16px;
            margin: 0 4px;
            border: 1px solid #ddd;
            text-decoration: none;
            color: #3498db;
        }
        .pagination a:hover {
            background-color: #ddd;
        }
        .pagination .active {
            background-color: #3498db;
            color: white;
            border: 1px solid #3498db;
        }
        .nav {
            margin-bottom: 20px;
        }
        .nav a {
            margin-right: 10px;
            color: #3498db;
            text-decoration: none;
        }
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.7);
            z-index: 1000;
        }
        .modal-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: white;
            padding: 20px;
            border-radius: 5px;
            width: 300px;
        }
        .close {
            position: absolute;
            top: 10px;
            right: 10px;
            font-size: 20px;
            cursor: pointer;
        }
        .censored {
            background-color: #fffde7;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Username Management</h1>
        
        <div class="nav">
            <a href="index.php">← Back to Dashboard</a>
            <a href="inappropriate_names.php">All Names</a>
            <a href="inappropriate_names.php?search=flagged">Flagged Scores</a>
            <a href="?logout=1">Logout</a>
        </div>
        
        <?php if (isset($message) && !empty($message)): ?>
            <div class="message <?php echo $message_type; ?>"><?php echo $message; ?></div>
        <?php endif; ?>
        
        <?php if (isset($db_error)): ?>
            <div class="message error"><?php echo $db_error; ?></div>
        <?php endif; ?>
        
        <h2>Search Usernames</h2>
        <form class="search-form" method="get">
            <input type="text" name="search" placeholder="Search usernames..." value="<?php echo htmlspecialchars($search); ?>">
            <button type="submit">Search</button>
        </form>
        
        <?php if (count($scores) > 0): ?>
            <h2>User Scores</h2>
            
            <?php if (!empty($search)): ?>
                <p>Showing results for: <strong><?php echo htmlspecialchars($search); ?></strong></p>
            <?php endif; ?>
            
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Score</th>
                        <th>Date</th>
                        <th>IP Address</th>
                        <th>Flagged</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($scores as $score): 
                        $nameClass = ''; 
                        
                        // Check for flagged words
                        foreach ($flaggedWords as $word) {
                            if (stripos($score['player_name'], $word) !== false) {
                                $nameClass = 'highlight';
                                break;
                            }
                        }
                        
                        // Also highlight flagged scores
                        if ($score['flagged']) {
                            $nameClass = 'highlight';
                        }
                    ?>
                        <tr class="<?php echo $nameClass; ?>">
                            <td><?php echo $score['id']; ?></td>
                            <td><?php echo htmlspecialchars($score['player_name']); ?></td>
                            <td><?php echo number_format($score['score']); ?></td>
                            <td><?php echo $score['date_added']; ?></td>
                            <td><?php echo $score['ip_address']; ?></td>
                            <td><?php echo $score['flagged'] ? 'Yes' : 'No'; ?></td>
                            <td class="actions">
                                <button class="btn btn-edit" onclick="openEditModal(<?php echo $score['id']; ?>, '<?php echo addslashes(htmlspecialchars($score['player_name'])); ?>')">Censor</button>
                                <form method="post" style="display:inline;" onsubmit="return confirm('Are you sure you want to delete this score?');">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="id" value="<?php echo $score['id']; ?>">
                                    <button type="submit" class="btn btn-delete">Delete</button>
                                </form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            
            <!-- Pagination -->
            <?php if ($totalPages > 1): ?>
                <div class="pagination">
                    <?php for ($i = 1; $i <= $totalPages; $i++): ?>
                        <?php if ($i == $page): ?>
                            <span class="active"><?php echo $i; ?></span>
                        <?php else: ?>
                            <a href="?page=<?php echo $i; ?><?php echo !empty($search) ? '&search=' . urlencode($search) : ''; ?>"><?php echo $i; ?></a>
                        <?php endif; ?>
                    <?php endfor; ?>
                </div>
            <?php endif; ?>
            
        <?php else: ?>
            <p>No scores found.</p>
        <?php endif; ?>
    </div>
    
    <!-- Edit Modal -->
    <div id="editModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal()">&times;</span>
            <h3>Censor Username</h3>
            <form method="post">
                <input type="hidden" name="action" value="censor">
                <input type="hidden" name="id" id="edit-id">
                <p>Original name: <span id="original-name"></span></p>
                <p>
                    <label for="new-name">New name:</label><br>
                    <input type="text" id="new-name" name="new_name" style="width: 100%; padding: 8px; margin-top: 5px;">
                </p>
                <p>
                    <button type="submit" style="background: #3498db; color: white; border: none; padding: 8px 16px; cursor: pointer; width: 100%;">Save Changes</button>
                </p>
            </form>
            <div>
                <p>Quick replacements:</p>
                <button onclick="setReplacement('[CENSORED]')" class="btn btn-edit">CENSORED</button>
                <button onclick="setReplacement('Player" + Math.floor(Math.random() * 1000) + "')" class="btn btn-edit">Random Player</button>
                <button onclick="setReplacement('👀')" class="btn btn-edit">👀</button>
            </div>
        </div>
    </div>
    
    <script>
        // Modal functionality
        function openEditModal(id, name) {
            document.getElementById('edit-id').value = id;
            document.getElementById('original-name').textContent = name;
            document.getElementById('new-name').value = name;
            document.getElementById('editModal').style.display = 'block';
        }
        
        function closeModal() {
            document.getElementById('editModal').style.display = 'none';
        }
        
        function setReplacement(value) {
            document.getElementById('new-name').value = value;
        }
        
        // Close modal when clicking outside
        window.onclick = function(event) {
            const modal = document.getElementById('editModal');
            if (event.target == modal) {
                closeModal();
            }
        }
    </script>
</body>
</html>