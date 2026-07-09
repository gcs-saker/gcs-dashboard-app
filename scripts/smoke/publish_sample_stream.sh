#!/usr/bin/env bash
set -euo pipefail

DEFAULT_STREAM_PATH="raw/sample/front"
DEFAULT_RTSP_HOST="127.0.0.1"
DEFAULT_RTSP_PORT="${MEDIAMTX_RTSP_PORT:-8554}"
DEFAULT_VIDEO_FILTER="testsrc2=size=1280x720:rate=30"

STREAM_PATH="${SAMPLE_STREAM_PATH:-$DEFAULT_STREAM_PATH}"
RTSP_URL="${SAMPLE_RTSP_URL:-rtsp://${DEFAULT_RTSP_HOST}:${DEFAULT_RTSP_PORT}/${STREAM_PATH}}"
VIDEO_FILTER="${SAMPLE_VIDEO_FILTER:-$DEFAULT_VIDEO_FILTER}"
GOP_SIZE="${SAMPLE_GOP_SIZE:-60}"
INPUT_FILE=""
DURATION_SECONDS=""
DRY_RUN="false"
LOOP_INPUT="true"

usage() {
  cat <<'EOF'
Usage:
  scripts/smoke/publish_sample_stream.sh [options]

Publishes a reproducible sample stream to MediaMTX.
Default target: rtsp://127.0.0.1:8554/raw/sample/front

Options:
  --url URL              Override RTSP publish URL.
  --path PATH            Override MediaMTX stream path. Default: raw/sample/front.
  --file PATH            Publish a local media file instead of the generated test pattern.
  --filter FILTER        Override ffmpeg lavfi source. Default: testsrc2=size=1280x720:rate=30.
  --duration SECONDS     Stop after the given number of seconds.
  --no-loop              Do not loop --file input.
  --dry-run              Print the ffmpeg command without executing it.
  -h, --help             Show this help.

Environment:
  MEDIAMTX_RTSP_PORT     RTSP publish port. Default: 8554.
  SAMPLE_STREAM_PATH     Stream path. Default: raw/sample/front.
  SAMPLE_RTSP_URL        Full RTSP publish URL. Overrides host/port/path.
  SAMPLE_VIDEO_FILTER    ffmpeg lavfi source for generated input.
  SAMPLE_GOP_SIZE        H.264 GOP size. Default: 60.
EOF
}

quote_command() {
  local quoted=()
  local arg

  for arg in "$@"; do
    printf -v arg "%q" "$arg"
    quoted+=("$arg")
  done

  printf "%s\n" "${quoted[*]}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      RTSP_URL="${2:?--url requires a value}"
      shift 2
      ;;
    --path)
      STREAM_PATH="${2:?--path requires a value}"
      RTSP_URL="${SAMPLE_RTSP_URL:-rtsp://${DEFAULT_RTSP_HOST}:${DEFAULT_RTSP_PORT}/${STREAM_PATH}}"
      shift 2
      ;;
    --file)
      INPUT_FILE="${2:?--file requires a value}"
      shift 2
      ;;
    --filter)
      VIDEO_FILTER="${2:?--filter requires a value}"
      shift 2
      ;;
    --duration)
      DURATION_SECONDS="${2:?--duration requires a value}"
      shift 2
      ;;
    --no-loop)
      LOOP_INPUT="false"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -n "$INPUT_FILE" && ! -f "$INPUT_FILE" ]]; then
  echo "Input file does not exist: $INPUT_FILE" >&2
  exit 2
fi

FFMPEG_CMD=(ffmpeg -hide_banner -loglevel info -re)

if [[ -n "$INPUT_FILE" ]]; then
  if [[ "$LOOP_INPUT" == "true" ]]; then
    FFMPEG_CMD+=(-stream_loop -1)
  fi
  FFMPEG_CMD+=(-i "$INPUT_FILE")
else
  FFMPEG_CMD+=(-f lavfi -i "$VIDEO_FILTER")
fi

if [[ -n "$DURATION_SECONDS" ]]; then
  FFMPEG_CMD+=(-t "$DURATION_SECONDS")
fi

FFMPEG_CMD+=(
  -an
  -c:v libx264
  -preset veryfast
  -tune zerolatency
  -pix_fmt yuv420p
  -g "$GOP_SIZE"
  -f rtsp
  -rtsp_transport tcp
  "$RTSP_URL"
)

if [[ "$DRY_RUN" == "true" ]]; then
  quote_command "${FFMPEG_CMD[@]}"
  exit 0
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required. Install it first, for example: brew install ffmpeg" >&2
  exit 127
fi

echo "Publishing sample stream to ${RTSP_URL}"
echo "Stream ID expected by backend: ${STREAM_PATH//\//.}"
exec "${FFMPEG_CMD[@]}"
