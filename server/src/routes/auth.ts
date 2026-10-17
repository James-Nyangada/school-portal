import { Router, Request } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest, JWT_SECRET, requireAuth } from '../middleware/auth';

const router = Router();

/** Failed sign-ins that lock an account; also the Super Admin "failed login spike" alert threshold. */
export const MAX_FAILED_ATTEMPTS = 5;

const clientInfo = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent')?.slice(0, 300) ?? null
});

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

        const cleanIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
        if (!cleanIdentifier || !password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Find user by identifier (email or phone)
        let roleCondition: any = role;
        if (role === 'ADMIN') {
            roleCondition = { in: ['ADMIN', 'SUPER_ADMIN'] };
        }

        const phoneWithoutSpaces = cleanIdentifier.replace(/\s+/g, '');
        const orConditions: any[] = [
            { email: { equals: cleanIdentifier, mode: 'insensitive' } },
            { phone: cleanIdentifier }
        ];

        if (phoneWithoutSpaces && phoneWithoutSpaces !== cleanIdentifier) {
            orConditions.push({ phone: phoneWithoutSpaces });
        }

        const user = await prisma.user.findFirst({
            where: {
                OR: orConditions,
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
            const locking = failedAttempts >= MAX_FAILED_ATTEMPTS;
            await prisma.auditLog.create({
                data: {
                    actorId: user.id,
                    targetId: user.id,
                    action: locking ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
                    details: locking
                        ? `Locked for 30 minutes after ${failedAttempts} failed sign-in attempts`
                        : `Failed sign-in attempt ${failedAttempts} of ${MAX_FAILED_ATTEMPTS}`,
                    ...clientInfo(req)
                }
            });
            if (locking) {
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
                status: user.status,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================================
// View-as (dashboard spec §1.2): a Super Admin sees the portal exactly as one user does. Read-only
// (enforced in requireAuth), time-limited, and audit-logged at both ends — never silent.
// ============================================================
const VIEW_AS_MINUTES = 30;
const viewAsSchema = z.object({ reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(300) });

// POST /api/auth/impersonate/:userId — returns a read-only token for the target user
router.post('/impersonate/:userId', requireAuth, async (req: AuthRequest, res) => {
    if (req.user!.role !== 'SUPER_ADMIN' || req.user!.impersonatorId) {
        return res.status(403).json({ error: 'Only a Super Admin can view the portal as another user' });
    }
    const parsed = viewAsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Give a reason' });

    try {
        const target = await prisma.user.findUnique({
            where: { id: req.params.userId as string },
            select: { id: true, role: true, status: true, firstName: true, lastName: true, email: true, phone: true }
        });
        if (!target) return res.status(404).json({ error: 'User not found' });
        if (target.id === req.user!.id || target.role === 'SUPER_ADMIN') {
            return res.status(400).json({ error: 'You cannot view as a Super Admin account' });
        }

        const name = [target.firstName, target.lastName].filter(Boolean).join(' ') || target.email || target.phone || 'user';
        const token = jwt.sign({ userId: target.id, role: target.role, impersonatorId: req.user!.id }, JWT_SECRET, {
            expiresIn: `${VIEW_AS_MINUTES}m`
        });
        await prisma.auditLog.create({
            data: {
                actorId: req.user!.id,
                targetId: target.id,
                action: 'IMPERSONATION_STARTED',
                details: `Viewing as ${name} (${target.role}) for up to ${VIEW_AS_MINUTES} minutes. Reason: ${parsed.data.reason}`,
                ...clientInfo(req)
            }
        });

        res.json({ token, user: { ...target, name }, expiresAt: new Date(Date.now() + VIEW_AS_MINUTES * 60_000) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/impersonation/stop — called with the view-as token when the Super Admin exits
router.post('/impersonation/stop', requireAuth, async (req: AuthRequest, res) => {
    if (!req.user!.impersonatorId) return res.status(400).json({ error: 'Not viewing as another user' });

    try {
        await prisma.auditLog.create({
            data: { actorId: req.user!.impersonatorId, targetId: req.user!.id, action: 'IMPERSONATION_ENDED', details: 'Exited view-as mode', ...clientInfo(req) }
        });
        res.json({ message: 'View-as ended' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
