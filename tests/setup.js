import prisma from '../src/lib/prisma.js';

beforeAll(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.platformPost.deleteMany();
  await prisma.post.deleteMany();
  await prisma.aiKey.deleteMany();
  await prisma.socialAccount.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
