import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

// Helper to determine expiry based on role
function roleBasedExpiry(role: string) {
    switch (role) {
        case 'SUPER_ADMIN': return '30m';
        case 'ADMIN': return '1h';
        case 'FINANCE': return '1h';
        case 'TEACHER': return '4h';
        case 'STUDENT': return '8h';
        case 'PARENT': return '8h';
        default: return '1h';
    }
}

router.post('/login', async (req, res) => {
    try {
        const { identifier, password, role } = req.body;

        // Find user by identifier (email or phone)
        let roleCondition: any = role;
        if (role === 'ADMIN') {
            roleCondition = { in: ['ADMIN', 'SUPER_ADMIN'] };
        }

        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: identifier },
                    { phone: identifier }
                ],
                role: roleCondition // Optional: ensure the identifier belongs to the selected role
            }
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (user.status === 'SUSPENDED' || user.status === 'COMPLETED' || user.status === 'TRANSFERRED') {
            return res.status(403).json({ error: `Account status is ${user.status.toLowerCase()}. Access denied. Contact school administration.` });
        }

        if (user.status === 'LOCKED') {
            if (user.lockedUntil && user.lockedUntil > new Date()) {
                return res.status(403).json({ error: 'Account locked due to multiple failed attempts. Try again later.' });
            } else {
                // Lock expired
                await prisma.user.update({
                    where: { id: user.id },
                    data: { status: 'ACTIVE', failedAttempts: 0, lockedUntil: null }
                });
            }
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);

        if (!isMatch) {
            const failedAttempts = user.failedAttempts + 1;
            if (failedAttempts >= 5) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { 
                        status: 'LOCKED', 
                        failedAttempts, 
                        lockedUntil: new Date(Date.now() + 30 * 60000) // 30 mins lock
                    }
                });
            } else {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { failedAttempts }
                });
            }
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Reset failed attempts on success
        await prisma.user.update({
            where: { id: user.id },
            data: { failedAttempts: 0, lockedUntil: null }
        });

        // Issue JWT
        const token = jwt.sign(
            { 
                userId: user.id, 
                role: user.role,
                // Add linked students later for parent
            },
            JWT_SECRET,
            { expiresIn: roleBasedExpiry(user.role) }
        );

        res.json({
            token,
            user: {
                id: user.id,
                role: user.role,
                status: user.status
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
