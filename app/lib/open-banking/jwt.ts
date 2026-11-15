// RS256 JSON Web Token for Enable Banking, signed with Web Crypto so it runs in the worker runtime.
const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Imports a PKCS#8 PEM ("BEGIN PRIVATE KEY") for RS256 signing. */
export async function importSigningKey(pem: string) {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

export async function enableBankingJwt(appId: string, key: CryptoKey, now = Math.floor(Date.now() / 1000)) {
  const unsigned = `${b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }))}.${b64url(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 }))}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(signature)}`;
}
