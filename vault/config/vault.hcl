# vault.hcl — Production-grade OpenBao/Vault configuration
# Uses the integrated Raft storage backend so secrets are persisted to disk.

storage "raft" {
  path    = "/vault/data"
  node_id = "inventory-bao-node1"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1   # TLS is terminated at the load balancer in production
}

# Address that other Raft nodes use to reach this node (single-node setup)
api_addr     = "http://inventory-bao:8200"
cluster_addr = "http://inventory-bao:8201"

# Enable the built-in web UI
ui = true

# Disable memory locking for development environments (set to false in prod)
disable_mlock = true
