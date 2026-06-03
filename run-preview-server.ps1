# MediNest Pharmacy Local Static Web Server for PWA Preview
# Runs on http://localhost:8080/

$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

Write-Host "=============================================" -ForegroundColor Green
Write-Host "  MEDINEST PHARMACY LOCAL PWA PREVIEW SERVER  " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Starting server at http://localhost:$port/" -ForegroundColor Cyan
Write-Host "Open this URL in Google Chrome or Microsoft Edge to test PWA installation." -ForegroundColor Yellow
Write-Host "Press [Ctrl + C] or close this window to stop the server." -ForegroundColor Red
Write-Host ""

try {
    $listener.Start()
    Write-Host "Server successfully bound to port $port. Listening for connections..." -ForegroundColor Green
    
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "/log-test") {
            $logMsg = $request.QueryString["msg"]
            $status = $request.QueryString["status"]
            Write-Host "[TEST LOG] Status: $status - Message: $logMsg" -ForegroundColor Yellow
            $response.StatusCode = 200
            $response.ContentType = "text/plain"
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("OK")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
            continue
        }
        if ($urlPath -eq "/") {
            $urlPath = "/index.html"
        }
        
        # Build path to requested file
        $filePath = Join-Path $PSScriptRoot $urlPath.TrimStart('/')
        
        if (Test-Path $filePath -PathType Leaf) {
            try {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                
                # Determine Content-Type header
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $contentType = switch ($ext) {
                    ".html" { "text/html; charset=utf-8" }
                    ".css"  { "text/css; charset=utf-8" }
                    ".js"   { "application/javascript; charset=utf-8" }
                    ".json" { "application/json; charset=utf-8" }
                    ".png"  { "image/png" }
                    ".jpg"  { "image/jpeg" }
                    ".jpeg" { "image/jpeg" }
                    ".svg"  { "image/svg+xml" }
                    default { "application/octet-stream" }
                }
                
                $response.ContentType = $contentType
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "[200] $urlPath" -ForegroundColor Green
            } catch {
                $response.StatusCode = 500
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Internal Server Error: $_")
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                Write-Host "[500] $urlPath - $_" -ForegroundColor Red
            }
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("File Not Found: $urlPath")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            Write-Host "[404] $urlPath" -ForegroundColor Red
        }
        
        $response.Close()
    }
} catch {
    Write-Error "Server stopped: $_"
} finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
}
