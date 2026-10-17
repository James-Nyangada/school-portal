import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getSettings } from '../services/grading';
import { getSchoolProfile, publicSchoolDto } from '../services/school';
import { mpesaConfig } from '../services/mpesa';
import { smsConfigured } from '../services/sms';

/** School Settings: the school's profile (shown on the public website) and its academic calendar. */
const router = Router();

/** Optional text: trimmed, '' stored as null. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

const url = text(500).refine((v) => !v || /^https?:\/\/\S+$/i.test(v), 'Links must start with http:// or https://');
const list = (max: number, itemMax: number) => z.array(z.string().trim().min(1).max(itemMax)).max(max);

const profileSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the school name').max(150),
    shortName: text(40),
    motto: text(200),
    tagline: text(200),
    logoUrl: url,
    heroImageUrl: url,
    foundedYear: z.number().int().min(1800).max(new Date().getFullYear()).nullable(),
    registrationNumber: text(60),
    curriculum: text(100),
    schoolType: text(60),
    gender: text(30),
    levelsOffered: text(200),

    about: text(10_000),
    history: text(10_000),
    mission: text(1_000),
    vision: text(1_000),
    coreValues: list(20, 80),

    principalName: text(100),
    principalTitle: text(100),
    principalPhotoUrl: url,
    principalMessage: text(10_000),

    email: text(150).refine((v) => !v || z.email().safeParse(v).success, 'Enter a valid email address'),
    phone: text(30),
    altPhone: text(30),
    whatsapp: text(30),
    postalAddress: text(200),
    physicalAddress: text(300),
    county: text(60),
    mapUrl: url,
    officeHours: text(200),
    website: url,
    socialLinks: z.object({
      facebook: url,
      instagram: url,
      x: url,
      youtube: url,
      tiktok: url,
      linkedin: url
    }),

    highlights: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(30) })).max(12),
    facilities: z
      .array(z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(1_000).default('') }))
      .max(30),
    admissionsOpen: z.boolean(),
    admissionsInfo: text(10_000),
    admissionRequirements: list(30, 200)
  })
  .partial();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the opening and closing dates for every term');
const optDate = isoDate.nullable().optional().or(z.literal('').transform(() => null));

const calendarSchema = z
  .object({
    academicYear: text(20),
    currentTerm: z.string().trim().min(1, 'Choose the current term').max(40),
    terms: z
      .array(
        z.object({
          name: z.string().trim().min(1, 'Every term needs a name').max(40),
          startDate: isoDate,
          endDate: isoDate,
          halfTermStart: optDate,
          halfTermEnd: optDate
        })
      )
      .max(6)
  })
  .superRefine((c, ctx) => {
    c.terms.forEach((t, i) => {
      if (t.endDate < t.startDate)
        ctx.addIssue({ code: 'custom', path: ['terms', i], message: `${t.name}: the term ends before it starts` });

      if (!!t.halfTermStart !== !!t.halfTermEnd)
        ctx.addIssue({ code: 'custom', path: ['terms', i], message: `${t.name}: enter both half-term dates or neither` });
      else if (t.halfTermStart && t.halfTermEnd) {
        if (t.halfTermEnd < t.halfTermStart || t.halfTermStart < t.startDate || t.halfTermEnd > t.endDate)
          ctx.addIssue({ code: 'custom', path: ['terms', i], message: `${t.name}: half term must fall inside the term` });
      }
    });

    if (new Set(c.terms.map((t) => t.name.toLowerCase())).size !== c.terms.length)
      ctx.addIssue({ code: 'custom', path: ['terms'], message: 'Each term name can only be used once' });

    if (c.terms.length && !c.terms.some((t) => t.name === c.currentTerm))
      ctx.addIssue({ code: 'custom', path: ['currentTerm'], message: 'The current term must be one of the terms listed' });
  });

/** Drops fields that weren't sent, so a partial save leaves the rest untouched. */
const sentFields = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Prisma.SchoolProfileUpdateInput;

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Invalid settings';

const adminDto = async () => {
  const [profile, settings] = await Promise.all([getSchoolProfile(), getSettings()]);
  return { profile, currentTerm: settings.currentTerm };
};

// GET /api/school/profile
router.get('/profile', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  res.json(await adminDto());
});

// PUT /api/school/profile — saves only the fields sent, so each settings tab saves its own section
router.put('/profile', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });

  await getSchoolProfile();
  await prisma.$transaction([
    prisma.schoolProfile.update({ where: { id: 1 }, data: sentFields(parsed.data) }),
    prisma.auditLog.create({
      data: { actorId: req.user!.id, action: 'SETTINGS_SCHOOL_PROFILE_UPDATED', details: Object.keys(parsed.data).join(', ') }
    })
  ]);

  res.json(await adminDto());
});

// PUT /api/school/calendar — term dates and which term is current (the current term drives grades and fees)
router.put('/calendar', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = calendarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });

  const { academicYear, currentTerm, terms } = parsed.data;
  await Promise.all([getSchoolProfile(), getSettings()]);
  await prisma.$transaction([
    prisma.schoolProfile.update({ where: { id: 1 }, data: { academicYear: academicYear ?? null, terms: terms as Prisma.InputJsonValue } }),
    prisma.schoolSettings.update({ where: { id: 1 }, data: { currentTerm } }),
    prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'SETTINGS_ACADEMIC_CALENDAR_UPDATED',
        details: [
          academicYear ? `Year ${academicYear}` : 'No academic year',
          `current term ${currentTerm}`,
          terms.length ? `${terms.length} term${terms.length === 1 ? '' : 's'} with dates` : 'no term dates'
        ].join(' · ')
      }
    })
  ]);

  res.json(await adminDto());
});

// ============================================================
// Feature toggles and integrations (System Settings, Super Admin only)
// ============================================================
const FEATURES = {
  mpesaEnabled: 'M-Pesa payments',
  smsEnabled: 'SMS notifications',
  newsletterEnabled: 'Newsletters',
  assignmentsEnabled: 'Assignments & quizzes'
} as const;
type FeatureKey = keyof typeof FEATURES;

const featuresSchema = z.object({
  mpesaEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  newsletterEnabled: z.boolean(),
  assignmentsEnabled: z.boolean()
}).partial();

const featuresOf = (s: Record<FeatureKey, boolean>) =>
  Object.fromEntries((Object.keys(FEATURES) as FeatureKey[]).map((k) => [k, s[k]])) as Record<FeatureKey, boolean>;

// GET /api/school/features — which modules are on (any signed-in user; the portal hides switched-off modules)
router.get('/features', requireAuth, async (_req, res) => {
  res.json(featuresOf(await getSettings()));
});

// PUT /api/school/features — every change is audit-logged (dashboard spec §1.4)
router.put('/features', requireAuth, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  const parsed = featuresSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });

  const before = await getSettings();
  const changed = (Object.keys(parsed.data) as FeatureKey[]).filter((k) => parsed.data[k] !== undefined && parsed.data[k] !== before[k]);
  if (changed.length === 0) return res.json(featuresOf(before));

  const [after] = await prisma.$transaction([
    prisma.schoolSettings.update({ where: { id: 1 }, data: Object.fromEntries(changed.map((k) => [k, parsed.data[k]])) }),
    ...changed.map((k) =>
      prisma.auditLog.create({
        data: { actorId: req.user!.id, action: 'FEATURE_TOGGLED', details: `${FEATURES[k]} turned ${parsed.data[k] ? 'on' : 'off'}` }
      })
    )
  ]);

  res.json(featuresOf(after));
});

// GET /api/school/integrations — connection status only; credentials live in the server's environment and are never sent
router.get('/integrations', requireAuth, requireRole('SUPER_ADMIN'), async (_req, res) => {
  const mpesa = mpesaConfig();
  res.json([
    {
      key: 'mpesa',
      name: 'Daraja API (Safaricom M-Pesa)',
      hint: 'Automated fee collection by STK push and Paybill.',
      connected: mpesa.configured,
      detail: mpesa.configured ? `${mpesa.production ? 'Production' : 'Sandbox'} · shortcode ${mpesa.shortcode}` : 'Set the MPESA_* variables in server/.env'
    },
    {
      key: 'sms',
      name: "Africa's Talking SMS",
      hint: 'Parent notifications, absence alerts and fee reminders.',
      connected: smsConfigured(),
      detail: smsConfigured() ? `Account ${process.env.AT_USERNAME?.trim() || 'sandbox'}` : 'Set AT_API_KEY and AT_USERNAME in server/.env'
    },
    {
      key: 'email',
      name: 'Email service',
      hint: 'System emails. Newsletters are delivered in the portal and as PDF.',
      connected: false,
      detail: 'Not built yet: no email provider is integrated'
    }
  ]);
});

/** Mounted at /api/public: no auth, read by the school website. */
export const publicSchoolRouter = Router();

// GET /api/public/school
publicSchoolRouter.get('/school', async (_req, res) => {
  try {
    const [profile, settings] = await Promise.all([getSchoolProfile(), getSettings()]);
    res.set('Cache-Control', 'public, max-age=60');
    res.json(publicSchoolDto(profile, settings.currentTerm));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
