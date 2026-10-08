import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { CourseStore } from '../desktop/store.js';
import { buildInput } from '../desktop/context.js';
import { transaction, authorizationUrl, validateCallback, verifyIdentity, requirePlanScope, ISSUER } from '../desktop/oauth-core.js';
import { consumeEvents } from '../desktop/inference.js';

test('corso persistente dopo riapertura; nuova sessione senza messaggi precedenti', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-test-'));
  try {
    let db = new CourseStore(join(directory, 'study.sqlite'));
    const course = db.save({ id: '', title: 'Algebra', description: 'Nota personale', syllabus: 'Basi e autovalori' });
    db.save({ id: '', title: 'Fisica', description: '', syllabus: 'Termodinamica' });
    db.close(); db = new CourseStore(join(directory, 'study.sqlite'));
    const loaded = db.get(course.id);
    const prior = buildInput(loaded, [{ role: 'user', content: 'VECCHIO_MESSAGGIO' }], 'Slide corrente', 'Domanda');
    const fresh = JSON.stringify(buildInput(loaded, [], 'Nuova slide', 'Altra domanda'));
    assert.match(JSON.stringify(prior), /VECCHIO_MESSAGGIO/);
    assert.match(fresh, /Basi e autovalori/);
    assert.match(fresh, /Nuova slide/);
    assert.doesNotMatch(fresh, /VECCHIO_MESSAGGIO|Termodinamica/);
    db.close();
  } finally { rmSync(directory, { recursive: true }); }
});

test('OAuth: PKCE e nonce unici, callback legata a stato e registrazione', () => {
  const t = transaction('http://127.0.0.1:54321/auth/callback');
  const other = transaction(t.redirectUri);
  assert.notEqual(t.state, other.state); assert.notEqual(t.verifier, other.verifier); assert.notEqual(t.nonce, other.nonce);
  const url = new URL(authorizationUrl(t, 'urn:uuid:host'));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(url.searchParams.get('redirect_uri'), t.redirectUri);
  const callback = new URL(`${t.redirectUri}?code=test&state=${t.state}&client_id=oaiapp_example`);
  assert.equal(validateCallback(t, callback).clientId, 'oaiapp_example');
  callback.searchParams.set('state', 'wrong'); assert.throws(() => validateCallback(t, callback));
  callback.searchParams.set('state', t.state); callback.searchParams.delete('client_id'); assert.throws(() => validateCallback(t, callback));
  const returning = { ...t, clientId: 'oaiapp_original' };
  callback.searchParams.set('client_id', 'oaiapp_other'); assert.throws(() => validateCallback(returning, callback));
  assert.throws(() => validateCallback({ ...t, expiresAt: 0 }, callback));
  assert.throws(() => requirePlanScope('openid email'));
  requirePlanScope('openid chatgpt.tokens.use.direct');
});

test('OIDC: firma, issuer, audience, scadenza, nonce e identità verificati', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const sign = (issuer = ISSUER, audience = 'oaiapp_test', expiration = '2m') => new SignJWT({ nonce: 'expected' })
    .setProtectedHeader({ alg: 'RS256' }).setSubject('student').setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiration).sign(privateKey);
  const resolver = async () => publicKey;
  const token = await sign();
  assert.equal((await verifyIdentity(token, resolver, 'oaiapp_test', 'expected')).sub, 'student');
  await assert.rejects(() => verifyIdentity(token, resolver, 'oaiapp_test', 'wrong'));
  await assert.rejects(() => verifyIdentity(token, resolver, 'oaiapp_test', 'expected', 'other'));
  await assert.rejects(() => verifyIdentity(token, resolver, 'wrong', 'expected'));
  await assert.rejects(() => verifyIdentity('not-a-jwt', resolver, 'oaiapp_test', 'expected'));
  await assert.rejects(() => verifyIdentity(token.slice(0, -20) + 'INVALID_SIGNATURE', resolver, 'oaiapp_test', 'expected'));
  const wrongIssuer = await sign('https://example.org');
  await assert.rejects(() => verifyIdentity(wrongIssuer, resolver, 'oaiapp_test', 'expected'));
  const expired = await sign(ISSUER, 'oaiapp_test', '-1h');
  await assert.rejects(() => verifyIdentity(expired, resolver, 'oaiapp_test', 'expected'));
});

function stream(events: object[], size = 7) {
  const bytes = new TextEncoder().encode(events.map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join(''));
  return new ReadableStream<Uint8Array>({ start(controller) { for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size)); controller.close(); } });
}
test('stream frammentato: UTF-8, delta e conferma finale obbligatoria', async () => {
  let displayed = '';
  const result = await consumeEvents(stream([{ type: 'response.output_text.delta', delta: 'Perché λ?' }, { type: 'response.completed', response: { status: 'completed' } }], 1), value => { displayed += value; });
  assert.equal(result, 'Perché λ?'); assert.equal(displayed, result);
  await assert.rejects(() => consumeEvents(stream([{ type: 'response.output_text.delta', delta: 'Parziale' }]), () => {}), /interrotta/);
});
test('limite piano dopo un delta: la risposta non è considerata completata', async () => {
  await assert.rejects(() => consumeEvents(stream([
    { type: 'response.output_text.delta', delta: 'Inizio' },
    { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }
  ]), () => {}), /piano esaurita/);
});
