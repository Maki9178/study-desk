<#
作业雷达 · 每日提醒脚本

作用：读取「作业雷达」绑定的本地 JSON，输出逾期 / 今日 / 未来 N 天的作业清单，
      可选弹 Windows 通知，可选重新生成 .ics 日历文件。

用法（手动跑一次看效果）：
    powershell -ExecutionPolicy Bypass -File .\每日提醒.ps1 -Days 3 -Toast

注册每天 20:30 自动提醒（需要你手动执行，本脚本不会自己注册计划任务）：
    schtasks /Create /TN "作业雷达每日提醒" /SC DAILY /ST 20:30 /TR "powershell -ExecutionPolicy Bypass -File \"$PWD\每日提醒.ps1\" -Toast"

注意：默认不读取任何网站、不保存任何账号密码，只读本地 JSON。
#>

[CmdletBinding()]
param(
    # 作业雷达导出的 JSON 路径；默认取脚本同目录下的 作业雷达数据.json
    [string]$DataFile,
    # 提前预警天数
    [int]$Days = 3,
    # 弹 Windows 桌面通知
    [switch]$Toast,
    # 弹模态对话框（通知不可用时的兜底）
    [switch]$Popup,
    # 顺便重新生成 .ics
    [switch]$ExportIcs,
    # 只输出文本、不做任何界面动作
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $DataFile) {
    $candidates = @(
        (Join-Path $here '作业雷达提醒数据.json'),
        (Join-Path $here '作业雷达数据.json'),
        (Join-Path $here '作业数据.json')
    )
    $DataFile = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

if (-not $DataFile -or -not (Test-Path -LiteralPath $DataFile)) {
    Write-Host '找不到数据文件。' -ForegroundColor Yellow
    Write-Host '先在「作业雷达 → 设置与导出 → 绑定本地文件」里绑定一次，或手动导出 JSON 放到本脚本同目录。' -ForegroundColor Gray
    if ($Popup) {
        Add-Type -AssemblyName System.Windows.Forms
        [void][System.Windows.Forms.MessageBox]::Show('找不到作业雷达数据文件，先绑定一次再运行提醒。','作业雷达')
    }
    exit 2
}

$raw = Get-Content -LiteralPath $DataFile -Raw -Encoding UTF8
$data = $raw | ConvertFrom-Json
$tasks = @($data.tasks)

$platName = @{}
foreach ($p in @($data.platforms)) { if ($p.id) { $platName[$p.id] = $p.name } }

function Convert-Due([string]$s) {
    if ([string]::IsNullOrWhiteSpace($s)) { return $null }
    try {
        return [datetime]::ParseExact($s, 'yyyy-MM-ddTHH:mm', [System.Globalization.CultureInfo]::InvariantCulture)
    } catch {
        try { return [datetime]::Parse($s, [System.Globalization.CultureInfo]::InvariantCulture) } catch { return $null }
    }
}

$now      = Get-Date
$today0   = $now.Date
$open     = @($tasks | Where-Object { $_.status -ne 'done' })
$late     = @()
$dueToday = @()
$soon     = @()
$noDue    = @()

foreach ($t in $open) {
    $d = Convert-Due $t.due
    if (-not $d) { $noDue += $t; continue }
    if ($d -lt $now) { $late += [pscustomobject]@{ T = $t; D = $d } ; continue }
    # 注意：变量名不能叫 $days，PowerShell 变量不区分大小写，会和参数 $Days 冲突
    $leftDays = [int](($d.Date - $today0).TotalDays)
    if ($leftDays -eq 0) { $dueToday += [pscustomobject]@{ T = $t; D = $d } }
    elseif ($leftDays -le $Days) { $soon += [pscustomobject]@{ T = $t; D = $d } }
}
$late     = @($late     | Sort-Object D)
$dueToday = @($dueToday | Sort-Object D)
$soon     = @($soon     | Sort-Object D)

function Tag($t) {
    $n = $platName[$t.platformId]
    if ($n) { return "[$n] $($t.title)" } else { return $t.title }
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("作业雷达 · $($now.ToString('yyyy-MM-dd HH:mm'))")
if ($late.Count)     { $lines.Add(''); $lines.Add("!! 已逾期 $($late.Count) 项");     foreach ($x in $late)     { $lines.Add("   - $(Tag $x.T)  ($($x.D.ToString('M月d日 HH:mm')))") } }
if ($dueToday.Count) { $lines.Add(''); $lines.Add("*  今天截止 $($dueToday.Count) 项"); foreach ($x in $dueToday) { $lines.Add("   - $(Tag $x.T)  $($x.D.ToString('HH:mm'))") } }
if ($soon.Count)     { $lines.Add(''); $lines.Add(">  $Days 天内 $($soon.Count) 项");  foreach ($x in $soon)     { $lines.Add("   - $(Tag $x.T)  $($x.D.ToString('M月d日 HH:mm'))") } }
if ($noDue.Count)    { $lines.Add(''); $lines.Add("?  未设截止 $($noDue.Count) 项");   foreach ($t in $noDue)    { $lines.Add("   - $(Tag $t)") } }
if ($lines.Count -eq 1) { $lines.Add(''); $lines.Add('没有临期作业。') }

$text = $lines -join [Environment]::NewLine
if (-not $Quiet) { Write-Host $text }

function Get-ToastAppId {
    $ids = @(
        '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe',
        'Microsoft.Windows.PowerShell'
    )
    foreach ($id in $ids) {
        try {
            [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
            return $id
        } catch { }
    }
    return $null
}

if ($Toast) {
    $shown = $false
    try {
        [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
        [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]

        $head = if ($late.Count) { "作业雷达：$($late.Count) 项已逾期" }
                elseif ($dueToday.Count) { "作业雷达：今天 $($dueToday.Count) 项截止" }
                elseif ($soon.Count) { "作业雷达：$Days 天内 $($soon.Count) 项" }
                else { '作业雷达：没有临期作业' }

        $bodyItems = @()
        foreach ($x in $late)     { $bodyItems += "$(Tag $x.T) · 已逾期" }
        foreach ($x in $dueToday) { $bodyItems += "$(Tag $x.T) · 今天 $($x.D.ToString('HH:mm'))" }
        foreach ($x in $soon)     { $bodyItems += "$(Tag $x.T) · $($x.D.ToString('M/d HH:mm'))" }
        if (-not $bodyItems.Count) { $bodyItems += '暂无临期作业，保持节奏。' }
        $body = ($bodyItems | Select-Object -First 4) -join "`n"
        if ($bodyItems.Count -gt 4) { $body += "`n…还有 $($bodyItems.Count - 4) 项" }

        $esc = { param($s) [System.Security.SecurityElement]::Escape([string]$s) }
        $xmlText = '<toast><visual><binding template="ToastGeneric"><text>{0}</text><text>{1}</text></binding></visual></toast>' -f (& $esc $head), (& $esc $body)

        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($xmlText)
        $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
        $appId = Get-ToastAppId
        if ($appId) {
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
            $shown = $true
        }
    } catch { $shown = $false }

    if (-not $shown -and $Popup) {
        try {
            Add-Type -AssemblyName System.Windows.Forms
            [void][System.Windows.Forms.MessageBox]::Show($text, '作业雷达')
            $shown = $true
        } catch { }
    }
    if (-not $shown -and -not $Quiet) { Write-Host '(桌面通知不可用，已在控制台输出)' -ForegroundColor DarkGray }
}

if ($ExportIcs) {
    function Esc-Ics([string]$s) {
        if ($null -eq $s) { return '' }
        return $s.Replace('\', '\\').Replace(';', '\;').Replace(',', '\,').Replace("`r`n", '\n').Replace("`n", '\n')
    }
    $out = New-Object System.Collections.Generic.List[string]
    $out.Add('BEGIN:VCALENDAR'); $out.Add('VERSION:2.0'); $out.Add('PRODID:-//ZuoyeRadar//CN')
    $out.Add('CALSCALE:GREGORIAN'); $out.Add('METHOD:PUBLISH'); $out.Add('X-WR-CALNAME:作业雷达')
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
    foreach ($t in $open) {
        $d = Convert-Due $t.due
        if (-not $d) { continue }
        $end = $d.AddMinutes(30)
        $out.Add('BEGIN:VEVENT')
        $out.Add("UID:$($t.id)@zuoye-radar")
        $out.Add("DTSTAMP:$stamp")
        $out.Add('DTSTART:' + $d.ToString('yyyyMMddTHHmm00'))
        $out.Add('DTEND:' + $end.ToString('yyyyMMddTHHmm00'))
        $out.Add('SUMMARY:' + (Esc-Ics "【作业截止】$($t.title)"))
        $desc = @()
        if ($platName[$t.platformId]) { $desc += "平台：$($platName[$t.platformId])" }
        if ($t.url)  { $desc += "入口：$($t.url)" }
        if ($t.note) { $desc += "备注：$($t.note)" }
        if ($desc.Count) { $out.Add('DESCRIPTION:' + (Esc-Ics ($desc -join "`n"))) }
        if ($t.url) { $out.Add('URL:' + (Esc-Ics $t.url)) }
        $out.Add('BEGIN:VALARM'); $out.Add('TRIGGER:-P1D'); $out.Add('ACTION:DISPLAY'); $out.Add('DESCRIPTION:明天截止'); $out.Add('END:VALARM')
        $out.Add('BEGIN:VALARM'); $out.Add('TRIGGER:-PT2H'); $out.Add('ACTION:DISPLAY'); $out.Add('DESCRIPTION:2 小时后截止'); $out.Add('END:VALARM')
        $out.Add('END:VEVENT')
    }
    $out.Add('END:VCALENDAR')
    $icsPath = Join-Path (Split-Path -Parent $DataFile) '作业提醒.ics'
    Set-Content -LiteralPath $icsPath -Value ($out -join "`r`n") -Encoding UTF8
    if (-not $Quiet) { Write-Host "已生成 $icsPath" -ForegroundColor Green }
}

if ($late.Count -gt 0) { exit 1 } else { exit 0 }
