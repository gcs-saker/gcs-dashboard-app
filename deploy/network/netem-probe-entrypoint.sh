#!/bin/sh
set -eu

tc qdisc replace dev eth0 root netem \
  delay "${NETEM_DELAY_MS:?missing delay}ms" "${NETEM_JITTER_MS:?missing jitter}ms" \
  loss "${NETEM_LOSS_PERCENT:?missing loss}%" \
  reorder "${NETEM_REORDER_PERCENT:?missing reorder}%"
exec python -c "${PROBE_SCRIPT:?missing probe script}"
