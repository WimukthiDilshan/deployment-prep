param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$Requirements = Join-Path $ProjectRoot "requirements.txt"

if (-not (Test-Path $VenvPython)) {
    Write-Host "Creating .venv..."
    py -3 -m venv (Join-Path $ProjectRoot ".venv")
    $Install = $true
}

$HasUvicorn = $false
& $VenvPython -c "import uvicorn" 2>$null
if ($LASTEXITCODE -eq 0) {
    $HasUvicorn = $true
}

if ($Install -or -not $HasUvicorn) {
    Write-Host "Installing/updating dependencies..."
    & $VenvPython -m pip install -r $Requirements
}

Write-Host "Starting Cognitive Load API on http://127.0.0.1:8021"
Set-Location $ProjectRoot
& $VenvPython -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8021
