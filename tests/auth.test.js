import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import prisma from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';

describe('POST /api/auth/register', () => {
  it('returns 201 with user, no passwordHash in response', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'register@example.com', password: 'password123', name: 'Register User' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe('register@example.com');
    expect(res.body.data.user.name).toBe('Register User');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });
});

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@example.com', password: 'password123', name: 'Login User' });
  });

  it('returns 401 with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/auth/me', () => {
  let accessToken;

  beforeAll(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'me@example.com', password: 'password123', name: 'Me User' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'me@example.com', password: 'password123' });

    accessToken = loginRes.body.data.accessToken;
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with an expired token', async () => {
    const expiredToken = jwt.sign(
      { sub: 'fake-id', type: 'access', email: 'fake@example.com' },
      env.JWT_SECRET,
      { expiresIn: -1 },
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });

  it('returns 200 with user when token is valid', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('me@example.com');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });
});

describe('Refresh token rotation', () => {
  let initialRefreshToken;
  let userId;

  beforeAll(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'rotation@example.com', password: 'password123', name: 'Rotation User' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rotation@example.com', password: 'password123' });

    initialRefreshToken = loginRes.body.data.refreshToken;
    userId = loginRes.body.data.user.id;
  });

  it('returns a new token pair on valid refresh', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: initialRefreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.refreshToken).not.toBe(initialRefreshToken);
  });

  // After the test above, initialRefreshToken is revoked. Replaying it simulates
  // token theft, which must trigger full-session revocation for this user.
  it('rejects a replayed refresh token and revokes all sessions', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: initialRefreshToken });

    expect(res.status).toBe(401);

    // Verify directly in the DB that no active tokens remain for this user.
    const activeTokens = await prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
    });
    expect(activeTokens).toHaveLength(0);
  });
});
