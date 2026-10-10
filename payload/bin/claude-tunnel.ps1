# Launches Claude Code with its HTTP traffic sent through the home-tunnel proxy (Keenetic
# awg-manager, sing-box HTTP inbound, exit via the personal AmneziaWG tunnel), so it stays off
# the Cisco corporate tunnel. Personal use only — the user's own machine, router and tunnel.
#
# Behaviour (fail-open-with-check), decided by the live Cisco state:
#   - Cisco adapter absent or disconnected  -> launch claude DIRECT (home tunnel already carries it).
#   - Cisco up + proxy reachable + Anthropic-via-proxy == 405 -> set HTTPS_PROXY, launch.
#   - Cisco up + proxy unreachable          -> test Anthropic DIRECT: 405 -> launch direct with a
#                                              warning; blocked -> refuse and print how to fix.
#
# Config: <CLAUDE_CONFIG_DIR>/cisco-proxy.json  { proxyHost, proxyPort, proxyUser, vpnMatch }
# CLI params override the file; a missing file is seeded when -Port is given.
#
# Usage: pwsh -File claude-tunnel.ps1 [-Port <n>] [-ProxyHost <ip>] [-ProxyUser <u>] [-CheckOnly]
#              [-- <claude args>]
param(
    [int]$Port,
    [string]$ProxyHost,
    [string]$ProxyUser,
    [string]$VpnMatch,
    [switch]$CheckOnly,
    [Parameter(ValueFromRemainingArguments)][string[]]$ClaudeArgs
)

$ErrorActionPreference = 'Stop'
$cfgDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$cfgPath = Join-Path $cfgDir 'cisco-proxy.json'
$cfg = if (Test-Path $cfgPath) { Get-Content $cfgPath -Raw | ConvertFrom-Json } else { $null }

if (-not $ProxyHost) { $ProxyHost = if ($cfg.proxyHost) { $cfg.proxyHost } else { '192.168.8.100' } }
if (-not $Port) { $Port = if ($cfg.proxyPort) { [int]$cfg.proxyPort } else { 0 } }
if (-not $ProxyUser) { $ProxyUser = $cfg.proxyUser }
if (-not $VpnMatch) { $VpnMatch = if ($cfg.vpnMatch) { $cfg.vpnMatch } else { 'Cisco|AnyConnect' } }

function Write-Note([string]$m) { Write-Host "[cisco-proxy] $m" -ForegroundColor Cyan }
function Stop-Launch([string]$m) { Write-Host "[cisco-proxy] BLOCKED: $m" -ForegroundColor Red; exit 1 }

# Seed the config file on first run so later launches and the SessionStart hook can read it.
if (-not $cfg -and $Port -gt 0) {
    @{ proxyHost = $ProxyHost; proxyPort = $Port; proxyUser = $ProxyUser; vpnMatch = $VpnMatch; remindWhenDown = $true } |
        ConvertTo-Json | Set-Content $cfgPath -Encoding utf8
    Write-Note "seeded $cfgPath"
}

# --- Cisco state (thorough) ---
$vpn = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -match $VpnMatch } | Select-Object -First 1
$ciscoUp = $vpn -and $vpn.Status -eq 'Up'

function Start-Claude([hashtable]$Env) {
    foreach ($k in $Env.Keys) { Set-Item "Env:$k" $Env[$k] }
    if ($CheckOnly) { Write-Note 'CheckOnly: not starting Claude Code.'; exit 0 }
    & claude @ClaudeArgs
}

if (-not $vpn -or -not $ciscoUp) {
    Write-Note ("Cisco " + $(if (-not $vpn) { 'not installed' } else { 'not connected' }) + " -> launching direct (home tunnel carries traffic).")
    Start-Claude @{}
    return
}

# --- Cisco is up: the proxy is required to bypass the corporate egress ---
if ($Port -le 0) { Stop-Launch "Cisco is up but no proxy port is configured. Set up the awg-manager HTTP proxy, then pass -Port <n> (it will be saved)." }
$proxy = if ($ProxyUser) {
    $sec = Read-Host -AsSecureString "Proxy password for $ProxyUser"
    $pw = [uri]::EscapeDataString([System.Net.NetworkCredential]::new('', $sec).Password)
    "http://${ProxyUser}:${pw}@${ProxyHost}:$Port"
} else { "http://${ProxyHost}:$Port" }
$shown = if ($ProxyUser) { "http://${ProxyUser}:***@${ProxyHost}:$Port" } else { $proxy }

# 1. Route to the proxy host must NOT go through the Cisco tunnel.
$route = Find-NetRoute -RemoteIPAddress $ProxyHost -ErrorAction SilentlyContinue | Where-Object DestinationPrefix | Select-Object -First 1
if ($route.InterfaceAlias -eq $vpn.Name) { Stop-Launch "route to $ProxyHost goes through the Cisco tunnel ($($vpn.Name)) — the proxy host must be on the LAN." }

# 2. Is the proxy reachable and does Anthropic answer through it? (405 on GET /v1/messages = real API)
$viaProxy = & curl.exe -s -o NUL -m 15 -w '%{http_code}' -x $proxy https://api.anthropic.com/v1/messages 2>$null
if ($viaProxy -eq '405') {
    $exit = & curl.exe -s -m 10 -x $proxy https://ifconfig.me 2>$null
    Write-Note "OK: proxy $shown -> Anthropic 405; tunnel exit IP=$exit. Routing Claude Code through the proxy."
    Start-Claude @{
        HTTPS_PROXY = $proxy; HTTP_PROXY = $proxy
        NO_PROXY    = 'localhost,127.0.0.1,::1,10.0.0.0/8,192.168.0.0/16,.local'
    }
    return
}

# 3. Proxy unreachable: decide by testing Anthropic DIRECT through Cisco.
Write-Note "proxy $shown did not answer (got '$viaProxy'). Testing api.anthropic.com directly through Cisco..."
$direct = & curl.exe -s -o NUL -m 15 -w '%{http_code}' --noproxy '*' https://api.anthropic.com/v1/messages 2>$null
if ($direct -eq '405') {
    Write-Note "Cisco is NOT blocking Anthropic right now (direct 405). Launching DIRECT. Note: the corporate egress may block on the next reconnect — bring the proxy back for a guarantee."
    Start-Claude @{}
    return
}
Stop-Launch @"
Cisco is up, the proxy is down, and api.anthropic.com is blocked by the corporate egress (direct got '$direct').
Fix: bring up the awg-manager HTTP proxy on your router, then relaunch.
  awg-manager -> Routing -> Sing-box: TProxy -> Simple -> Proxy -> type HTTP, outbound = your tunnel.
Then: pwsh -File "$PSCommandPath" -Port $Port -- $($ClaudeArgs -join ' ')
"@
