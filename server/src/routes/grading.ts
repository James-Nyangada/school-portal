import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { canViewStudentFees, feeAccess, lockMessage } from '../services/fees';
import { aggregateLevel, getSettings } from '../services/grading';
import { renderReportCardPdf } from '../services/reportCardPdf';

const router = Router();

type BuiltReport = {
  studentId: string;
  totalScore: number;
  /** Number of subjects with a numeric score (CBC subjects carry a level instead) */
  scoredSubjects: number;
  subjects: { subjectId: string; gradeValue: string; teacherRemark: string | null }[];
};

/** Report card contents from each student's live grades for the term (a grade awaiting an edit keeps its published value). */
async function buildReports(term: string, studentIds?: string[]): Promise<BuiltReport[]> {
  const grades = await prisma.grade.findMany({
    where: {
      term,
      status: { in: ['PUBLISHED', 'PENDING_APPROVAL'] },
      deletedAt: null,
      ...(studentIds ? { studentId: { in: studentIds } } : {}),
    },
  });

  const byStudent = new Map<string, typeof grades>();
  grades.forEach(g => byStudent.set(g.studentId, [...(byStudent.get(g.studentId) ?? []), g]));

  return [...byStudent.entries()].map(([studentId, allGrades]) => {
    // One line per subject: the numeric total and letter, or (CBC) the overall level of its strands
    const bySubject = new Map<string, typeof allGrades>();
    allGrades.forEach(g => bySubject.set(g.subjectId, [...(bySubject.get(g.subjectId) ?? []), g]));

    let totalScore = 0;
    let scoredSubjects = 0;

    const subjects = [...bySubject.entries()].map(([subjectId, entries]) => {
      const numeric = entries.find(g => g.mode === 'NUMERIC');

      if (numeric) {
        const score = numeric.total ?? parseFloat(numeric.value);
        if (!isNaN(score)) {
          totalScore += score;
          scoredSubjects += 1;
        }
        return {
          subjectId,
          gradeValue: numeric.letterGrade ? `${numeric.value} (${numeric.letterGrade})` : numeric.value,
          teacherRemark: numeric.teacherComment,
        };
      }

      const comments = entries.map(g => g.teacherComment).filter(Boolean);
      return {
        subjectId,
        gradeValue: aggregateLevel(entries) ?? '—',
        teacherRemark: comments.length > 0 ? comments.join('; ') : null,
      };
    });

    return { studentId, totalScore, scoredSubjects, subjects };
  });
}

/** Creates or refreshes a student's report card for the term. `publish` undefined keeps the card's current state. */
async function saveReport(term: string, r: BuiltReport, opts: { publish?: boolean; rank?: number | null }) {
  const existing = await prisma.reportCard.findFirst({ where: { studentId: r.studentId, term } });

  await prisma.$transaction(async (tx) => {
    const card = existing
      ? await tx.reportCard.update({
          where: { id: existing.id },
          data: {
            totalScore: r.totalScore,
            ...(opts.rank !== undefined ? { rank: opts.rank } : {}),
            ...(opts.publish !== undefined ? { isPublished: opts.publish } : {}),
          },
        })
      : await tx.reportCard.create({
          data: {
            studentId: r.studentId,
            term,
            totalScore: r.totalScore,
            rank: opts.rank ?? null,
            isPublished: opts.publish ?? false,
          },
        });

    await tx.reportCardSubject.deleteMany({ where: { reportCardId: card.id } });
    await tx.reportCardSubject.createMany({
      data: r.subjects.map(sub => ({ reportCardId: card.id, ...sub })),
    });
  });
}

/** Mean of the numeric subject scores on a card, or null for an all-CBC card. */
function averageOf(card: { totalScore: number | null; subjectGrades: { gradeValue: string }[] }) {
  const scored = card.subjectGrades.filter(g => !isNaN(parseFloat(g.gradeValue))).length;
  return scored && card.totalScore !== null ? Math.round((card.totalScore / scored) * 10) / 10 : null;
}

// Generate and publish report cards for the whole school
router.post('/publish', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { term } = req.body;
    if (!term) {
      return res.status(400).json({ error: 'Term is required' });
    }

    const reports = await buildReports(term);
    if (reports.length === 0) {
      return res.status(400).json({ error: 'No published grades found for this term' });
    }

    for (const r of reports) await saveReport(term, r, { publish: true });

    res.json({ message: 'Report cards generated and published successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to publish report cards' });
  }
});

// ============================================================
// Admin report cards, one class and term at a time: generate drafts, review, publish
// ============================================================

const ADMIN = ['ADMIN', 'SUPER_ADMIN'];

/** Terms grades exist for, plus the current term. */
router.get('/report-cards/terms', requireAuth, requireRole(...ADMIN), async (_req, res) => {
  try {
    const settings = await getSettings();
    const terms = await prisma.grade.findMany({ distinct: ['term'], select: { term: true }, orderBy: { createdAt: 'asc' } });
    res.json({
      currentTerm: settings.currentTerm,
      terms: [...new Set([...terms.map(t => t.term), settings.currentTerm])],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch terms' });
  }
});

/** Every student in the class with their report card for the term (null when not generated yet). */
router.get('/report-cards', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const classId = String(req.query.classId ?? '');
    const term = String(req.query.term ?? '');
    if (!classId || !term) return res.status(400).json({ error: 'classId and term are required' });

    const students = await prisma.user.findMany({
      where: { classId, role: 'STUDENT' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        reportCards: {
          where: { term },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          include: { subjectGrades: { select: { gradeValue: true } } },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    res.json(
      students.map(({ reportCards, ...s }) => {
        const card = reportCards[0];
        return {
          student: s,
          reportCard: card
            ? {
                id: card.id,
                totalScore: card.totalScore,
                average: averageOf(card),
                rank: card.rank,
                subjects: card.subjectGrades.length,
                isPublished: card.isPublished,
                updatedAt: card.updatedAt,
              }
            : null,
        };
      })
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch report cards' });
  }
});

/** One report card with its subject lines. */
router.get('/report-cards/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const card = await prisma.reportCard.findUnique({
      where: { id: req.params.id as string },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } } },
        subjectGrades: { include: { subject: { select: { id: true, name: true, code: true } } } },
      },
    });
    if (!card) return res.status(404).json({ error: 'Report card not found' });

    card.subjectGrades.sort((a, b) => a.subject.name.localeCompare(b.subject.name));
    res.json({ ...card, average: averageOf(card) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch report card' });
  }
});

/** Download a report card as a styled A4 PDF (fee-gated for students/parents). */
router.get('/report-cards/:id/pdf', requireAuth, async (req: any, res) => {
  try {
    const cardId = req.params.id as string;
    const card = await prisma.reportCard.findUnique({
      where: { id: cardId },
      include: {
        student: { select: { id: true, admissionNumber: true, firstName: true, lastName: true } }
      }
    });

    if (!card) {
      return res.status(404).json({ error: 'Report card not found' });
    }

    const isAdminUser = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';
    if (!isAdminUser) {
      if (!card.isPublished) {
        return res.status(403).json({ error: 'This report card has not been published yet.' });
      }

      const hasAccess = (await canViewStudentFees(req.user, card.studentId)) || req.user.role === 'TEACHER';
      if (!hasAccess) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (req.user.role === 'STUDENT' || req.user.role === 'PARENT') {
        const access = await feeAccess(card.studentId, 'Grades');
        if (!access.allowed) {
          return res.status(402).json({ error: lockMessage(access, 'Report cards'), locked: true, access });
        }
      }
    }

    const pdfBuffer = await renderReportCardPdf(card.id);
    const safeName = (card.student.admissionNumber || card.student.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeTerm = card.term.replace(/\s+/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="report_card_${safeName}_${safeTerm}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating report card PDF:', error);
    res.status(500).json({ error: 'Failed to generate report card PDF' });
  }
});

/**
 * Builds (or refreshes) the class's report cards for the term from published grades and ranks students by total.
 * New cards start as drafts; cards already published stay published with the refreshed contents.
 */
router.post('/report-cards/generate', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { classId, term } = req.body ?? {};
    if (!classId || !term) return res.status(400).json({ error: 'classId and term are required' });

    const students = await prisma.user.findMany({ where: { classId, role: 'STUDENT' }, select: { id: true } });
    if (students.length === 0) return res.status(400).json({ error: 'This class has no students' });

    const reports = await buildReports(term, students.map(s => s.id));
    if (reports.length === 0) {
      return res.status(400).json({ error: `No published grades for this class in ${term} yet` });
    }

    // Competition ranking (1, 2, 2, 4) on total score; all-CBC cards are not ranked
    const ranked = reports.filter(r => r.scoredSubjects > 0).sort((a, b) => b.totalScore - a.totalScore);
    const rankOf = new Map<string, number>();
    ranked.forEach((r, i) => {
      const prev = ranked[i - 1];
      rankOf.set(r.studentId, prev && prev.totalScore === r.totalScore ? rankOf.get(prev.studentId)! : i + 1);
    });

    for (const r of reports) await saveReport(term, r, { rank: rankOf.get(r.studentId) ?? null });

    res.json({ generated: reports.length, withoutGrades: students.length - reports.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate report cards' });
  }
});

/** Publishes report cards so students and parents can see them: the given ids, or every card for the class and term. */
router.post('/report-cards/publish', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { ids, classId, term } = req.body ?? {};
    const where = Array.isArray(ids)
      ? { id: { in: ids as string[] } }
      : classId && term
        ? { term: String(term), student: { classId: String(classId) } }
        : null;
    if (!where) return res.status(400).json({ error: 'Provide ids, or classId and term' });

    const { count } = await prisma.reportCard.updateMany({ where: { ...where, isPublished: false }, data: { isPublished: true } });
    res.json({ published: count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to publish report cards' });
  }
});

/** Hides a published report card from the student and parents again. */
router.post('/report-cards/:id/unpublish', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    await prisma.reportCard.update({ where: { id: req.params.id as string }, data: { isPublished: false } });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Failed to unpublish report card' });
  }
});

// Get report cards for a student
router.get('/reports/:studentId', requireAuth, async (req: any, res) => {
  try {
    const studentId = req.params.studentId as string;
    
    if (!(await canViewStudentFees(req.user, studentId)) && req.user.role !== 'TEACHER') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (req.user.role === 'STUDENT' || req.user.role === 'PARENT') {
      const access = await feeAccess(studentId, 'Grades');
      if (!access.allowed) {
        return res.status(402).json({ error: lockMessage(access, 'Report cards'), locked: true, access, balance: access.balance });
      }
    }

    const reportCards = await prisma.reportCard.findMany({
      where: { studentId, isPublished: true },
      include: {
        subjectGrades: {
          include: { subject: true }
        }
      },
      orderBy: { term: 'desc' }
    });

    res.json(reportCards);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch report cards' });
  }
});

export default router;
