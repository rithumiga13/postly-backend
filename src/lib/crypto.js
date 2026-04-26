import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;   // 96-bit IV is recommended for GCM
const TAG_BYTES = 16;  // GCM auth tag length

const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex');

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string} `iv:authTag:ciphertext` — all segments base64-encoded, colon-joined.
 */
export function encrypt(plaintext) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, KEY, iv, { authTagLength: TAG_BYTES });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Decrypt a value produced by `encrypt`.
 * @param {string} payload `iv:authTag:ciphertext`
 * @returns {string} original plaintext
 */
export function decrypt(payload) {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, KEY, iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * Run a round-trip encrypt/decrypt to verify the ENCRYPTION_KEY is valid.
 * Called once at dev startup — throws on mismatch rather than silently failing later.
 */
export function selfTest() {
  const sample = 'postly-crypto-self-test';
  const recovered = decrypt(encrypt(sample));
  if (recovered !== sample) {
    throw new Error('crypto self-test failed: round-trip mismatch');
  }
}
