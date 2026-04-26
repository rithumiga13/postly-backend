import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/lib/prisma.js';

let accessToken;
let userId;

beforeAll(async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'profile@example.com', password: 'password123', name: 'Profile User' });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'profile@example.com', password: 'password123' });

  accessToken = loginRes.body.data.accessToken;
  userId = loginRes.body.data.user.id;
});

// ─── Profile ──────────────────────────────────────────────────────────────────

describe('PUT /api/user/profile', () => {
  it('updates only provided fields, leaves others untouched', async () => {
    // Set an initial bio.
    await request(app)
      .put('/api/user/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ bio: 'Initial bio' });

    // Update only name; bio must remain unchanged.
    const res = await request(app)
      .put('/api/user/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Updated Name');
    expect(res.body.data.user.bio).toBe('Initial bio');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).put('/api/user/profile').send({ name: 'X' });
    expect(res.status).toBe(401);
  });
});

// ─── Social accounts ──────────────────────────────────────────────────────────

describe('POST /api/user/social-accounts', () => {
  it('encrypts accessToken — DB row must not contain the plaintext', async () => {
    const plainToken = 'my-plaintext-access-token';

    const res = await request(app)
      .post('/api/user/social-accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ platform: 'twitter', handle: 'testuser', accessToken: plainToken });

    expect(res.status).toBe(201);

    const row = await prisma.socialAccount.findFirst({ where: { userId, platform: 'twitter' } });
    expect(row).toBeTruthy();
    expect(row.accessTokenEnc).not.toBe(plainToken);
    // Ciphertext is formatted as iv:authTag:ciphertext (three colon-separated base64 segments).
    expect(row.accessTokenEnc.split(':').length).toBe(3);
  });

  it('returns 409 when the same platform is connected a second time', async () => {
    const res = await request(app)
      .post('/api/user/social-accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ platform: 'twitter', accessToken: 'another-token' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('GET /api/user/social-accounts', () => {
  it('response never includes accessTokenEnc or refreshTokenEnc', async () => {
    const res = await request(app)
      .get('/api/user/social-accounts')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.accounts)).toBe(true);

    for (const account of res.body.data.accounts) {
      expect(account.accessTokenEnc).toBeUndefined();
      expect(account.refreshTokenEnc).toBeUndefined();
    }
  });
});

describe('DELETE /api/user/social-accounts/:id', () => {
  it('returns 404 when attempting to delete another user\'s account', async () => {
    // Register and log in as a second user.
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'other-social@example.com', password: 'password123', name: 'Other User' });

    const otherLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'other-social@example.com', password: 'password123' });

    const otherToken = otherLogin.body.data.accessToken;

    // Other user connects a linkedin account.
    const createRes = await request(app)
      .post('/api/user/social-accounts')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ platform: 'linkedin', accessToken: 'other-linkedin-token' });

    expect(createRes.status).toBe(201);
    const otherAccountId = createRes.body.data.account.id;

    // Original user tries to delete it — must get 404, not 403.
    const deleteRes = await request(app)
      .delete(`/api/user/social-accounts/${otherAccountId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(404);
  });

  it('successfully deletes own account', async () => {
    // Create a fresh instagram account to delete.
    const createRes = await request(app)
      .post('/api/user/social-accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ platform: 'instagram', accessToken: 'ig-token' });

    expect(createRes.status).toBe(201);
    const id = createRes.body.data.account.id;

    const deleteRes = await request(app)
      .delete(`/api/user/social-accounts/${id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.ok).toBe(true);
  });
});
