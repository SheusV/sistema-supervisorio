$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
$portableJava = Join-Path $projectRoot '.tools/jdk-21.0.13+9'
if (-not $env:JAVA_HOME -and (Test-Path $portableJava)) { $env:JAVA_HOME = $portableJava }
$mavenCommand = Get-Command mvn.cmd -ErrorAction SilentlyContinue
$maven = if ($mavenCommand) { $mavenCommand.Source } else { Join-Path $projectRoot '.tools/apache-maven-3.9.11/bin/mvn.cmd' }
if (-not (Test-Path $maven)) { throw 'Instale Maven 3.9.11 ou superior e adicione sua pasta bin ao PATH. Consulte o README.' }
& $maven -B -ntp -f backend/pom.xml "-Dmaven.repo.local=$projectRoot/.tools/m2" spring-boot:run
exit $LASTEXITCODE
