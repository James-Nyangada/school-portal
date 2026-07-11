import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const email = 'sadmin@jemafaith.ac.ke';
    const plainPassword = '2004@jemaFaith';

    // Check if super admin already exists
    const existingAdmin = await prisma.user.findUnique({
        where: { email }
    });

    if (!existingAdmin) {
        const passwordHash = await bcrypt.hash(plainPassword, 10);
        
        await prisma.user.create({
            data: {
                email,
                passwordHash,
                role: 'SUPER_ADMIN',
                status: 'ACTIVE',
                firstName: 'Super',
                lastName: 'Admin'
            }
        });
        
        console.log('Super Admin user created.');
    } else {
        console.log('Super Admin user already exists.');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
