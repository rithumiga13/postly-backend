/**
 * Tests for POST /api/content/generate.
 *
 * ESM note: jest.mock() cannot be hoisted in native ESM. We use
 * jest.unstable_mockModule() paired with dynamic import() so that mock
 * registrations are in place before the app module graph is resolved.
 */

import { jest } from '@jest/globals';

// ── Mock registrations (must precede all dynamic imports) ────────────────────

jest.unstable_mockModule('../src/modules/ai/providers/openai.js', () => ({
  generateOpenAI: jest.fn(),
}));

jest.unstable_mockModule('../src/modules/ai/providers/anthropic.js', () => ({
  generateAnthropic: jest.fn(),
}));

// Mock the full aiKeys.service to avoid DB hits for key lookups in these tests.
jest.unstable_mockModule('../src/modules/aiKeys/aiKeys.service.js', () => ({
  getDecryptedKey: jest.fn(),
  getAiKeys: jest.fn(),
  upsertAiKeys: jest.fn(),
}));

// ── Dynamic imports (resolved after mocks are registered) ────────────────────

const { default: app } = await import('../src/app.js');
const { default: request } = await import('supertest');
const { generateOpenAI } = await import('../src/modules/ai/providers/openai.js');
const { getDecryptedKey } = await import('../src/modules/aiKeys/aiKeys.service.js');
const { enforcePlatformRules, generateForAll } = await import('../src/modules/ai/ai.service.js');
// env is a plain mutable object — mutating it in tests affects all co-loaded modules.
const { env } = await import('../src/config/env.js');

// ─── Shared test helpers ──────────────────────────────────────────────────────

const VALID_BODY = {
  idea: 'Serverless databases are the future of backend development',
  post_type: 'opinion',
  platforms: ['twitter', 'linkedin'],
  tone: 'professional',
  language: 'en',
  model: 'openai',
};

// Fixed content the mock provider returns for each platform.
const MOCK_CONTENT = {
  twitter: 'Serverless DBs cut ops overhead by 80%. The backend is changing. #Serverless #DevOps',
  linkedin:
    'The shift to serverless databases is not just a trend — it is a fundamental change.\n\n' +
    'Traditional databases require provisioning, scaling, and ongoing maintenance. ' +
    'Serverless flips this model entirely. You pay for what you use, scale to zero when idle, ' +
    'and eliminate an entire category of operational burden.\n\n' +
    'The teams adopting this early are shipping faster, spending less, and sleeping better.\n\n' +
    'If you have not evaluated serverless options for your next project, the calculus has changed. ' +
    'The tooling is mature, the pricing is competitive, and the developer experience has never been better.\n\n' +
    '#Serverless #BackendDevelopment #CloudArchitecture #DevOps',
};

let accessToken;

beforeAll(async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'aigenerate@example.com', password: 'password123', name: 'AI Generate User' });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'aigenerate@example.com', password: 'password123' });

  accessToken = loginRes.body.data.accessToken;
});

beforeEach(() => {
  // Safe defaults: user has a key, provider calls succeed.
  getDecryptedKey.mockResolvedValue('sk-test-key-123');
  generateOpenAI.mockImplementation(({ systemPrompt }) => {
    const platform = systemPrompt.includes('Twitter') ? 'twitter' : 'linkedin';
    const content = MOCK_CONTENT[platform] ?? 'Generic content #Test';
    return Promise.resolve({ content, tokensUsed: 50 });
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── 1. Validation — invalid request bodies ──────────────────────────────────

describe('POST /api/content/generate — request validation', () => {
  it('returns 400 when idea exceeds 500 characters', async () => {
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...VALID_BODY, idea: 'x'.repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  it('returns 400 when platforms contains an unknown value', async () => {
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...VALID_BODY, platforms: ['twitter', 'tiktok'] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when post_type is missing', async () => {
    const { post_type: _omit, ...bodyWithout } = VALID_BODY;
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(bodyWithout);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when platforms array is empty', async () => {
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...VALID_BODY, platforms: [] });

    expect(res.status).toBe(400);
  });

  it('returns 400 when platforms contains duplicate values', async () => {
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...VALID_BODY, platforms: ['twitter', 'twitter'] });

    expect(res.status).toBe(400);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .post('/api/content/generate')
      .send(VALID_BODY);

    expect(res.status).toBe(401);
  });
});

// ─── 2. enforcePlatformRules — truncation ────────────────────────────────────

describe('enforcePlatformRules — truncation', () => {
  it('truncates a 350-char twitter response to 279 chars + ellipsis (280 total)', () => {
    const input = 'A'.repeat(350);
    const result = enforcePlatformRules('twitter', input);

    expect(result.content).toHaveLength(280);
    expect(result.content.endsWith('…')).toBe(true);
    expect(result.char_count).toBe(280);
  });

  it('does not truncate content that is exactly at the twitter limit', () => {
    const input = 'A'.repeat(280);
    const result = enforcePlatformRules('twitter', input);

    expect(result.char_count).toBe(280);
    expect(result.content.endsWith('…')).toBe(false);
  });

  it('does not truncate linkedin content (no maxChars limit)', () => {
    const input = 'L'.repeat(1500);
    const result = enforcePlatformRules('linkedin', input);

    expect(result.char_count).toBe(1500);
    expect(result.content.endsWith('…')).toBe(false);
  });

  it('trims trailing whitespace before counting', () => {
    const input = 'hello   ';
    const result = enforcePlatformRules('twitter', input);

    expect(result.content).toBe('hello');
    expect(result.char_count).toBe(5);
  });
});

// ─── 3. enforcePlatformRules — hashtag extraction ────────────────────────────

describe('enforcePlatformRules — hashtag extraction', () => {
  it('extracts hashtags from a sample string', () => {
    const input = 'Building for scale is hard. #Engineering #Backend #Serverless';
    const result = enforcePlatformRules('twitter', input);

    expect(result.hashtags).toEqual(['#Engineering', '#Backend', '#Serverless']);
    expect(result.hashtags).toHaveLength(3);
  });

  it('returns an empty array when there are no hashtags', () => {
    const result = enforcePlatformRules('threads', 'just a plain thought, no tags here');
    expect(result.hashtags).toEqual([]);
  });

  it('extracts hashtags containing numbers', () => {
    const input = 'Loving #Node20 and #ai lately';
    const result = enforcePlatformRules('threads', input);

    expect(result.hashtags).toContain('#Node20');
    expect(result.hashtags).toContain('#ai');
  });
});

// ─── 4. Service — no_api_key error ───────────────────────────────────────────

describe('generateForAll — no API key available', () => {
  it('throws AppError with code no_api_key when neither user key nor env key is set', async () => {
    getDecryptedKey.mockResolvedValue(null);

    // env is the live shared object — mutating it here affects ai.service.js too.
    const savedOpenAI = env.OPENAI_API_KEY;
    const savedAnthropic = env.ANTHROPIC_API_KEY;
    env.OPENAI_API_KEY = undefined;
    env.ANTHROPIC_API_KEY = undefined;

    let thrownError;
    try {
      await generateForAll({
        userId: 'test-user-id',
        idea: 'test idea',
        postType: 'announcement',
        platforms: ['twitter'],
        tone: 'casual',
        language: 'en',
        model: 'openai',
      });
    } catch (err) {
      thrownError = err;
    } finally {
      env.OPENAI_API_KEY = savedOpenAI;
      env.ANTHROPIC_API_KEY = savedAnthropic;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError.code).toBe('no_api_key');
    expect(thrownError.statusCode).toBe(400);
  });
});

// ─── 5. Controller — response shape with mocked provider ─────────────────────

describe('POST /api/content/generate — response shape', () => {
  it('returns only the requested platforms in generated', async () => {
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...VALID_BODY, platforms: ['twitter', 'linkedin'] });

    expect(res.status).toBe(200);
    expect(res.body.data.generated).toHaveProperty('twitter');
    expect(res.body.data.generated).toHaveProperty('linkedin');
    expect(res.body.data.generated).not.toHaveProperty('instagram');
    expect(res.body.data.generated).not.toHaveProperty('threads');
  });

  it('each platform result contains content, char_count, and hashtags', async () => {
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...VALID_BODY, platforms: ['twitter'] });

    expect(res.status).toBe(200);
    const twitter = res.body.data.generated.twitter;
    expect(typeof twitter.content).toBe('string');
    expect(typeof twitter.char_count).toBe('number');
    expect(Array.isArray(twitter.hashtags)).toBe(true);
  });

  it('response includes model_used and tokens_used', async () => {
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...VALID_BODY, platforms: ['twitter', 'linkedin'] });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.model_used).toBe('string');
    expect(typeof res.body.data.tokens_used).toBe('number');
    // Two platforms at 50 tokens each.
    expect(res.body.data.tokens_used).toBe(100);
  });

  it('tokens_used is the sum across all requested platforms', async () => {
    generateOpenAI.mockResolvedValue({ content: 'Short content #Test', tokensUsed: 30 });

    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...VALID_BODY, platforms: ['twitter', 'linkedin', 'instagram', 'threads'] });

    expect(res.status).toBe(200);
    // 4 platforms × 30 tokens.
    expect(res.body.data.tokens_used).toBe(120);
  });
});
