<?php
/**
 * JBCave Database Configuration Template
 * 
 * INSTRUCTIONS:
 * 1. Copy this file to config.php
 * 2. Update the values with your actual database credentials
 * 3. Make sure config.php is listed in .gitignore to avoid committing sensitive data
 */

// Database configuration
$DB_CONFIG = [
    // Database connection details
    'host'     => 'localhost',
    'database' => 'jbcave_db',
    'user'     => 'jbcave_user',
    'password' => 'your_password_here',
    
    // Set to false to disable database-related features
    // This allows the game to work without a database (using only local storage)
    'enabled'  => true
];
?>