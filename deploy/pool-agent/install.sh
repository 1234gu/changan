#!/usr/bin/env bash
# Install the resource-pool Agent as a systemd service on a Linux execution node (Thor).
# Usage (as root, from the unpacked bundle directory):
#   sudo ./install.sh --node-name thor1 --server http://192.168.50.231:8311 --token-file ./agent.token
# The Agent reports through the platform gateway; it never needs the admin API key.
set -euo pipefail
NODE_NAME=""; SERVER=""; TOKEN_FILE=""; PREFIX=/opt/changan-pool-agent
while [ $# -gt 0 ]; do
  case "$1" in
    --node-name) NODE_NAME=$2; shift 2;;
    --server) SERVER=$2; shift 2;;
    --token-file) TOKEN_FILE=$2; shift 2;;
    --prefix) PREFIX=$2; shift 2;;
    *) echo "unknown argument $1" >&2; exit 2;;
  esac
done
[ -n "$NODE_NAME" ] && [ -n "$SERVER" ] && [ -f "$TOKEN_FILE" ] || { echo "need --node-name --server --token-file" >&2; exit 2; }
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)

install -d -m 0755 "$PREFIX" "$PREFIX/state"
rm -rf "$PREFIX/agent.new" && cp -r "$HERE/agent" "$PREFIX/agent.new"
rm -rf "$PREFIX/agent.new/.state" "$PREFIX/agent.new/__pycache__"
if [ ! -x "$PREFIX/venv/bin/python" ]; then python3 -m venv "$PREFIX/venv"; fi
"$PREFIX/venv/bin/pip" install -q --disable-pip-version-check -r "$HERE/requirements.lock.txt"
rm -rf "$PREFIX/agent" && mv "$PREFIX/agent.new" "$PREFIX/agent"
# The stable node UUID survives upgrades: it lives outside the code directory.
ln -sfn "$PREFIX/state" "$PREFIX/agent/.state"
rm -f "$PREFIX/state/config.json"  # a saved backend URL would override config.yaml

cat > "$PREFIX/agent/config.yaml" <<YAML
node_name: '$NODE_NAME'
advertise_ip: null
backend:
  url: '$SERVER'
  request_timeout_seconds: 5
heartbeat_interval_seconds: 2
resource_report_interval_seconds: 5
reconnect_interval_seconds: 3
reconnect_max_interval_seconds: 30
state_file: '.state/node_id'
labels: []
cluster: null
discovery:
  enabled: false
  listen_host: '127.0.0.1'
  port: 8765
log_level: 'INFO'
YAML
umask 077
printf 'CHANGAN_POOL_AGENT_TOKEN=%s\n' "$(tr -d '\r\n' < "$TOKEN_FILE")" > /etc/changan-pool-agent.env
chmod 600 /etc/changan-pool-agent.env
install -m 0644 "$HERE/changan-pool-agent.service" /etc/systemd/system/changan-pool-agent.service
sed -i "s#@PREFIX@#$PREFIX#g" /etc/systemd/system/changan-pool-agent.service
systemctl daemon-reload
systemctl enable --now changan-pool-agent.service
systemctl restart changan-pool-agent.service
sleep 3
systemctl --no-pager --lines=5 status changan-pool-agent.service | tail -n 6
