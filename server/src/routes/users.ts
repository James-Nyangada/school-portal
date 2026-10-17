import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { Role, Status } from '@prisma/client';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';

const router = Router();

// Helper to check if a user can create a specific role
function canCreateRole(creatorRole: string, targetRole: string): boolean {
  if (creatorRole === 'SUPER_ADMIN') {
    return ['ADMIN', 'TEACHER', 'FINANCE', 'STUDENT', 'PARENT'].includes(targetRole);
  }
  if (creatorRole === 'ADMIN') {
    return ['TEACHER', 'FINANCE', 'STUDENT', 'PARENT'].includes(targetRole);
  }
  return false;
}

export const MAX_TEACHER_SUBJECTS = 2;

/** Validates a teacher's subject list; returns the cleaned ids or an error message. */
async function parseTeacherSubjects(raw: unknown): Promise<string[] | string> {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) return 'subjectIds must be a list of subject ids';

  const ids = [...new Set(raw as string[])];
  if (ids.length > MAX_TEACHER_SUBJECTS) return `A teacher can teach at most ${MAX_TEACHER_SUBJECTS} subjects`;

  const found = await prisma.subject.count({ where: { id: { in: ids } } });
  if (found !== ids.length) return 'One or more subjects do not exist';

  return ids;
}

// GET /api/users
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { role, status, search, page = '1', limit = '10' } = req.query;
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const where: any = {};
    if (role && role !== 'All') where.role = role as Role;
    if (status) where.status = status as Status;
    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNumber,
        include: {
          createdBy: {
            select: { firstName: true, lastName: true }
          },
          childLinks: {
            include: {
              parent: {
                select: { id: true, firstName: true, lastName: true, email: true, phone: true }
              }
            }
          },
          parentLinks: {
            include: {
              student: {
                select: { id: true, firstName: true, lastName: true, email: true, phone: true, admissionNumber: true, class: { select: { id: true, name: true } } }
              }
            }
          },
          studentSubjects: {
            include: {
              subject: true
            }
          },
          teachesSubjects: {
            select: { subjectId: true, subject: { select: { id: true, name: true, code: true } } }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    const usersWithoutPasswords = users.map(user => {
      const { passwordHash, ...rest } = user;
      return rest;
    });

    res.json({ users: usersWithoutPasswords, total, page: pageNumber, limit: limitNumber });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/me
router.get('/me', requireAuth, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        childLinks: {
          include: {
            parent: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true }
            }
          }
        },
        parentLinks: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true, admissionNumber: true, class: { select: { id: true, name: true } } }
            }
          }
        }
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const { passwordHash, ...rest } = user;
    res.json(rest);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id
router.get('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const userId = req.params.id as string;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        childLinks: {
          include: {
            parent: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true }
            }
          }
        },
        parentLinks: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true, admissionNumber: true, class: { select: { id: true, name: true } } }
            }
          }
        },
        studentSubjects: {
          include: {
            subject: true
          }
        }
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const { passwordHash, ...rest } = user;
    res.json(rest);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users
router.post('/', requireAuth, requireRole('ADMIN'), async (req: any, res) => {
  try {
    const { role, firstName, lastName, email, phone, customTempPassword } = req.body;

    console.log('[DEBUG] User creating account - req.user:', req.user, 'targetRole:', role);

    if (!canCreateRole(req.user.role, role)) {
      console.log('[DEBUG] canCreateRole check failed for:', req.user.role, '->', role);
      return res.status(403).json({ error: 'Forbidden to create this role' });
    }

    const subjectIds = role === 'TEACHER' ? await parseTeacherSubjects(req.body.subjectIds) : [];
    if (typeof subjectIds === 'string') return res.status(400).json({ error: subjectIds });

    const tempPassword = customTempPassword || Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const newUser = await prisma.user.create({
      data: {
        role: role as Role,
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        passwordHash,
        status: Status.PENDING_ACTIVATION,
        createdById: req.user.id,
        teachesSubjects: { create: subjectIds.map((subjectId) => ({ subjectId })) }
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: 'CREATE_USER',
        targetId: newUser.id,
        details: `Created user ${firstName} ${lastName} with role ${role}`
      }
    });

    const { passwordHash: _, ...rest } = newUser;
    res.status(201).json({ ...rest, tempPassword });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/:id
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req: any, res) => {
  try {
    const { action, reason, customTempPassword } = req.body;
    const targetId = req.params.id as string;
    let updatedUser;

    if (action === 'SUSPEND') {
      updatedUser = await prisma.user.update({
        where: { id: targetId },
        data: { status: Status.SUSPENDED }
      });
      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'SUSPEND_USER',
          targetId,
          details: `Suspended user. Reason: ${reason}`
        }
      });
    } else if (action === 'COMPLETED') {
      updatedUser = await prisma.user.update({
        where: { id: targetId },
        data: { status: Status.COMPLETED }
      });
      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'COMPLETED_STUDENT',
          targetId,
          details: 'Marked student as completed studies'
        }
      });
    } else if (action === 'TRANSFERRED') {
      updatedUser = await prisma.user.update({
        where: { id: targetId },
        data: { status: Status.TRANSFERRED }
      });
      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'TRANSFERRED_STUDENT',
          targetId,
          details: 'Marked student as transferred'
        }
      });
    } else if (action === 'REACTIVATE') {
      updatedUser = await prisma.user.update({
        where: { id: targetId },
        data: { status: Status.ACTIVE }
      });
      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'REACTIVATE_USER',
          targetId,
          details: `Reactivated user.`
        }
      });
    } else if (action === 'EDIT_DETAILS') {
      const target = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true } });
      if (!target) return res.status(404).json({ error: 'User not found' });

      const { firstName, lastName, email, phone } = req.body;
      const subjectIds = target.role === 'TEACHER' ? await parseTeacherSubjects(req.body.subjectIds) : null;
      if (typeof subjectIds === 'string') return res.status(400).json({ error: subjectIds });

      try {
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: targetId },
            data: { firstName, lastName, email: email || null, phone: phone || null }
          });

          if (subjectIds) {
            await tx.teacherSubject.deleteMany({ where: { teacherId: targetId } });
            await tx.teacherSubject.createMany({ data: subjectIds.map((subjectId) => ({ teacherId: targetId, subjectId })) });
          }
        });
      } catch (e: any) {
        if (e?.code === 'P2002') return res.status(409).json({ error: 'That email or phone is already used by another account' });
        throw e;
      }

      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'EDIT_USER_DETAILS',
          targetId,
          details: subjectIds ? `Updated details and subjects (${subjectIds.length})` : 'Updated details'
        }
      });
    } else if (action === 'FORCE_RESET') {
      const tempPassword = customTempPassword || Math.random().toString(36).slice(-8);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      updatedUser = await prisma.user.update({
        where: { id: targetId },
        data: { passwordHash, status: Status.PENDING_ACTIVATION }
      });
      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'FORCE_PASSWORD_RESET',
          targetId,
          details: `Forced password reset.`
        }
      });
      return res.json({ message: 'Password reset', tempPassword });
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', requireAuth, requireRole('SUPER_ADMIN'), async (req: any, res) => {
  try {
    const targetId = req.params.id as string;

    // Prevent deleting oneself
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    // Verify user exists
    const userExists = await prisma.user.findUnique({
      where: { id: targetId }
    });
    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Perform cascade delete in transaction
    await prisma.$transaction([
      prisma.studentParent.deleteMany({
        where: {
          OR: [
            { studentId: targetId },
            { parentId: targetId }
          ]
        }
      }),
      prisma.user.updateMany({
        where: { createdById: targetId },
        data: { createdById: null }
      }),
      prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: targetId },
            { targetId: targetId }
          ]
        }
      }),
      prisma.user.delete({
        where: { id: targetId }
      })
    ]);

    res.json({ message: 'User deleted successfully from database' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
