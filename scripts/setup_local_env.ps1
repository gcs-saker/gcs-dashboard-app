param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$composeDir = Join-Path $RepositoryRoot "deploy\compose"
$examplePath = Join-Path $composeDir ".env.single-node.example"
$targetPath = Join-Path $composeDir ".env.single-node"

if ((Test-Path -LiteralPath $targetPath) -and -not $Force) {
    throw "Local env already exists: $targetPath (use -Force to rotate every local secret)"
}

function New-LocalSecret([int]$ByteLength = 32) {
    $bytes = [byte[]]::new($ByteLength)
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$postgresPassword = New-LocalSecret
$mqttPassword = New-LocalSecret
$values = @{
    "COMPOSE_PROJECT_NAME" = "gcs-saker-local-security"
    "POSTGRES_PASSWORD" = $postgresPassword
    "DATABASE_URL" = "postgresql+psycopg2://gcs_geo:${postgresPassword}@postgres-geo:5432/gcs_geo"
    "REDIS_PASSWORD" = (New-LocalSecret)
    "AUTH_JWT_SECRET" = (New-LocalSecret 48)
    "AUTH_POLICY_ADMIN_PASSWORD" = (New-LocalSecret)
    "AUTH_POLICY_OPERATOR_PASSWORD" = (New-LocalSecret)
    "AUTH_POLICY_SMOKE_PASSWORD" = (New-LocalSecret)
    "AUTH_POLICY_DEVICE_BOOTSTRAP_TOKENS" = "$(New-LocalSecret):co-a"
    "MQTT_PASSWORD" = $mqttPassword
    "MQTT_HEALTH_PASSWORD" = $mqttPassword
    "CONTROL_GRPC_AUTH_TOKEN" = (New-LocalSecret 48)
    "TURN_PASSWORD" = (New-LocalSecret)
    "MEDIA_CONTROL_PUBLISH_TOKEN" = (New-LocalSecret 48)
    "MEDIA_CONTROL_GRPC_TOKEN" = (New-LocalSecret 48)
    "NGINX_CERTS_DIR" = (Join-Path $RepositoryRoot ".local\nginx-certs").Replace('\', '/')
}

$lines = Get-Content -LiteralPath $examplePath -Encoding utf8
$rendered = foreach ($line in $lines) {
    if ($line -match '^([A-Z0-9_]+)=') {
        $key = $Matches[1]
        if ($values.ContainsKey($key)) { "$key=$($values[$key])" } else { $line }
    } else {
        $line
    }
}

$localDir = Join-Path $RepositoryRoot ".local"
New-Item -ItemType Directory -Path $localDir -Force | Out-Null
[System.IO.File]::WriteAllLines($targetPath, $rendered, [System.Text.UTF8Encoding]::new($false))

$mqttPasswordFile = Join-Path $RepositoryRoot "deploy\mosquitto\passwords.local"
$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($docker) {
    $mqttUsername = ($rendered | Where-Object { $_ -match '^MQTT_USERNAME=' } | Select-Object -First 1) -replace '^MQTT_USERNAME=', ''
    if ([string]::IsNullOrWhiteSpace($mqttUsername)) {
        throw "MQTT_USERNAME is missing from $targetPath"
    }

    # Pass the plaintext only through stdin. Neither command arguments nor logs expose it.
    $passwordEntry = "${mqttUsername}:${mqttPassword}"
    $hashedPassword = $passwordEntry | & $docker.Source run --rm -i eclipse-mosquitto:2 `
        sh -c 'umask 077; cat > /tmp/passwords; mosquitto_passwd -U /tmp/passwords; cat /tmp/passwords'
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($hashedPassword)) {
        throw "Failed to generate the local Mosquitto password file"
    }
    [System.IO.File]::WriteAllLines($mqttPasswordFile, @($hashedPassword), [System.Text.UTF8Encoding]::new($false))
}

$summaryPath = Join-Path $localDir "local-env-summary.txt"
$summary = @(
    "Generated: $([DateTimeOffset]::Now.ToString('o'))"
    "Compose project: $($values['COMPOSE_PROJECT_NAME'])"
    "Env file: $targetPath"
    "MQTT password file: $mqttPasswordFile"
    "Secrets are intentionally omitted from this summary."
)
[System.IO.File]::WriteAllLines($summaryPath, $summary, [System.Text.UTF8Encoding]::new($false))

Write-Host "Created local-only environment: $targetPath"
Write-Host "No secret values were printed."
