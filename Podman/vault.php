<?php
// =============================================================================
// vault.php — NexiVault | Wrapper OpenBao KV v2
// Tutte le operazioni con OpenBao passano da qui.
// Il PHP comunica via HTTP su 127.0.0.1:8201 (listener locale senza TLS).
// =============================================================================

/**
 * Esegue una chiamata cURL verso OpenBao.
 * @param string $method  GET | POST | DELETE
 * @param string $url     URL completa
 * @param array|null $body Corpo della richiesta (verrà codificato in JSON)
 * @return array ['code' => int, 'data' => array]
 */
function vault_curl(string $method, string $url, ?array $body = null): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_HTTPHEADER     => [
            'X-Vault-Token: ' . VAULT_TOKEN,
            'Content-Type: application/json',
        ],
        CURLOPT_CUSTOMREQUEST  => $method,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $response = curl_exec($ch);
    $code     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);

    if ($error) {
        throw new RuntimeException("OpenBao cURL error: $error");
    }
    return ['code' => $code, 'data' => json_decode($response, true) ?? []];
}

/**
 * Costruisce la URL per il mount KV v2.
 * KV v2: /v1/{mount}/data/{path}     → read/write
 *        /v1/{mount}/metadata/{path} → delete definitivo
 */
function vault_url(string $endpoint, string $path): string {
    return VAULT_ADDR . '/v1/' . VAULT_MOUNT . '/' . $endpoint . '/' . ltrim($path, '/');
}

/**
 * Salva (o aggiorna) una password in OpenBao.
 * KV v2: POST /v1/passwords/data/{path}
 */
function vault_write(string $path, string $password): bool {
    $res = vault_curl('POST', vault_url('data', $path), [
        'data' => ['password' => $password],
    ]);
    return in_array($res['code'], [200, 204]);
}

/**
 * Legge la password corrente da OpenBao.
 * KV v2: GET /v1/passwords/data/{path}
 */
function vault_read(string $path): ?string {
    $res = vault_curl('GET', vault_url('data', $path));
    // KV v2: data → data → data → password
    return $res['data']['data']['data']['password'] ?? null;
}

/**
 * Elimina definitivamente tutte le versioni di un segreto.
 * KV v2: DELETE /v1/passwords/metadata/{path}
 */
function vault_delete(string $path): bool {
    $res = vault_curl('DELETE', vault_url('metadata', $path));
    return in_array($res['code'], [200, 204]);
}

/**
 * Genera il vault_path standard per un'utenza.
 * Formato: utenti/{tecnologia}/{ambiente}/{db_name}/{username}
 * Tutti i segmenti vengono normalizzati in lowercase snake_case.
 */
function vault_path_for(string $tech, string $env, string $db, string $user): string {
    $slug = fn($s) => strtolower(preg_replace('/[^a-zA-Z0-9_-]/', '_', trim($s)));
    return "utenti/{$slug($tech)}/{$slug($env)}/{$slug($db)}/{$slug($user)}";
}

/**
 * Genera il vault_path per un utente del sito.
 * Formato: utenti/sito/{username}  (rimane entro la policy passwords/data/utenti/*)
 */
function vault_path_sito(string $username): string {
    $slug = strtolower(preg_replace('/[^a-zA-Z0-9_-]/', '_', trim($username)));
    return "utenti/sito/{$slug}";
}
