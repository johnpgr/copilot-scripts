import { mkdir } from 'fs/promises';
import path from 'path';

const CONFIG_DIR = path.join(process.env.HOME || '', '.config/copilot-scripts');
const TOKEN_PATH = path.join(CONFIG_DIR, 'tokens.json');

export interface TokenCache {
  oauth_token?: string;
  bearer_token?: string;
  expires_at?: number;
}

async function ensureConfigDir() {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadCachedToken(): Promise<TokenCache | null> {
  try {
    return await Bun.file(TOKEN_PATH).json();
  } catch {
    return null;
  }
}

export async function saveBearerToken(bearer: { token: string; expires_at: number }): Promise<void> {
  await ensureConfigDir();

  const payload: TokenCache = {
    bearer_token: bearer.token,
    expires_at: bearer.expires_at,
  };

  await Bun.write(TOKEN_PATH, JSON.stringify(payload, null, 2));
}

export async function saveOAuthToken(token: string): Promise<void> {
  await ensureConfigDir();
  const existing = (await loadCachedToken()) || {};

  const payload: TokenCache = {
    ...existing,
    oauth_token: token,
  };

  await Bun.write(TOKEN_PATH, JSON.stringify(payload, null, 2));
}
