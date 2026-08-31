$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$protoRoot = Join-Path $repoRoot "contracts/proto"
$outputRoot = Join-Path $repoRoot "services/media-control/internal/generated"
$pluginRoot = Join-Path $repoRoot ".tools/go-bin"

New-Item -ItemType Directory -Force $outputRoot | Out-Null
python -m grpc_tools.protoc `
  "-I$protoRoot" `
  "--plugin=protoc-gen-go=$(Join-Path $pluginRoot 'protoc-gen-go.exe')" `
  "--plugin=protoc-gen-go-grpc=$(Join-Path $pluginRoot 'protoc-gen-go-grpc.exe')" `
  "--go_out=$outputRoot" --go_opt=paths=source_relative `
  "--go-grpc_out=$outputRoot" --go-grpc_opt=paths=source_relative `
  (Join-Path $protoRoot "gcs/saker/v1/common.proto") `
  (Join-Path $protoRoot "gcs/saker/v1/stream_control.proto") `
  (Join-Path $protoRoot "gcs/saker/v1/telemetry.proto") `
  (Join-Path $protoRoot "gcs/saker/v1/gateway_service.proto")
