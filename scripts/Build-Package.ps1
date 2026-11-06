$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $projectRoot 'frontend')
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
$portableNpm = Join-Path $projectRoot '.tools/package/bin/npm-cli.js'
foreach ($task in @('test', 'build')) {
    if ($npmCommand) { & $npmCommand.Source run $task }
    elseif (Test-Path $portableNpm) { & node $portableNpm run $task }
    else { throw 'Instale Node.js 24 com npm antes de empacotar.' }
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
}
Set-Location $projectRoot
$portableJava = Join-Path $projectRoot '.tools/jdk-21.0.13+9'
if (-not $env:JAVA_HOME -and (Test-Path $portableJava)) { $env:JAVA_HOME = $portableJava }
$mavenCommand = Get-Command mvn.cmd -ErrorAction SilentlyContinue
$maven = if ($mavenCommand) { $mavenCommand.Source } else { Join-Path $projectRoot '.tools/apache-maven-3.9.11/bin/mvn.cmd' }
if (-not (Test-Path $maven)) { throw 'Instale Maven 3.9.11 ou superior.' }
& $maven -B -ntp -f backend/pom.xml "-Dmaven.repo.local=$projectRoot/.tools/m2" -Pweb-ui clean verify
exit $LASTEXITCODE
