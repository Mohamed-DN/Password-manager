import vault from 'node-vault';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const vaultClient = vault({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR || 'http://inventory-bao:8200',
});

// Auto-login or set token
const initVault = async () => {
  if (process.env.VAULT_TOKEN) {
    vaultClient.token = process.env.VAULT_TOKEN;
  } else if (fs.existsSync(process.env.VAULT_INIT_FILE || '/vault/init/init.json')) {
    const initData = JSON.parse(fs.readFileSync(process.env.VAULT_INIT_FILE || '/vault/init/init.json', 'utf8'));
    vaultClient.token = initData.root_token;
  }
};

export const storePassword = async (path: string, password: string) => {
  await initVault();
  await vaultClient.write(path, { data: { password } });
};

export const getPassword = async (path: string) => {
  await initVault();
  const res = await vaultClient.read(path);
  return res.data.data.password;
};

export const getCurrentVaultVersion = async (path: string) => {
  await initVault();
  try {
    const res = await vaultClient.read(path);
    return res.data.metadata.version;
  } catch {
    return null;
  }
};

export const getPasswordByVersion = async (path: string, version: number) => {
  await initVault();
  const res = await vaultClient.read(`${path}?version=${version}`);
  return res.data.data.password;
};

export const configureKvMaxVersions = async (maxVersions: number) => {
  await initVault();
  // Configura il motore KV v2 (mount point: secret/ o quello usato)
  // In questo progetto usiamo percorsi che iniziano con 'inventory/'
  // Assumiamo che il motore sia montato su 'secret' o che 'inventory' sia un mount point
};
