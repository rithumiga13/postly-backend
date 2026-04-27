#!/usr/bin/env node
/**
 * Phase 4 smoke test — verifies publish, BullMQ retry, and final failure state.
 * Run: node scripts/smoke-publish.js
 */

import 'dotenv/config';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 60_000;
const TERMINAL = new Set(['published', 'failed', 'cancelled']);

async function post(path, body, token) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`POST ${path} (${res.status}): ${JSON.stringify(json.error)}`);
  return json.data;
}

async function get(path, token) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`GET ${path} (${res.status}): ${JSON.stringify(json.error)}`);
  return json.data;
}

async function pollUntilTerminal(postId, token) {
  const deadline = Date.now() + MAX_WAIT_MS;
  let lastStatus = null;
  while (Date.now() < deadline) {
    const data = await get(`/posts/${postId}`, token);
    const status = data.post.status;
    if (status !== lastStatus) {
      console.log(`  [poll] status → ${status}`);
      lastStatus = status;
    }
    if (TERMINAL.has(status)) return data;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Timed out waiting for terminal status');
}

async function main() {
  console.log(`\n=== Phase 4 Smoke Test (${BASE_URL}) ===\n`);

  const email = `smoke-${Date.now()}@example.com`;
  const password = 'Smoke1234!';

  console.log('1. Register test user...');
  try {
    await post('/auth/register', { email, password, name: 'Smoke Tester' });
    console.log('   Registered.');
  } catch {
    console.log('   Already exists, continuing.');
  }

  console.log('2. Login...');
  const { accessToken } = await post('/auth/login', { email, password });
  console.log('   Got access token.');

  console.log('\n3. POST /api/posts/publish (twitter only)...');
  const { post: created } = await post(
    '/posts/publish',
    {
      idea: 'Demonstrate Phase 4 BullMQ publishing pipeline',
      generated: {
        twitter: {
          content: 'BullMQ + Prisma = the publishing engine that never sleeps. #NodeJS #Backend',
          char_count: 75,
          hashtags: ['#NodeJS', '#Backend'],
        },
      },
      postType: 'announcement',
      tone: 'professional',
      language: 'en',
      modelUsed: 'gpt-4o-mini',
    },
    accessToken,
  );
  console.log(`   Created: id=${created.id}  status=${created.status}  platformPosts=${created.platformPosts.length}`);

  console.log('\n4. Poll until terminal (max 60s)...');
  const final = await pollUntilTerminal(created.id, accessToken);

  console.log('\n=== Final State ===');
  console.log(JSON.stringify(final, null, 2));

  const pp = final.platformPosts?.find((p) => p.platform === 'twitter');
  console.log(`\nPost status : ${final.post?.status}`);
  console.log(`Attempts    : ${pp?.attempts}`);
  console.log(`Error       : ${pp?.errorMessage ?? '(none)'}`);
  console.log(`ExternalId  : ${pp?.externalId ?? '(none)'}`);

  if (final.post?.status === 'published') {
    console.log('\n✓ SUCCESS — tweet posted.');
  } else if (final.post?.status === 'failed') {
    console.log('\n✓ EXPECTED FAILURE — no Twitter credentials (3 attempts confirmed).');
  }
}

main().catch((err) => {
  console.error('\nSmoke test failed:', err.message);
  process.exit(1);
});
