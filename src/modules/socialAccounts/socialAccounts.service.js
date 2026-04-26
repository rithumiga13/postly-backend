import prisma from '../../lib/prisma.js';
import { encrypt, decrypt } from '../../lib/crypto.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';

/**
 * Remove the encrypted blob fields before returning an account to the caller.
 * The raw ciphertext must never appear in API responses.
 */
function stripEncrypted(account) {
  // eslint-disable-next-line no-unused-vars
  const { accessTokenEnc, refreshTokenEnc, ...safe } = account;
  return safe;
}

export async function listAccounts(userId) {
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    orderBy: { connectedAt: 'desc' },
  });
  return { accounts: accounts.map(stripEncrypted) };
}

export async function createAccount(userId, { platform, handle, accessToken, refreshToken, expiresAt }) {
  // We return 409 instead of silently upserting because an existing connection
  // may have been revoked by the platform — overwriting it without the user's
  // explicit intent could mask a broken integration. The caller should DELETE
  // the old record first, then reconnect with a fresh token.
  const existing = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId, platform } },
  });
  if (existing) {
    throw new ConflictError(`A ${platform} account is already connected. Delete it first.`);
  }

  const accessTokenEnc = encrypt(accessToken);
  const refreshTokenEnc = refreshToken ? encrypt(refreshToken) : null;

  const account = await prisma.socialAccount.create({
    data: {
      userId,
      platform,
      handle: handle ?? null,
      accessTokenEnc,
      refreshTokenEnc,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return { account: stripEncrypted(account) };
}

export async function deleteAccount(userId, id) {
  // Use compound where so ownership is verified in a single query.
  // If the id belongs to another user we get count=0 and throw 404,
  // not 403, to avoid leaking existence of the account.
  const result = await prisma.socialAccount.deleteMany({
    where: { id, userId },
  });
  if (result.count === 0) {
    throw new NotFoundError('Social account not found');
  }
  return { ok: true };
}

/**
 * Returns decrypted tokens for a given user+platform.
 * Intended for use by publishing workers in Phase 4 — not exposed via the API.
 *
 * @param {string} userId
 * @param {string} platform
 * @returns {{ accessToken: string, refreshToken: string | null, handle: string | null }}
 * @throws {NotFoundError}
 */
export async function getDecryptedToken(userId, platform) {
  const account = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId, platform } },
  });
  if (!account) {
    throw new NotFoundError(`No ${platform} account connected`);
  }

  return {
    accessToken: decrypt(account.accessTokenEnc),
    refreshToken: account.refreshTokenEnc ? decrypt(account.refreshTokenEnc) : null,
    handle: account.handle,
  };
}
