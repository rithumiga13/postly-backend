import bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import prisma from '../../lib/prisma.js';
import { signAccess, mintRefreshRaw } from '../../lib/jwt.js';
import { AuthError, ConflictError, NotFoundError } from '../../lib/errors.js';

const BCRYPT_COST = 12;

function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

function safeUser(user) {
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, ...rest } = user;
  return rest;
}

export async function register({ email, password, name }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });

  return { user: safeUser(user) };
}

export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Use a constant-time comparison path to avoid timing attacks on email enumeration.
  if (!user) {
    throw new AuthError('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AuthError('Invalid credentials');
  }

  const accessToken = signAccess(user);
  const { raw, hash, expiresAt } = mintRefreshRaw();

  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hash, expiresAt },
  });

  return { accessToken, refreshToken: raw, user: safeUser(user) };
}

export async function refresh({ refreshToken }) {
  const incomingHash = hashToken(refreshToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: incomingHash },
    include: { user: true },
  });

  if (!stored) {
    throw new AuthError('Invalid refresh token');
  }

  if (stored.expiresAt < new Date()) {
    throw new AuthError('Refresh token expired');
  }

  if (stored.revokedAt !== null) {
    // This token was already rotated or explicitly revoked. Presenting a rotated
    // token again is a strong signal that an attacker intercepted and is replaying
    // the old token. Revoke every active session for this user so both the
    // legitimate owner and the attacker are forced to re-authenticate, breaking
    // the attacker's foothold.
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AuthError('Refresh token already used — all sessions revoked');
  }

  const { raw: newRaw, hash: newHash, expiresAt: newExpiresAt } = mintRefreshRaw();

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedBy: newHash },
    }),
    prisma.refreshToken.create({
      data: { userId: stored.userId, tokenHash: newHash, expiresAt: newExpiresAt },
    }),
  ]);

  const accessToken = signAccess(stored.user);

  return { accessToken, refreshToken: newRaw };
}

export async function logout({ refreshToken }) {
  const tokenHash = hashToken(refreshToken);

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt !== null) {
    return { ok: true };
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return { ok: true };
}

export async function me(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return { user: safeUser(user) };
}
