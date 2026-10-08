import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, type JWTVerifyGetKey } from 'jose';
export const ISSUER = 'https://auth.openai.com';
export const RESOURCE = 'https://api.openai.com/v1';
export const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export interface Transaction {
  state: string; nonce: string; verifier: string; redirectUri: string;
  expiresAt: number; clientId?: string; subject?: string;
}
export function transaction(redirectUri: string, clientId?: string, subject?: string): Transaction {
  return { state: randomBytes(32).toString('base64url'), nonce: randomBytes(32).toString('base64url'),
    verifier: randomBytes(64).toString('base64url'), redirectUri, expiresAt: Date.now() + 300_000, clientId, subject };
}
export function authorizationUrl(t: Transaction, hostId: string, idToken?: string) {
  const url = new URL(`${ISSUER}/api/accounts/authorize`);
  url.search = new URLSearchParams({ client_id: t.clientId || 'dynamic_agent_client', ext_agent_host_id: hostId,
    response_type: 'code', redirect_uri: t.redirectUri, scope: SCOPES, resource: RESOURCE,
    state: t.state, nonce: t.nonce, code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(t.verifier).digest('base64url') }).toString();
  if (!t.clientId) url.searchParams.set('agent_name_hint', 'stemhelp');
  if (t.clientId && idToken) url.searchParams.set('id_token_hint', idToken);
  return url.toString();
}
export function validateCallback(t: Transaction, url: URL) {
  if (Date.now() >= t.expiresAt || url.searchParams.get('state') !== t.state) throw new Error('Accesso scaduto o non verificabile. Riprova.');
  if (url.searchParams.has('error')) throw new Error('Autorizzazione non concessa. Nessuna credenziale salvata.');
  const code = url.searchParams.get('code');
  const clientId = url.searchParams.get('client_id') || t.clientId;
  if (!code || !clientId || clientId === 'dynamic_agent_client' || (t.clientId && clientId !== t.clientId)) {
    throw new Error('Registrazione incompleta o account non corrispondente.');
  }
  return { code, clientId };
}
export async function verifyIdentity(token: string, key: JWTVerifyGetKey, clientId: string, nonce?: string, subject?: string) {
  const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: clientId, requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5 });
  if (!payload.sub || (nonce && payload.nonce !== nonce) || (subject && payload.sub !== subject)) throw new Error('Identità dell’account non verificata.');
  return payload;
}
export function requirePlanScope(scope: string) {
  if (!scope.split(/\s+/).includes('chatgpt.tokens.use.direct')) throw new Error('Accesso al piano ChatGPT non autorizzato. Abilitalo durante il login.');
}
