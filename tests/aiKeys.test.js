import request from 'supertest';
import app from '../src/app.js';
import { getDecryptedKey } from '../src/modules/aiKeys/aiKeys.service.js';

let accessToken;
let userId;

beforeAll(async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'aikeys@example.com', password: 'password123', name: 'AI Keys User' });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'aikeys@example.com', password: 'password123' });

  accessToken = loginRes.body.data.accessToken;
  userId = loginRes.body.data.user.id;
});

// ─── AI keys ──────────────────────────────────────────────────────────────────

describe('PUT /api/user/ai-keys', () => {
  it('returns openaiSet: true without exposing the key value', async () => {
    const res = await request(app)
      .put('/api/user/ai-keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ openaiKey: 'sk-test-openai-key-123' });

    expect(res.status).toBe(200);
    expect(res.body.data.openaiSet).toBe(true);
    expect(res.body.data.anthropicSet).toBe(false);
    // The response must never contain the raw key or the ciphertext.
    expect(res.body.data.openaiKey).toBeUndefined();
    expect(res.body.data.openaiKeyEnc).toBeUndefined();
  });

  it('returns 400 when no key is provided', async () => {
    const res = await request(app)
      .put('/api/user/ai-keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/user/ai-keys', () => {
  it('returns boolean flags, never the key value', async () => {
    // Ensure a key is stored first.
    await request(app)
      .put('/api/user/ai-keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ openaiKey: 'sk-test-openai-key-123' });

    const res = await request(app)
      .get('/api/user/ai-keys')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.openaiSet).toBe(true);
    expect(res.body.data.anthropicSet).toBe(false);
    expect(res.body.data.openaiKey).toBeUndefined();
    expect(res.body.data.openaiKeyEnc).toBeUndefined();
    expect(res.body.data.anthropicKey).toBeUndefined();
    expect(res.body.data.anthropicKeyEnc).toBeUndefined();
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/user/ai-keys');
    expect(res.status).toBe(401);
  });
});

describe('getDecryptedKey (round-trip)', () => {
  it('returns the original plaintext that was stored', async () => {
    const original = 'sk-anthropic-round-trip-test-key';

    await request(app)
      .put('/api/user/ai-keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ anthropicKey: original });

    const decrypted = await getDecryptedKey(userId, 'anthropic');
    expect(decrypted).toBe(original);
  });

  it('returns null for a provider whose key has not been set', async () => {
    // Use a fresh user with no keys at all.
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'nokeys@example.com', password: 'password123', name: 'No Keys User' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nokeys@example.com', password: 'password123' });

    const noKeysUserId = loginRes.body.data.user.id;

    const result = await getDecryptedKey(noKeysUserId, 'openai');
    expect(result).toBeNull();
  });
});
