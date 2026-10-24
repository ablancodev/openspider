<?php
/**
 * OpenSpider SEO - backend proxy.
 * El navegador no puede descargar páginas de otros dominios (CORS), así que este
 * script hace la petición HTTP con cURL y devuelve estado, cabeceras, tiempos y cuerpo.
 * Todo el parseo SEO se hace en el navegador.
 *
 * Seguridad: por defecto solo acepta peticiones desde localhost (es un proxy abierto).
 */

ini_set('serialize_precision', '-1');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$allowRemote = false; // pon a true bajo tu responsabilidad
$remote = $_SERVER['REMOTE_ADDR'] ?? '';
if (!$allowRemote && !in_array($remote, ['127.0.0.1', '::1', 'localhost'], true)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Solo se permite el acceso desde localhost']);
    exit;
}

$in = json_decode(file_get_contents('php://input') ?: '[]', true) ?: [];
$in = array_merge($_GET, $in);
$action = $in['action'] ?? 'fetch';

if ($action === 'ping') {
    echo json_encode(['ok' => true, 'php' => PHP_VERSION, 'curl' => curl_version()['version']]);
    exit;
}

if ($action !== 'fetch') {
    echo json_encode(['ok' => false, 'error' => 'Acción desconocida']);
    exit;
}

$url = trim($in['url'] ?? '');
if (!preg_match('#^https?://#i', $url)) {
    echo json_encode(['ok' => false, 'error' => 'URL no válida']);
    exit;
}

$ua        = $in['ua'] ?? 'Mozilla/5.0 (compatible; OpenSpider/1.0; +http://localhost/)';
$timeout   = max(1, min(120, (int)($in['timeout'] ?? 20)));
$method    = strtoupper($in['method'] ?? 'GET') === 'HEAD' ? 'HEAD' : 'GET';
// body: 0 = nunca, 1 = siempre, 'html' = solo si la respuesta es HTML/XHTML
$bodyMode  = $in['body'] ?? 'html';
$wantBody  = !empty($bodyMode);
$maxBytes  = (int)($in['maxBytes'] ?? 15 * 1024 * 1024);
$extraHdrs = is_array($in['headers'] ?? null) ? $in['headers'] : [];
$auth      = $in['auth'] ?? '';             // "usuario:clave" para HTTP Basic

$respHeaders = [];
$rawHeaderLines = [];
$statusLine = '';
$body = '';
$bytes = 0;
$truncated = false;

$ch = curl_init($url);
$reqHeaders = ['Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language: es-ES,es;q=0.9,en;q=0.8'];
foreach ($extraHdrs as $h) {
    if (is_string($h) && strpos($h, ':') !== false) $reqHeaders[] = $h;
}

$okOpts = curl_setopt_array($ch, [
    CURLOPT_FOLLOWLOCATION => false,   // cada redirección se registra como una URL propia
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_USERAGENT      => $ua,
    CURLOPT_CONNECTTIMEOUT => min(15, $timeout),
    CURLOPT_TIMEOUT        => $timeout,
    CURLOPT_ENCODING       => '',      // acepta gzip/deflate/br
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => 0,
    CURLOPT_HTTPHEADER     => $reqHeaders,
    CURLOPT_NOBODY         => $method === 'HEAD',
    CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$respHeaders, &$rawHeaderLines, &$statusLine) {
        $len = strlen($line);
        $t = trim($line);
        if ($t === '') return $len;
        if (preg_match('#^HTTP/\S+\s+\d+#', $t)) { // nueva respuesta (p.ej. 100 Continue)
            $statusLine = $t;
            $respHeaders = [];
            $rawHeaderLines = [$t];
            return $len;
        }
        $rawHeaderLines[] = $t;
        $p = strpos($t, ':');
        if ($p !== false) {
            $k = strtolower(trim(substr($t, 0, $p)));
            $v = trim(substr($t, $p + 1));
            $respHeaders[$k][] = $v;
        }
        return $len;
    },
    CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$body, &$bytes, &$truncated, &$wantBody, $bodyMode, $maxBytes) {
        $len = strlen($chunk);
        if ($bytes === 0 && $bodyMode === 'html') {
            $ct = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
            $wantBody = $ct === '' || (bool)preg_match('#html|xhtml#i', $ct);
        }
        $bytes += $len;
        if ($wantBody) {
            if (strlen($body) + $len > $maxBytes) {
                $truncated = true;
                return 0; // aborta
            }
            $body .= $chunk;
        }
        return $len;
    },
]);
if (!$okOpts) {
    echo json_encode(['ok' => false, 'url' => $url, 'status' => 0, 'error' => 'Error configurando cURL']);
    exit;
}
// opciones que pueden no estar soportadas por la build de cURL: se fijan aparte
if (defined('CURL_HTTP_VERSION_2TLS')) @curl_setopt($ch, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_2TLS);
if ($auth !== '') {
    curl_setopt($ch, CURLOPT_USERPWD, $auth);
}

$start = microtime(true);
$ok = curl_exec($ch);
$elapsed = microtime(true) - $start;
$err = curl_error($ch);
$errno = curl_errno($ch);
$info = curl_getinfo($ch);
curl_close($ch);

if (!$ok && !$truncated && $errno !== 23) { // 23 = write abortado por nosotros
    echo json_encode([
        'ok' => false,
        'url' => $url,
        'status' => 0,
        'error' => $err ?: 'Sin respuesta',
        'errno' => $errno,
        'responseTime' => round($elapsed, 3),
    ]);
    exit;
}

$status = (int)$info['http_code'];
$ctype = $respHeaders['content-type'][0] ?? ($info['content_type'] ?? '');
$location = $respHeaders['location'][0] ?? '';
if ($location !== '') $location = resolveUrl($url, $location);

$httpVersion = 'HTTP/1.1';
if (preg_match('#^HTTP/(\S+)#', $statusLine, $m)) $httpVersion = 'HTTP/' . $m[1];
$statusText = trim(preg_replace('#^HTTP/\S+\s+\d+\s*#', '', $statusLine));

// Normaliza el cuerpo a UTF-8
$charset = '';
if ($wantBody && $body !== '') {
    if (preg_match('/charset=["\']?([\w-]+)/i', $ctype, $m)) $charset = $m[1];
    elseif (preg_match('/<meta[^>]+charset=["\']?([\w-]+)/i', substr($body, 0, 4096), $m)) $charset = $m[1];
    if ($charset && strcasecmp($charset, 'utf-8') !== 0 && strcasecmp($charset, 'utf8') !== 0) {
        $conv = @mb_convert_encoding($body, 'UTF-8', $charset);
        if ($conv !== false) $body = $conv;
    }
}

echo json_encode([
    'ok'           => true,
    'url'          => $url,
    'status'       => $status,
    'statusText'   => $statusText,
    'httpVersion'  => $httpVersion,
    'headers'      => $respHeaders,
    'rawHeaders'   => implode("\n", $rawHeaderLines),
    'contentType'  => $ctype,
    'charset'      => $charset,
    'location'     => $location,
    'size'         => $bytes,
    'transferred'  => (int)($info['size_download'] ?? $bytes) + (int)($info['header_size'] ?? 0),
    'responseTime' => round((float)$info['total_time'], 3),
    'ttfb'         => round((float)($info['starttransfer_time'] ?? 0), 3),
    'ip'           => $info['primary_ip'] ?? '',
    'truncated'    => $truncated,
    'body'         => $wantBody ? $body : null,
], JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

function resolveUrl(string $base, string $rel): string
{
    if (preg_match('#^[a-z][a-z0-9+.-]*:#i', $rel)) return $rel;
    $b = parse_url($base);
    $scheme = $b['scheme'] ?? 'http';
    $host = $b['host'] ?? '';
    $port = isset($b['port']) ? ':' . $b['port'] : '';
    if (strpos($rel, '//') === 0) return $scheme . ':' . $rel;
    if ($rel !== '' && $rel[0] === '/') return "$scheme://$host$port$rel";
    $path = $b['path'] ?? '/';
    if ($rel !== '' && $rel[0] === '?') return "$scheme://$host$port$path$rel";
    $dir = preg_replace('#/[^/]*$#', '/', $path);
    $full = $dir . $rel;
    $parts = [];
    foreach (explode('/', $full) as $seg) {
        if ($seg === '..') array_pop($parts);
        elseif ($seg !== '.') $parts[] = $seg;
    }
    return "$scheme://$host$port" . implode('/', $parts);
}
