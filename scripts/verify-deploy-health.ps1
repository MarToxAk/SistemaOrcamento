# comando de referencia: docker compose -f deploy/docker-compose.vps.yml ps
param(
  [string]$ComposeFile = 'deploy/docker-compose.vps.yml',
  [string]$HealthUrl = 'http://localhost:4001/health',
  [string]$HealthFallbackUrl = 'http://localhost:4001/api/health'
)

$ErrorActionPreference = 'Stop'

function Fail([string]$message) {
  Write-Error $message
  exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'docker nao encontrado no PATH. Nao foi possivel validar deploy.'
}

if (-not (Test-Path $ComposeFile)) {
  Fail "arquivo compose nao encontrado: $ComposeFile"
}

Write-Output '[check] compose status'
$psOutput = docker compose -f $ComposeFile ps 2>&1
if ($LASTEXITCODE -ne 0) {
  Fail "falha ao executar docker compose ps: $psOutput"
}

$backendRunning = docker compose -f $ComposeFile ps backend --status running 2>&1
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($backendRunning)) {
  Fail 'backend nao esta running apos deploy.'
}

Write-Output '[check] backend logs'
$logs = docker compose -f $ComposeFile logs backend --tail=120 2>&1
if ($LASTEXITCODE -ne 0) {
  Fail "falha ao coletar logs do backend: $logs"
}

if ($logs -match 'DB_READINESS_FAILED' -or $logs -match 'MIGRATION_DEPLOY_FAILED') {
  Fail 'erros criticos encontrados nos logs: DB_READINESS_FAILED ou MIGRATION_DEPLOY_FAILED.'
}

function Test-Health([string]$url) {
  try {
    $resp = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 10
    if ($resp.StatusCode -eq 200) {
      return $true
    }
  } catch {
    return $false
  }
  return $false
}

Write-Output '[check] health endpoint'
if (-not (Test-Health $HealthUrl)) {
  if (-not (Test-Health $HealthFallbackUrl)) {
    Fail "health endpoint sem HTTP 200 em $HealthUrl e $HealthFallbackUrl"
  }
}

Write-Output 'deploy health verification: PASS'
exit 0

