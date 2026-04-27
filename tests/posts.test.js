/**
 * Tests for POST /api/posts/publish and GET /api/posts (list + filter).
 *
 * Uses jest.unstable_mockModule + dynamic imports so the BullMQ queue is
 * mocked before the app module graph resolves.
 */

import { jest } from '@jest/globals';

// ── Mock registrations (must precede all dynamic imports) ─────────────────────

const mockEnqueuePlatformPost = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../src/modules/publishing/queue.js', () => ({
  enqueuePlatformPost: mockEnqueuePlatformPost,
  PLATFORMS: ['twitter', 'linkedin', 'instagram', 'threads'],
  getQueue: jest.fn(),
  queueName: (p) => `publishing-${p}`,
}));

// Prevent worker startup from touching Redis in tests.
jest.unstable_mockModule('../src/worker.js', () => ({
  startWorkers: jest.fn(),
}));

// ── Dynamic imports ───────────────────────────────────────────────────────────

const { default: request } = await import('supertest');
const { default: app } = await import('../src/app.js');
const { default: prisma } = await import('../src/lib/prisma.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function registerAndLogin(email) {
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Test1234!', name: 'Test User' });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'Test1234!' });

  return res.body.data.accessToken;
}

const STUB_GENERATED = {
  twitter: {
    content: 'Hello from the publishing test #NodeJS #Backend',
    char_count: 48,
    hashtags: ['#NodeJS', '#Backend'],
  },
};

const STUB_BODY = {
  idea: 'Test idea for Phase 4 pipeline',
  generated: STUB_GENERATED,
  postType: 'announcement',
  tone: 'professional',
  language: 'en',
  modelUsed: 'gpt-4o-mini',
};

// ── POST /api/posts/publish ───────────────────────────────────────────────────

describe('POST /api/posts/publish', () => {
  let token;

  beforeAll(async () => {
    token = await registerAndLogin(`publish-${Date.now()}@example.com`);
    mockEnqueuePlatformPost.mockClear();
  });

  it('returns 201 with post and platform posts', async () => {
    const res = await request(app)
      .post('/api/posts/publish')
      .set('Authorization', `Bearer ${token}`)
      .send(STUB_BODY);

    expect(res.status).toBe(201);
    expect(res.body.data.post.status).toBe('queued');
    expect(res.body.data.post.platformPosts).toHaveLength(1);
    expect(res.body.data.post.platformPosts[0].platform).toBe('twitter');
    expect(res.body.data.post.platformPosts[0].status).toBe('queued');
  });

  it('persists Post and PlatformPost rows to the DB', async () => {
    const res = await request(app)
      .post('/api/posts/publish')
      .set('Authorization', `Bearer ${token}`)
      .send(STUB_BODY);

    const postId = res.body.data.post.id;
    const dbPost = await prisma.post.findUnique({
      where: { id: postId },
      include: { platformPosts: true },
    });

    expect(dbPost).not.toBeNull();
    expect(dbPost.idea).toBe(STUB_BODY.idea);
    expect(dbPost.platformPosts).toHaveLength(1);
    expect(dbPost.platformPosts[0].content).toBe(STUB_GENERATED.twitter.content);
  });

  it('calls enqueuePlatformPost once per platform in generated', async () => {
    mockEnqueuePlatformPost.mockClear();

    const multiGenerated = {
      twitter: STUB_GENERATED.twitter,
      linkedin: {
        content: 'LinkedIn version with more detail and professional tone #LinkedIn #Content',
        char_count: 73,
        hashtags: ['#LinkedIn', '#Content'],
      },
    };

    await request(app)
      .post('/api/posts/publish')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...STUB_BODY, generated: multiGenerated });

    expect(mockEnqueuePlatformPost).toHaveBeenCalledTimes(2);
    const platforms = mockEnqueuePlatformPost.mock.calls.map((c) => c[0].platform);
    expect(platforms).toContain('twitter');
    expect(platforms).toContain('linkedin');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/posts/publish').send(STUB_BODY);
    expect(res.status).toBe(401);
  });

  it('returns 400 when generated is empty', async () => {
    const res = await request(app)
      .post('/api/posts/publish')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...STUB_BODY, generated: {} });

    expect(res.status).toBe(400);
  });
});

// ── GET /api/posts ────────────────────────────────────────────────────────────

describe('GET /api/posts', () => {
  let token;
  let userId;

  beforeAll(async () => {
    const email = `list-${Date.now()}@example.com`;
    token = await registerAndLogin(email);
    const user = await prisma.user.findUnique({ where: { email } });
    userId = user.id;

    await prisma.post.create({
      data: {
        userId,
        idea: 'First post',
        postType: 'announcement',
        tone: 'professional',
        language: 'en',
        modelUsed: 'gpt-4o-mini',
        status: 'queued',
        platformPosts: { create: [{ platform: 'twitter', content: 'Tweet 1', status: 'queued' }] },
      },
    });

    await prisma.post.create({
      data: {
        userId,
        idea: 'Second post',
        postType: 'educational',
        tone: 'casual',
        language: 'en',
        modelUsed: 'gpt-4o-mini',
        status: 'failed',
        platformPosts: {
          create: [{ platform: 'linkedin', content: 'LinkedIn post', status: 'failed', errorMessage: 'Not implemented' }],
        },
      },
    });
  });

  it('returns paginated posts scoped to the authenticated user', async () => {
    const res = await request(app)
      .get('/api/posts?page=1&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(10);
  });

  it('filters by status=failed', async () => {
    const res = await request(app)
      .get('/api/posts?status=failed')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    res.body.data.forEach((p) => expect(p.status).toBe('failed'));
  });

  it('filters by status=queued', async () => {
    const res = await request(app)
      .get('/api/posts?status=queued')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    res.body.data.forEach((p) => expect(p.status).toBe('queued'));
  });

  it('filters by platform=linkedin', async () => {
    const res = await request(app)
      .get('/api/posts?platform=linkedin')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    res.body.data.forEach((p) => {
      const platforms = p.platformPosts.map((pp) => pp.platform);
      expect(platforms).toContain('linkedin');
    });
  });

  it('respects limit=1 pagination', async () => {
    const res = await request(app)
      .get('/api/posts?page=1&limit=1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/posts');
    expect(res.status).toBe(401);
  });
});
