import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { ttErrorHandler } from '../../services/tt/db';
import setupRoutes from './setup.routes';
import timetablesRoutes from './timetables.routes';
import entriesRoutes from './entries.routes';
import generateRoutes from './generate.routes';
import publishedRoutes from './published.routes';
import substitutionsRoutes from './substitutions.routes';
import excelRoutes from './excel.routes';

/**
 * Timetabling module — mounted at /api/tt. Every route needs a signed-in user; admin-only
 * routes add requireRole('ADMIN') (SUPER_ADMIN always passes).
 */
const router = Router();

router.use(requireAuth);
router.use('/setup', setupRoutes);
router.use('/published', publishedRoutes);
router.use('/substitutions', substitutionsRoutes);
router.use('/', generateRoutes);
router.use('/', excelRoutes);
router.use('/timetables', entriesRoutes);
router.use('/timetables', timetablesRoutes);
router.use(ttErrorHandler);

export default router;
