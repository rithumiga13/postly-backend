#!/usr/bin/env node
/**
 * Live deployment smoke test.
 * Usage: node scripts/verify-live.js
 *        LIVE_URL=https://... node scripts/verify-live.js
 */

const BASE_URL = process.env.LIVE_URL ?? 'https://postly-backend-production-5259.up.railway.app';
const EMAIL = `verify+${Date.now()}@postly.test`;
const PASSWORD = 'Verify1234!';

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  PASS  ${label}`);
  passed++;
}

function fail(label, reason) {
  console.log(`  FAIL  ${label} — ${reason}`);
  failed++;
}

async function get(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${BASE_URL}${path}`, { headers });
}

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function run() {
  console.log(`\nverify-live → ${BASE_URL}\n`);

  // 1. Health check
  try {
    const res = await get('/api/v1/healthz');
    const body = await res.json();
    if (res.status === 200 && body.data?.status === 'ok' && body.data?.dbOk === true && body.data?.redisOk === true) {
      pass('GET /api/v1/healthz → 200, status ok, dbOk, redisOk');
    } else {
      fail('GET /api/v1/healthz', `status=${res.status} body=${JSON.stringify(body)}`);
    }
  } catch (err) {
    fail('GET /api/v1/healthz', err.message);
  }

  // 2. Register
  let userId;
  try {
    const res = await post('/api/v1/auth/register', { email: EMAIL, password: PASSWORD, name: 'Verify User' });
    const body = await res.json();
    if (res.status === 201 && body.data?.user?.id) {
      userId = body.data.user.id;
      pass('POST /api/v1/auth/register → 201, user created');
    } else {
      fail('POST /api/v1/auth/register', `status=${res.status} body=${JSON.stringify(body)}`);
    }
  } catch (err) {
    fail('POST /api/v1/auth/register', err.message);
  }

  // 3. Login
  let accessToken;
  try {
    const res = await post('/api/v1/auth/login', { email: EMAIL, password: PASSWORD });
    const body = await res.json();
    if (res.status === 200 && body.data?.accessToken) {
      accessToken = body.data.accessToken;
      pass('POST /api/v1/auth/login → 200, accessToken captured');
    } else {
      fail('POST /api/v1/auth/login', `status=${res.status} body=${JSON.stringify(body)}`);
    }
  } catch (err) {
    fail('POST /api/v1/auth/login', err.message);
  }

  // 4. /me
  try {
    const res = await get('/api/v1/auth/me', accessToken);
    const body = await res.json();
    if (res.status === 200 && body.data?.user?.email === EMAIL) {
      pass('GET /api/v1/auth/me → 200, email matches');
    } else {
      fail('GET /api/v1/auth/me', `status=${res.status} email=${body.data?.user?.email}`);
    }
  } catch (err) {
    fail('GET /api/v1/auth/me', err.message);
  }

  // 5. Content generation
  try {
    const res = await post(
      '/api/v1/content/generate',
      { idea: 'verify-live smoke test', post_type: 'announcement', platforms: ['twitter'], tone: 'professional', language: 'en', model: 'anthropic' },
      accessToken,
    );
    const body = await res.json();
    if (res.status === 200 && body.data?.generated?.twitter?.content) {
      pass('POST /api/v1/content/generate → 200, twitter content non-empty');
    } else if (res.status === 400 && body.error?.code === 'no_api_key') {
      pass('POST /api/v1/content/generate → 400 no_api_key (ANTHROPIC_API_KEY not configured — expected)');
    } else {
      fail('POST /api/v1/content/generate', `status=${res.status} body=${JSON.stringify(body)}`);
    }
  } catch (err) {
    fail('POST /api/v1/content/generate', err.message);
  }

  // 6. Dashboard stats
  try {
    const res = await get('/api/v1/dashboard/stats', accessToken);
    const body = await res.json();
    if (res.status === 200 && typeof body.data?.totalPosts === 'number') {
      pass('GET /api/v1/dashboard/stats → 200, totalPosts is a number');
    } else {
      fail('GET /api/v1/dashboard/stats', `status=${res.status} body=${JSON.stringify(body)}`);
    }
  } catch (err) {
    fail('GET /api/v1/dashboard/stats', err.message);
  }

  const total = passed + failed;
  console.log(`\nverify-live: ${passed}/${total} PASS${failed > 0 ? ' — see failures above' : ''}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
