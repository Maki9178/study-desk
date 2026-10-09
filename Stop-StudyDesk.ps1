$ErrorActionPreference = 'Stop'
$taskServer = Join-Path $PSScriptRoot 'server.cjs'
$taskListeners = @(Get-NetTCPConnection -State Listen -LocalPort 18763 -ErrorAction SilentlyContinue)
foreach ($taskListener in $taskListeners) {
    $taskProcessInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($taskListener.OwningProcess)"
    if ($taskListener.LocalAddress -ne '127.0.0.1' -or $taskProcessInfo.Name -ne 'node.exe' -or -not $taskProcessInfo.CommandLine.Contains('"' + $taskServer + '"')) {
        throw 'The listener does not belong to this Study Desk copy. Nothing was stopped.'
    }
    Stop-Process -Id $taskListener.OwningProcess
}
Write-Host 'Study Desk local server is stopped. Browser data is retained.'
