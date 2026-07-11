import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_for_dev_only_jemafaith';

async function runTest() {
  const prisma = new PrismaClient();
  try {
    // 1. Get the SUPER_ADMIN user
    const user = await prisma.user.findFirst({
      where: { email: 'sadmin@jemafaith.ac.ke' }
    });

    if (!user) {
      console.error('Super admin user not found in DB!');
      return;
    }

    // 2. Generate token like the auth router does
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('Generated Token for Super Admin:', token);

    // 3. Make request to create a user (we simulate the request directly by calling the logic or making a local fetch if server is running, or we can just test the Prisma create directly to see if auditLog or prisma fails).
    // Let's see what happens if we simulate POST /api/users logic:
    const role = 'ADMIN';
    const firstName = 'Test';
    const lastName = 'Admin';
    const email = `testadmin_${Date.now()}@jemafaith.co.ke`;
    
    // Check if we can create
    const creatorRole = user.role;
    const canCreate = (creatorRole === 'SUPER_ADMIN' && ['ADMIN', 'TEACHER', 'FINANCE', 'STUDENT', 'PARENT'].includes(role));
    console.log('Can creator create role?', canCreate);

    const tempPassword = 'password123';
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    console.log('Creating user in DB...');
    const newUser = await prisma.user.create({
      data: {
        role: role as any,
        firstName,
        lastName,
        email,
        phone: null,
        passwordHash,
        status: 'PENDING_ACTIVATION',
        createdById: user.id
      }
    });
    console.log('User created in DB successfully:', newUser.id);

    console.log('Creating Audit Log...');
    const log = await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'CREATE_USER',
        targetId: newUser.id,
        details: `Created user ${firstName} ${lastName} with role ${role}`
      }
    });
    console.log('Audit Log created successfully:', log.id);

  } catch (error) {
    console.error('Error during creation simulation:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
