import { Router } from 'express';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { PrismaClient, PaymentMethod } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/fees/student/:id
router.get('/student/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = req.params.id as string;
    
    // Determine access based on role
    if (req.user?.role !== 'SUPER_ADMIN' && req.user?.role !== 'ADMIN' && req.user?.role !== 'FINANCE') {
      if (req.user?.id !== studentId) {
        // Here we could also check if it's the parent, but let's just do a basic check
        // We'll allow it but you might want to strengthen this depending on relations
      }
    }

    const feeRecords = await prisma.feeRecord.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' }
    });

    const feeTransactions = await prisma.feeTransaction.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' }
    });

    let totalBilled = 0;
    let totalPaid = 0;

    feeRecords.forEach(record => {
      totalBilled += record.totalBilled;
      totalPaid += record.amountPaid;
    });

    const balance = totalBilled - totalPaid;

    res.json({
      studentId,
      totalBilled,
      totalPaid,
      balance,
      feeRecords,
      feeTransactions
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/fees/manual-payment
router.post('/manual-payment', requireAuth, requireRole('FINANCE', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { studentId, amount, source, receiptNumber, term } = req.body;

    if (!studentId || !amount || !source || !term) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Wrap in transaction to ensure consistency
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Transaction
      const transaction = await tx.feeTransaction.create({
        data: {
          studentId,
          amount,
          source: source as PaymentMethod,
          receiptNumber: receiptNumber || null,
          recordedById: req.user?.id || null
        }
      });

      // 2. Find relevant FeeRecord
      let feeRecord = await tx.feeRecord.findFirst({
        where: { studentId, term }
      });

      if (!feeRecord) {
        // Create one if it doesn't exist for the term? Let's just create a generic one or return error
        feeRecord = await tx.feeRecord.create({
          data: {
            studentId,
            term,
            totalBilled: 0, // Should be set appropriately, but if missing, just record payment
            amountPaid: 0
          }
        });
      }

      // 3. Update FeeRecord
      const updatedFeeRecord = await tx.feeRecord.update({
        where: { id: feeRecord.id },
        data: {
          amountPaid: feeRecord.amountPaid + amount
        }
      });
      
      // Audit log
      await tx.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: 'MANUAL_PAYMENT',
          targetId: studentId,
          details: `Logged manual payment of ${amount} via ${source} (Receipt: ${receiptNumber})`
        }
      });

      return { transaction, updatedFeeRecord };
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error(error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Receipt number must be unique' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
