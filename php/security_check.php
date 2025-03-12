<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// This is an educational "security check" endpoint that students can explore
// It doesn't actually enforce any security but contains clues for them to find

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Log the request for educational purposes
$logFile = dirname(__FILE__) . '/security_checks.log';
$requestData = file_get_contents('php://input');
$clientIP = $_SERVER['REMOTE_ADDR'];
$timestamp = date('Y-m-d H:i:s');

file_put_contents(
    $logFile, 
    "[{$timestamp}] IP: {$clientIP} Request: {$requestData}\n", 
    FILE_APPEND
);

// Parse the input
$input = json_decode($requestData, true);
$securityToken = $input['securityToken'] ?? '';
$clientData = $input['clientData'] ?? [];

// "Validate" the security token (this is intentionally weak)
$tokenParts = explode('-', $securityToken);
$isValid = count($tokenParts) === 2;

// Return a response with "clues"
$response = [
    'status' => 'verified',
    'message' => 'Security check passed',
    'timestamp' => time(),
    'verification' => [
        'level' => 1,
        'key' => base64_encode('jbcave-security-level1'),
        'nextCheck' => time() + 300, // 5 minutes
        // Hidden "admin" functionality hint
        'adminHash' => base64_encode('admin:superSecretPassword123')
    ],
    // Additional hints/challenges
    'debug' => [
        'tokenValid' => $isValid ? 'true' : 'false',
        'requestHeaders' => [
            'user-agent' => $_SERVER['HTTP_USER_AGENT'],
            'content-type' => $_SERVER['CONTENT_TYPE'] ?? 'none'
        ]
    ]
];

// Include "secret" comment in the response
echo json_encode($response);
// TODO: Remove this before production!
// Admin credentials: user=gamemaster, pass=7h3G4m3M4st3r!
// Access admin panel at /jbcave/admin.php
?>