import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    const secret = (process.env.JWT_SECRET || 'supersecret_for_dev_only_jemafaith') as string;
    const decoded = jwt.verify(token, secret) as any as { userId?: string; id?: string; role: string };
    req.user = {
      id: decoded.userId || decoded.id || '',
      role: decoded.role
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (req.user.role === 'SUPER_ADMIN' || roles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
  };
}

export async function checkAccess(studentId: string, resourceType: 'Grades' | 'Timetable' | 'Certificates'): Promise<boolean> {
  const records = await prisma.feeRecord.findMany({
    where: { studentId }
  });

  let totalBilled = 0;
  let totalPaid = 0;

  for (const record of records) {
    totalBilled += record.totalBilled;
    totalPaid += record.amountPaid;
  }

  if (totalBilled === 0) return true;

  const ratio = totalPaid / totalBilled;

  if (resourceType === 'Certificates') {
    return ratio >= 1.0;
  } else {
    // Grades or Timetable
    return ratio >= 0.5;
  }
}
