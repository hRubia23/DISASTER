<?php

declare(strict_types=1);

session_start();

$baseDir = __DIR__;
$dbPath = $baseDir . DIRECTORY_SEPARATOR . 'users.sqlite';

initDb($dbPath);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if ($path === '/api/register' && $method === 'POST') {
    handleRegister($dbPath);
}

if ($path === '/api/login' && $method === 'POST') {
    handleLogin($dbPath);
}

if ($path === '/api/me' && $method === 'GET') {
    handleMe();
}

if ($path === '/api/logout' && $method === 'POST') {
    handleLogout();
}

if ($path === '/') {
    if (isset($_SESSION['user_id'])) {
        serveFile($baseDir . DIRECTORY_SEPARATOR . 'index.html');
    }
    serveFile($baseDir . DIRECTORY_SEPARATOR . 'auth.html');
}

$requested = ltrim($path, '/');
$fullPath = realpath($baseDir . DIRECTORY_SEPARATOR . $requested);
$baseReal = realpath($baseDir);

if ($fullPath && $baseReal && str_starts_with($fullPath, $baseReal) && is_file($fullPath)) {
    serveFile($fullPath);
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo 'Not Found';
exit;

function initDb(string $dbPath): void
{
    $pdo = getPdo($dbPath);
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )'
    );
}

function getPdo(string $dbPath): PDO
{
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    return $pdo;
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function jsonResponse(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function handleRegister(string $dbPath): void
{
    $body = readJsonBody();

    $fullName = trim((string)($body['full_name'] ?? ''));
    $email = strtolower(trim((string)($body['email'] ?? '')));
    $password = (string)($body['password'] ?? '');

    if (mb_strlen($fullName) < 2) {
        jsonResponse(['message' => 'Full name must be at least 2 characters.'], 400);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['message' => 'Please provide a valid email address.'], 400);
    }

    if (strlen($password) < 6) {
        jsonResponse(['message' => 'Password must be at least 6 characters.'], 400);
    }

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    try {
        $pdo = getPdo($dbPath);
        $stmt = $pdo->prepare('INSERT INTO users (full_name, email, password_hash, created_at) VALUES (?, ?, ?, ?)');
        $stmt->execute([$fullName, $email, $passwordHash, gmdate('c')]);
        jsonResponse(['message' => 'Registration successful.'], 201);
    } catch (PDOException $exception) {
        if ($exception->getCode() === '23000') {
            jsonResponse(['message' => 'Email is already registered.'], 409);
        }

        jsonResponse(['message' => 'Registration failed. Please try again.'], 500);
    }
}

function handleLogin(string $dbPath): void
{
    $body = readJsonBody();

    $email = strtolower(trim((string)($body['email'] ?? '')));
    $password = (string)($body['password'] ?? '');

    if ($email === '' || $password === '') {
        jsonResponse(['message' => 'Email and password are required.'], 400);
    }

    $pdo = getPdo($dbPath);
    $stmt = $pdo->prepare('SELECT id, full_name, email, password_hash FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, (string)$user['password_hash'])) {
        jsonResponse(['message' => 'Invalid email or password.'], 401);
    }

    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['full_name'] = (string)$user['full_name'];
    $_SESSION['email'] = (string)$user['email'];

    jsonResponse([
        'message' => 'Login successful.',
        'user' => [
            'id' => $_SESSION['user_id'],
            'full_name' => $_SESSION['full_name'],
            'email' => $_SESSION['email'],
        ],
    ]);
}

function handleMe(): void
{
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(['logged_in' => false]);
    }

    jsonResponse([
        'logged_in' => true,
        'user' => [
            'id' => (int)$_SESSION['user_id'],
            'full_name' => (string)$_SESSION['full_name'],
            'email' => (string)$_SESSION['email'],
        ],
    ]);
}

function handleLogout(): void
{
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'],
            $params['domain'],
            $params['secure'],
            $params['httponly']
        );
    }

    session_destroy();
    jsonResponse(['message' => 'Logged out.']);
}

function serveFile(string $filePath): void
{
    if (!is_file($filePath)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not Found';
        exit;
    }

    $mimeType = mime_content_type($filePath) ?: 'application/octet-stream';
    header('Content-Type: ' . $mimeType);
    readfile($filePath);
    exit;
}
