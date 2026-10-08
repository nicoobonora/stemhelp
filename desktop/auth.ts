import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { safeStorage, shell } from 'electron';
import { createRemoteJWKSet } from 'jose';
import { ISSUER, RESOURCE, authorizationUrl, transaction, validateCallback, verifyIdentity, requirePlanScope } from './oauth-core.js';

interface Account {
  clientId: string; subject: string; email: string; accessToken?: string;
  refreshToken?: string; idToken?: string; scope: string; expiresAt: number;
}
interface Vault { hostId: string; accounts: Account[]; active?: string }
interface Tokens { access_token: string; refresh_token?: string; id_token?: string; scope?: string; expires_in: number; token_type: string }
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
export class Auth {
  private vault: Vault;
  private path: string;
  private pending?: { cancel: () => void };
  private refreshing?: Promise<string>;
  private recoveryWarning?: string;
  private preserveVault = false;
  constructor(directory: string) {
    this.path = join(directory, 'credentials.enc');
    if (existsSync(this.path)) {
      this.checkEncryption();
      try { this.vault = JSON.parse(safeStorage.decryptString(readFileSync(this.path))); }
      catch {
        // Keep the original encrypted vault intact until the user explicitly signs in again.
        this.vault = { hostId: `urn:uuid:${randomUUID()}`, accounts: [] };
        this.preserveVault = true;
        this.recoveryWarning = 'Il portachiavi non riesce ad aprire il collegamento precedente. I corsi sono disponibili: ricollega ChatGPT nelle impostazioni.';
      }
    } else { this.vault = { hostId: `urn:uuid:${randomUUID()}`, accounts: [] }; }
  }
  private checkEncryption() {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
      throw new Error('Archivio credenziali protetto non disponibile. Configura il portachiavi del sistema.');
    }
  }
  private save() {
    this.checkEncryption();
    if (this.preserveVault) { renameSync(this.path, this.path + '.preserved-' + Date.now()); this.preserveVault = false; }
    writeFileSync(this.path + '.tmp', safeStorage.encryptString(JSON.stringify(this.vault)), { mode: 0o600 });
    renameSync(this.path + '.tmp', this.path);
  }
  private selected() { return this.vault.accounts.find(a => a.clientId === this.vault.active); }
  status() {
    return { warning: this.recoveryWarning, active: this.vault.active, signedIn: !!this.selected()?.accessToken,
      accounts: this.vault.accounts.map(a => ({ id: a.clientId, label: `${a.email || 'Account ChatGPT'} · ${a.clientId.slice(-6)}` })) };
  }
  async login(accountId?: string) {
    if (this.pending) throw new Error('Accesso già in corso. Completa o annulla la richiesta.');
    this.checkEncryption();
    this.save(); // Persist host identity before the first browser sign-in.
    const selected = accountId ? this.vault.accounts.find(a => a.clientId === accountId) : undefined;
    if (accountId && !selected) throw new Error('Account non trovato.');
    const server = createServer();
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') { server.close(); throw new Error('Impossibile avviare il login locale.'); }
    const t = transaction(`http://127.0.0.1:${address.port}/auth/callback`, selected?.clientId, selected?.subject);
    return new Promise<ReturnType<Auth['status']>>((resolve, reject) => {
      let consumed = false, settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); server.close(); server.closeAllConnections(); this.pending = undefined;
        if (error) reject(error); else resolve(this.status());
      };
      const timer = setTimeout(() => finish(new Error('Accesso scaduto. Premi di nuovo Continue with ChatGPT.')), 300_000);
      this.pending = { cancel: () => finish(new Error('Accesso annullato.')) };
      server.on('request', async (req, res) => {
        const url = new URL(req.url || '/', t.redirectUri);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        if (req.method !== 'GET' || url.pathname !== '/auth/callback') { res.writeHead(404); res.end('Not found'); return; }
        if (consumed || url.searchParams.get('state') !== t.state) { res.writeHead(400); res.end('Richiesta non valida.'); return; }
        consumed = true;
        try {
          const { code, clientId } = validateCallback(t, url);
          const tokens = await this.tokens({ grant_type: 'authorization_code', client_id: clientId, code,
            code_verifier: t.verifier, redirect_uri: t.redirectUri, resource: RESOURCE });
          if (!tokens.id_token) throw new Error('Identità non restituita dal servizio.');
          const identity = await verifyIdentity(tokens.id_token, jwks, clientId, t.nonce, t.subject);
          requirePlanScope(tokens.scope || '');
          if (settled) return; // A cancelled/expired attempt must never activate an account.
          const account: Account = { clientId, subject: identity.sub!, email: typeof identity.email === 'string' ? identity.email : '',
            accessToken: tokens.access_token, refreshToken: tokens.refresh_token, idToken: tokens.id_token,
            expiresAt: Date.now() + tokens.expires_in * 1000, scope: tokens.scope! };
          this.vault.accounts = [...this.vault.accounts.filter(a => a.clientId !== clientId), account];
          this.vault.active = clientId; this.recoveryWarning = undefined; this.save();
          res.end('Accesso completato. Puoi chiudere questa scheda e tornare a stemhelp.');
          finish();
        } catch (error) { res.writeHead(400); res.end('Accesso non completato. Torna a stemhelp per riprovare.'); finish(error instanceof Error ? error : new Error('Accesso non riuscito.')); }
      });
      shell.openExternal(authorizationUrl(t, this.vault.hostId, selected?.idToken)).catch(() => finish(new Error('Impossibile aprire il browser.')));
    });
  }
  cancelLogin() { this.pending?.cancel(); }
  private async tokens(body: Record<string, string>): Promise<Tokens> {
    const r = await fetch(`${ISSUER}/api/accounts/oauth/token`, { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body), signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`Accesso non riuscito (${r.status}). Ripeti il login con ChatGPT.`);
    const value = await r.json() as Tokens;
    if (typeof value.access_token !== 'string' || !value.access_token || value.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(value.expires_in) || value.expires_in <= 0) throw new Error('Credenziali restituite non valide.');
    return value;
  }
  async token(): Promise<string> {
    const account = this.selected();
    if (!account?.accessToken) throw new Error('Accedi con ChatGPT prima di inviare una domanda.');
    if (account.expiresAt > Date.now() + 60_000) return account.accessToken;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      if (!account.refreshToken) throw new Error('Sessione scaduta. Accedi nuovamente.');
      const tokens = await this.tokens({ grant_type: 'refresh_token', client_id: account.clientId, refresh_token: account.refreshToken, resource: RESOURCE });
      if (tokens.id_token) await verifyIdentity(tokens.id_token, jwks, account.clientId, undefined, account.subject);
      requirePlanScope(tokens.scope ?? account.scope);
      Object.assign(account, { accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? account.refreshToken,
        idToken: tokens.id_token ?? account.idToken, scope: tokens.scope ?? account.scope, expiresAt: Date.now() + tokens.expires_in * 1000 });
      this.save(); return tokens.access_token;
    })();
    try { return await this.refreshing; } finally { this.refreshing = undefined; }
  }
  async logout() {
    this.cancelLogin();
    if (this.refreshing) await this.refreshing.catch(() => {});
    const account = this.selected();
    let revoked = !account?.refreshToken;
    if (account?.refreshToken) {
      try {
        const discovery = await fetch(`${ISSUER}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) }).then(r => r.json());
        const endpoint = new URL(discovery.revocation_endpoint);
        if (endpoint.origin !== ISSUER) throw new Error('Unexpected issuer');
        for (let attempt = 0; attempt < 2 && !revoked; attempt++) {
          if (attempt) await new Promise(r => setTimeout(r, 500));
          const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: account.refreshToken, token_type_hint: 'refresh_token', client_id: account.clientId }), signal: AbortSignal.timeout(10_000) });
          revoked = r.status === 200;
          if (r.status < 500) break;
        }
      } catch { /* Clear locally even if remote revocation is unavailable. */ }
    }
    if (account) { delete account.accessToken; delete account.refreshToken; delete account.idToken; account.expiresAt = 0; }
    this.vault.active = undefined; this.save();
    return { ...this.status(), warning: revoked ? '' : 'Disconnessione locale completata. Revoca remota non confermata: puoi scollegare stemhelp dalle impostazioni ChatGPT.' };
  }
  async models(): Promise<{ id: string; name: string }[]> {
    const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${await this.token()}` }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`Catalogo modelli non disponibile (${r.status}). Riprova l’accesso.`);
    const data = await r.json();
    if (!Array.isArray(data.models)) throw new Error('Formato del catalogo modelli non riconosciuto.');
    return data.models.filter((m: any) => m.visibility === 'list' && typeof m.slug === 'string').map((m: any) => ({ id: m.slug, name: m.display_name || m.slug }));
  }
}
