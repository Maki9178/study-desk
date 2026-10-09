param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskUrl = 'http://127.0.0.1:18763'
$taskHasher = [Security.Cryptography.SHA256]::Create()
try {
    $taskInstance = ([BitConverter]::ToString($taskHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($taskRoot)))).Replace('-', '').ToLowerInvariant()
} finally { $taskHasher.Dispose() }
function Get-StudyDeskHealth {
    try { Invoke-RestMethod -Uri "$taskUrl/health" -TimeoutSec 2 } catch { $null }
}
$taskHealth = Get-StudyDeskHealth
if ($null -eq $taskHealth) {
    $taskNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -eq $taskNode) { throw 'Node.js is required. Install Node.js LTS from https://nodejs.org, then retry.' }
    $taskProcess = Start-Process -FilePath $taskNode.Source -ArgumentList ('"' + (Join-Path $taskRoot 'server.cjs') + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru
    for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
        Start-Sleep -Milliseconds 200
        $taskHealth = Get-StudyDeskHealth
        if ($null -ne $taskHealth -or $taskProcess.HasExited) { break }
    }
}
if ($null -eq $taskHealth -or $taskHealth.app -ne 'study-desk' -or $taskHealth.instance -ne $taskInstance) {
    throw 'Port 18763 is unavailable or belongs to another copy. Do not change the address: browser data belongs to this fixed origin.'
}
Write-Host "Study Desk is ready: $taskUrl"
if (-not $NoBrowser) { Start-Process $taskUrl }
