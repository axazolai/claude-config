# Mode B: launch Claude Code running ENTIRELY on the corporate DeepSeek model, for when Claude's
# own limits are spent. Claude Code talks only to a local Anthropic->OpenAI translator; the
# translator talks to the corp gateway (configured at setup), reachable only while the Cisco VPN is
# UP. So mode B needs Cisco connected — it does NOT use the home-tunnel bypass (that is for reaching
# api.anthropic.com in normal mode; here Claude Code never contacts Anthropic). Personal use only.
#
# Usage: pwsh -File claude-deepseek.ps1 [-Port <n>] [-CheckOnly] [-- <claude args>]
param(
    [int]$Port = 4100,
    [switch]$CheckOnly,
    [Parameter(ValueFromRemainingArguments)][string[]]$ClaudeArgs
)

$ErrorActionPreference = 'Stop'
$cfgDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$translator = Join-Path $cfgDir 'mcp-servers/deepseek/translator.mjs'
$model = 'deepseek-v4.1-flash'

# Gateway + key are machine-local (entered at `node setup.mjs`, stored in deepseek.config.json),
# never in the repo. Env overrides the file.
$cfgFile = Join-Path $cfgDir 'deepseek.config.json'
$dsCfg = if (Test-Path $cfgFile) { Get-Content $cfgFile -Raw | ConvertFrom-Json } else { $null }
$gateway = if ($env:DS_GATEWAY) { $env:DS_GATEWAY } elseif ($dsCfg.gateway) { $dsCfg.gateway } else { $null }
if (-not $env:LLM_KEY -and $dsCfg.key) { $env:LLM_KEY = $dsCfg.key }

function Write-Note([string]$m) { Write-Host "[deepseek] $m" -ForegroundColor Cyan }
function Stop-Launch([string]$m) { Write-Host "[deepseek] BLOCKED: $m" -ForegroundColor Red; exit 1 }

# 1. Gateway + key required (from config or env).
if (-not $gateway) { Stop-Launch "DeepSeek gateway not configured. Run 'node setup.mjs' to set the gateway address and key." }
if (-not $env:LLM_KEY) { Stop-Launch "LLM_KEY not set and not in deepseek.config.json. Run 'node setup.mjs' or set it, then relaunch." }
if (-not (Test-Path $translator)) { Stop-Launch "translator not found at $translator — run 'node setup.mjs' first." }
$env:DS_GATEWAY = $gateway

# 2. Gateway reachable? (needs Cisco up; metadata GET, no generation.)
$gwCode = & curl.exe -s -o NUL -m 8 -w '%{http_code}' "$gateway/health/readiness" 2>$null
$gwOk = $gwCode -eq '200'

# 3. Translator up on the local port? If not, start it (thinking on for mode B).
function Test-Translator { try { (& curl.exe -s -o NUL -m 4 -w '%{http_code}' -X POST "http://127.0.0.1:$Port/v1/messages/count_tokens" -d '{}' 2>$null) -eq '200' } catch { $false } }
$trUp = Test-Translator

$base = "http://127.0.0.1:$Port"
$plan = @{
    LLM_KEY_present   = [bool]$env:LLM_KEY
    gateway           = "$gateway (readiness=$gwCode)"
    translator        = if ($trUp) { "already up on $base" } else { "will start on $base" }
    ANTHROPIC_BASE_URL = $base
    model             = $model
}
Write-Note ("plan: " + ($plan | ConvertTo-Json -Compress))
if (-not $gwOk) { Write-Note "WARNING: gateway not reachable (got '$gwCode'). Mode B needs the Cisco VPN UP to reach $gateway." }

if ($CheckOnly) { Write-Note 'CheckOnly: not starting the translator or Claude Code.'; exit 0 }
if (-not $gwOk) { Stop-Launch "gateway unreachable — connect the Cisco VPN, then relaunch (or override with -DS_GATEWAY)." }

if (-not $trUp) {
    $env:DS_PORT = "$Port"; $env:DS_THINKING = '1'; $env:DS_EMIT_THINKING = '1'
    Write-Note "starting translator: node $translator"
    Start-Process node -ArgumentList "`"$translator`"" -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $cfgDir 'state/deepseek-translator.out') `
        -RedirectStandardError  (Join-Path $cfgDir 'state/deepseek-translator.err')
    for ($i = 0; $i -lt 10 -and -not (Test-Translator); $i++) { Start-Sleep -Milliseconds 400 }
    if (-not (Test-Translator)) { Stop-Launch "translator did not come up on $base — see state/deepseek-translator.err" }
}

# 4. Point Claude Code at the translator and launch. Claude Code's traffic is all localhost here.
$env:ANTHROPIC_BASE_URL = $base
$env:ANTHROPIC_AUTH_TOKEN = 'dummy'
$env:ANTHROPIC_MODEL = $model
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL = $model
$env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
Write-Note "launching Claude Code on $model via $base"
& claude @ClaudeArgs
