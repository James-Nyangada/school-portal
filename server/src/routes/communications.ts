import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const AT_API_KEY = process.env.AT_API_KEY || 'atsk_bdba2de31db65b01402c3ac980666c38e3a78153e2930d81dc6b4752cc6040a85a5d77a4';
const AT_USERNAME = process.env.AT_USERNAME || 'sandbox';
const AT_SENDER_ID = process.env.AT_SENDER_ID || '';

// ============================================================
// Helper: Resolve target audience to phone numbers
// ============================================================
async function resolveAudience(targetAudience: string): Promise<{ id: string; phone: string; name: string }[]> {
  let users: any[] = [];

  if (targetAudience === 'ALL_PARENTS') {
    users = await prisma.user.findMany({
      where: { role: 'PARENT', phone: { not: null } },
      select: { id: true, phone: true, firstName: true, lastName: true },
    });
  } else if (targetAudience === 'ALL_TEACHERS') {
    users = await prisma.user.findMany({
      where: { role: 'TEACHER', phone: { not: null } },
      select: { id: true, phone: true, firstName: true, lastName: true },
    });
  } else if (targetAudience === 'ALL_STUDENTS') {
    users = await prisma.user.findMany({
      where: { role: 'STUDENT', phone: { not: null } },
      select: { id: true, phone: true, firstName: true, lastName: true },
    });
  } else if (targetAudience === 'DEBTORS') {
    // Parents of students with outstanding balances
    const debtorRecords = await prisma.feeRecord.findMany({
      where: { amountPaid: { lt: prisma.feeRecord.fields.totalBilled as any } },
    });
    // Fallback: find fee records where paid < billed
    const allFees = await prisma.feeRecord.findMany();
    const debtorStudentIds = [...new Set(allFees.filter(f => f.amountPaid < f.totalBilled).map(f => f.studentId))];

    // Find parent links for debtor students
    const parentLinks = await prisma.studentParent.findMany({
      where: { studentId: { in: debtorStudentIds } },
      include: { parent: { select: { id: true, phone: true, firstName: true, lastName: true } } },
    });

    users = parentLinks
      .filter((l) => l.parent.phone)
      .map((l) => ({
        id: l.parent.id,
        phone: l.parent.phone,
        firstName: l.parent.firstName,
        lastName: l.parent.lastName,
      }));

    // Deduplicate by parent ID
    const seen = new Set<string>();
    users = users.filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
  } else if (targetAudience.startsWith('CLASS:')) {
    // e.g. "CLASS:Grade 8"
    const className = targetAudience.replace('CLASS:', '');
    // For now, we'll get all parents (class-based filtering would require student-class linkage)
    users = await prisma.user.findMany({
      where: { role: 'PARENT', phone: { not: null } },
      select: { id: true, phone: true, firstName: true, lastName: true },
    });
  }

  return users.map((u) => ({
    id: u.id,
    phone: u.phone!,
    name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
  }));
}

// ============================================================
// Helper: Send SMS via Africa's Talking
// ============================================================
async function sendSmsViaAT(recipients: string[], message: string): Promise<any> {
  try {
    const url = 'https://api.africastalking.com/version1/messaging';
    const formBody = new URLSearchParams();
    formBody.append('username', AT_USERNAME);
    formBody.append('to', recipients.join(','));
    formBody.append('message', message);
    if (AT_SENDER_ID) formBody.append('from', AT_SENDER_ID);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apiKey': AT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: formBody.toString(),
    });

    const data = await response.json();
    console.log('[Africa\'s Talking SMS Response]:', JSON.stringify(data));
    return data;
  } catch (error) {
    console.error('[Africa\'s Talking SMS Error]:', error);
    return { error: 'SMS delivery failed' };
  }
}

// ============================================================
// POST /api/communications/campaigns — Create & send a campaign
// ============================================================
router.post('/campaigns', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { type, subject, message, targetAudience } = req.body;

    if (!message || !targetAudience) {
      return res.status(400).json({ error: 'Message and target audience are required' });
    }

    // Resolve audience
    const recipients = await resolveAudience(targetAudience);

    // Create campaign record
    const campaign = await prisma.communicationCampaign.create({
      data: {
        type: type || 'SMS',
        subject: subject || null,
        message,
        targetAudience,
        recipientCount: recipients.length,
        status: 'SENDING',
        sentById: req.user!.id,
        sentAt: new Date(),
      },
    });

    // Create log entries
    const logEntries = recipients.map((r) => ({
      campaignId: campaign.id,
      recipientId: r.id,
      recipientPhone: r.phone,
      status: 'QUEUED',
    }));
    await prisma.communicationLog.createMany({ data: logEntries });

    // Send SMS via Africa's Talking
    if (type === 'SMS' && recipients.length > 0) {
      const phones = recipients.map((r) => r.phone);
      const atResponse = await sendSmsViaAT(phones, message);

      // Update log statuses based on AT response
      const messageResults = atResponse?.SMSMessageData?.Recipients || [];
      for (const result of messageResults) {
        await prisma.communicationLog.updateMany({
          where: { campaignId: campaign.id, recipientPhone: result.number },
          data: {
            status: result.status === 'Success' ? 'SENT' : 'FAILED',
            errorMessage: result.status !== 'Success' ? result.status : null,
          },
        });
      }

      // Update campaign status
      await prisma.communicationCampaign.update({
        where: { id: campaign.id },
        data: { status: 'SENT' },
      });
    } else if (type === 'EMAIL') {
      // Email sending placeholder — log to console
      console.log(`[EMAIL Campaign ${campaign.id}] Would send email to ${recipients.length} recipients.`);
      console.log(`Subject: ${subject}`);
      console.log(`Message: ${message}`);

      await prisma.communicationLog.updateMany({
        where: { campaignId: campaign.id },
        data: { status: 'SENT' },
      });
      await prisma.communicationCampaign.update({
        where: { id: campaign.id },
        data: { status: 'SENT' },
      });
    }

    const result = await prisma.communicationCampaign.findUnique({
      where: { id: campaign.id },
      include: { _count: { select: { logs: true } } },
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error sending campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /api/communications/campaigns — List all campaigns
// ============================================================
router.get('/campaigns', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const campaigns = await prisma.communicationCampaign.findMany({
      include: {
        sentBy: { select: { firstName: true, lastName: true } },
        _count: { select: { logs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(campaigns);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /api/communications/campaigns/:id — Campaign detail with logs
// ============================================================
router.get('/campaigns/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const campaign = await prisma.communicationCampaign.findUnique({
      where: { id: req.params.id as string },
      include: {
        sentBy: { select: { firstName: true, lastName: true } },
        logs: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /api/communications/resolve-audience — Preview recipients
// ============================================================
router.post('/resolve-audience', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { targetAudience } = req.body;
    const recipients = await resolveAudience(targetAudience);
    res.json({ count: recipients.length, recipients: recipients.slice(0, 20) }); // Return max 20 for preview
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
