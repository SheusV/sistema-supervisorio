$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $projectRoot 'frontend')
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCommand) {
    if (-not (Test-Path 'node_modules')) { & $npmCommand.Source ci; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
    & $npmCommand.Source run dev
} else {
    $portableNpm = Join-Path $projectRoot '.tools/package/bin/npm-cli.js'
    if (-not (Test-Path $portableNpm)) { throw 'Instale Node.js 24 LTS (com npm). Consulte o README.' }
    if (-not (Test-Path 'node_modules')) { & node $portableNpm ci; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
    & node $portableNpm run dev
}
exit $LASTEXITCODE
