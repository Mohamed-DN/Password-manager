# backup/Dockerfile
# Lightweight backup container that runs cron-scheduled jobs for:
#   - PostgreSQL logical backups (pg_dump)
#   - Vault Raft snapshots
# Tools: postgresql-client, vault CLI (copied from official image), jq, dcron
FROM hashicorp/vault:latest AS vault-stage

FROM alpine:3.19

# Copy vault CLI from the official vault image
COPY --from=vault-stage /bin/vault /usr/local/bin/vault

# Install postgresql client (must match the server major version), jq, and
# dcron (lightweight cron daemon for Alpine).
RUN apk add --no-cache \
    postgresql16-client \
    jq \
    dcron \
    bash \
    tzdata

# Create backup directory structure
RUN mkdir -p /backups/postgres /backups/vault

# Copy cron schedule and backup script
COPY crontab /etc/crontabs/root
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# Run crond in foreground (-f) with log level 2 (notices)
CMD ["crond", "-f", "-l", "2"]
