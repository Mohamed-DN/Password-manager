#!/bin/bash
# init-primary.sh
# This script is executed by the postgres container on first initialization
# (via /docker-entrypoint-initdb.d). It configures the primary for streaming
# replication by allowing the replicator user to connect.
set -e

echo "==> [init-primary] Configuring pg_hba.conf for streaming replication..."

# Allow the replicator user to connect for replication from any host inside
# the Docker network using scram-sha-256 authentication.
cat >> "$PGDATA/pg_hba.conf" <<EOF

# Streaming replication (added by init-primary.sh)
host replication replicator 0.0.0.0/0 scram-sha-256
EOF

echo "==> [init-primary] pg_hba.conf updated. Reloading configuration..."
pg_ctl reload -D "$PGDATA" 2>/dev/null || true

echo "==> [init-primary] Done."
