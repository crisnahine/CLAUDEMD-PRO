import { prisma } from '~/db.server';

export type { User } from '@prisma/client';

export async function getUsers() {
  return prisma.user.findMany({
    select: { id: true, email: true, name: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function createUser(data: { email: string; name: string; passwordHash: string }) {
  return prisma.user.create({ data });
}

export async function deleteUser(id: string) {
  return prisma.user.delete({ where: { id } });
}
