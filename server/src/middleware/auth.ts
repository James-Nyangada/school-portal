import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { feeAccess } from '../services/fees';
import { getSettings } from '../services/grading';


export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    /** Set while a Super Admin is viewing the portal as this user (read-only) */
    impersonatorId?: string | undefined;
  };
}

export const JWT_SECRET = (process.env.JWT_SECRET || 'supersecret_for_dev_only_jemafaith') as string;

/** The only write allowed while viewing as another user: ending the view-as session. */
const VIEW_AS_EXIT = '/api/auth/impersonation/stop';

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
    const decoded = jwt.verify(token, JWT_SECRET) as any as { userId?: string; id?: string; role: string; impersonatorId?: string };
    req.user = {
      id: decoded.userId || decoded.id || '',
      role: decoded.role,
      impersonatorId: decoded.impersonatorId
    };
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  // View-as is strictly read-only so a Super Admin can never act under someone else's name
  if (req.user.impersonatorId && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.originalUrl.split('?')[0] !== VIEW_AS_EXIT) {
    return res.status(403).json({ error: 'You are viewing as another user. Changes are disabled until you exit view-as mode.' });
  }

  next();
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

/** Fee gate: the settings threshold for ongoing students, full clearance for certificates and leavers' grades. */
export async function checkAccess(studentId: string, resourceType: 'Grades' | 'Timetable' | 'Certificates'): Promise<boolean> {
  return (await feeAccess(studentId, resourceType)).allowed;
}

/** Blocks a route while its module is switched off in System Settings → Feature Toggles. */
export function requireFeature(feature: 'newsletterEnabled' | 'assignmentsEnabled', label: string) {
  return async (_req: AuthRequest, res: Response, next: NextFunction) => {
    if ((await getSettings())[feature]) return next();
    res.status(403).json({ error: `${label} are switched off for this school. A Super Admin can turn them on in System Settings.` });
  };
}
