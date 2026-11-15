// Server-owned connection state. Consents, Enable Banking session ids and tokens never reach the browser;
// it only holds an httpOnly cookie that names its server-side session. Kept in memory for the demo.
import 'server-only';
import { env } from 'cloudflare:workers';
import { enableBankingClient } from './enable-banking';
import { enableBankingJwt, importSigningKey } from './jwt';

export { sessionId, ensureSession, publicConnection, listConnections, saveConnection, removeConnection, addPending, takePending } from './state';

let cachedKey: Promise<CryptoKey> | null = null;
/** The Enable Banking client, or null when the server has no application key configured. */
export function enableBanking() {
  const { ENABLE_BANKING_APP_ID: appId, ENABLE_BANKING_PRIVATE_KEY_B64: keyB64 } = env as unknown as Record<string, string | undefined>;
  if (!appId?.trim() || !keyB64?.trim()) return null;
  cachedKey ??= importSigningKey(atob(keyB64.trim()));
  return enableBankingClient({ token: async () => enableBankingJwt(appId.trim(), await cachedKey!) });
}
