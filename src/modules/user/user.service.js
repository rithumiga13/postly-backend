import prisma from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';

function safeUser(user) {
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, ...rest } = user;
  return rest;
}

export async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  return { user: safeUser(user) };
}

export async function updateProfile(userId, updates) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: updates,
  });
  return { user: safeUser(user) };
}
