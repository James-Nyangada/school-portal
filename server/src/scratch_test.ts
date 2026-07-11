import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    const users = await prisma.user.findMany();
    console.log('Successfully fetched users from database. Total users:', users.length);
    console.log('Users list:', users.map(u => ({ id: u.id, email: u.email, role: u.role })));
  } catch (error) {
    console.error('Database connection error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
