import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { PrismaClient, PaymentMethod } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// POST /api/mpesa/stk-push
router.post('/stk-push', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { studentId, phone, amount, term } = req.body;

    if (!studentId || !phone || !amount || !term) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // In a real scenario, you'd call Daraja API here.
    // For now, we mock the success response.
    const mockCheckoutRequestID = 'ws_CO_' + Math.random().toString(36).substring(7);

    // We can save the pending request in some table, or just return success.
    // Assuming Daraja returns successfully:
    res.json({
      MerchantRequestID: '12345-67890-12345',
      CheckoutRequestID: mockCheckoutRequestID,
      ResponseCode: '0',
      ResponseDescription: 'Success. Request accepted for processing',
      CustomerMessage: 'Success. Request accepted for processing'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/mpesa/callback
router.post('/callback', async (req, res) => {
  try {
    const callbackData = req.body.Body?.stkCallback;

    if (!callbackData) {
      return res.status(400).json({ error: 'Invalid callback data' });
    }

    const { ResultCode, ResultDesc, CallbackMetadata } = callbackData;

    // Check if payment was successful
    if (ResultCode !== 0) {
      console.log(`Payment failed: ${ResultDesc}`);
      return res.json({ message: 'Callback received, payment failed.' });
    }

    // Extract items from metadata
    let amount = 0;
    let mpesaReceiptNumber = '';
    let phoneNumber = '';

    if (CallbackMetadata && CallbackMetadata.Item) {
      CallbackMetadata.Item.forEach((item: any) => {
        if (item.Name === 'Amount') amount = item.Value;
        if (item.Name === 'MpesaReceiptNumber') mpesaReceiptNumber = item.Value;
        if (item.Name === 'PhoneNumber') phoneNumber = item.Value.toString();
      });
    }

    // Typically, we'd look up the studentId from a pending transactions table using CheckoutRequestID
    // Since we don't have that mapped here, we'll try to find a user by phone. 
    // In a real app, STK push initiator saves CheckoutRequestID -> studentId mapping.
    // Let's simulate looking up the student by phone for this mock callback
    const user = await prisma.user.findUnique({
      where: { phone: phoneNumber }
    });

    if (!user) {
      console.log(`Callback received but no user found with phone ${phoneNumber}`);
      return res.json({ message: 'User not found for this phone number' });
    }

    // Update database
    await prisma.$transaction(async (tx) => {
      // Create transaction record
      await tx.feeTransaction.create({
        data: {
          studentId: user.id,
          amount,
          source: PaymentMethod.MPESA,
          receiptNumber: mpesaReceiptNumber,
          status: 'CONFIRMED'
        }
      });

      // Update FeeRecord (we'll just pick the most recent one or create a new one)
      let feeRecord = await tx.feeRecord.findFirst({
        where: { studentId: user.id },
        orderBy: { createdAt: 'desc' }
      });

      if (feeRecord) {
        await tx.feeRecord.update({
          where: { id: feeRecord.id },
          data: {
            amountPaid: feeRecord.amountPaid + amount
          }
        });
      } else {
        await tx.feeRecord.create({
          data: {
            studentId: user.id,
            term: 'CURRENT', // Mock term
            totalBilled: 0,
            amountPaid: amount
          }
        });
      }
    });

    res.json({ message: 'Payment successfully processed' });
  } catch (error) {
    console.error('M-Pesa Callback Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
