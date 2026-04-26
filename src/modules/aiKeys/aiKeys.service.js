import prisma from '../../lib/prisma.js';
import { encrypt, decrypt } from '../../lib/crypto.js';

function formatResponse(aiKey) {
  if (!aiKey) {
    return { openaiSet: false, anthropicSet: false, updatedAt: null };
  }
  return {
    openaiSet: aiKey.openaiKeyEnc !== null,
    anthropicSet: aiKey.anthropicKeyEnc !== null,
    updatedAt: aiKey.updatedAt,
  };
}

export async function getAiKeys(userId) {
  const aiKey = await prisma.aiKey.findUnique({ where: { userId } });
  return formatResponse(aiKey);
}

export async function upsertAiKeys(userId, { openaiKey, anthropicKey }) {
  const patch = {};

  // Encrypt each key individually at the call site so it is explicit and readable.
  if (openaiKey !== undefined) {
    patch.openaiKeyEnc = encrypt(openaiKey);
  }
  if (anthropicKey !== undefined) {
    patch.anthropicKeyEnc = encrypt(anthropicKey);
  }

  const aiKey = await prisma.aiKey.upsert({
    where: { userId },
    update: patch,
    // On first insert only the supplied keys are stored; unset fields stay null.
    create: { userId, ...patch },
  });

  return formatResponse(aiKey);
}

/**
 * Returns the decrypted plaintext key for a given provider.
 * Intended for use by the AI engine in Phase 3 — not exposed via the API.
 *
 * @param {string} userId
 * @param {'openai' | 'anthropic'} provider
 * @returns {string | null}
 */
export async function getDecryptedKey(userId, provider) {
  const aiKey = await prisma.aiKey.findUnique({ where: { userId } });
  if (!aiKey) return null;

  if (provider === 'openai') {
    return aiKey.openaiKeyEnc ? decrypt(aiKey.openaiKeyEnc) : null;
  }
  if (provider === 'anthropic') {
    return aiKey.anthropicKeyEnc ? decrypt(aiKey.anthropicKeyEnc) : null;
  }

  return null;
}
