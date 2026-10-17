import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';

const router = Router();

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req: any, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        passwordHash,
        status: 'ACTIVE' // Activating the user account
      }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
