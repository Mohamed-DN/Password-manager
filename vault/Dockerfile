# vault/Dockerfile
# Extends the official Vault image with jq (needed by the entrypoint script
# to parse the init.json file for unseal keys and the root token).
FROM hashicorp/vault:latest

RUN apk add --no-cache jq

COPY entrypoint.sh /usr/local/bin/vault-entrypoint.sh
RUN chmod +x /usr/local/bin/vault-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/vault-entrypoint.sh"]
