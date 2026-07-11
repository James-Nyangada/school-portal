import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Generate and publish report cards
router.post('/publish', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { term } = req.body;
    if (!term) {
      return res.status(400).json({ error: 'Term is required' });
    }

    // Find all published grades for this term
    const grades = await prisma.grade.findMany({
      where: {
        term,
        status: 'PUBLISHED',
      },
      include: {
        student: true,
      }
    });

    if (grades.length === 0) {
      return res.status(400).json({ error: 'No published grades found for this term' });
    }

    // Group grades by student
    const studentGradesMap = new Map<string, any[]>();
    grades.forEach(grade => {
      if (!studentGradesMap.has(grade.studentId)) {
        studentGradesMap.set(grade.studentId, []);
      }
      studentGradesMap.get(grade.studentId)!.push(grade);
    });

    const reportCardsToCreate: any[] = [];
    
    // Process each student's grades to generate a report card
    for (const [studentId, sGrades] of studentGradesMap.entries()) {
      // Basic sum of numeric grades
      let totalScore = 0;
      sGrades.forEach(g => {
        const num = parseFloat(g.value);
        if (!isNaN(num)) {
          totalScore += num;
        }
      });

      // Upsert report card (so we can re-publish if needed)
      const reportCard = await prisma.reportCard.findFirst({
        where: { studentId, term }
      });

      if (reportCard) {
        // Update existing
        await prisma.reportCard.update({
          where: { id: reportCard.id },
          data: {
            totalScore,
            isPublished: true,
          }
        });
        
        // Delete old subjects
        await prisma.reportCardSubject.deleteMany({
          where: { reportCardId: reportCard.id }
        });
        
        // Create new subjects
        await prisma.reportCardSubject.createMany({
          data: sGrades.map(g => ({
            reportCardId: reportCard.id,
            subjectId: g.subjectId,
            gradeValue: g.value,
            teacherRemark: g.teacherComment,
          }))
        });
      } else {
        // Create new
        const newRC = await prisma.reportCard.create({
          data: {
            studentId,
            term,
            totalScore,
            isPublished: true,
            subjectGrades: {
              create: sGrades.map(g => ({
                subjectId: g.subjectId,
                gradeValue: g.value,
                teacherRemark: g.teacherComment,
              }))
            }
          }
        });
      }
    }

    // Note: We could add logic here to calculate and update ranks if needed.

    res.json({ message: 'Report cards generated and published successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to publish report cards' });
  }
});

// Get report cards for a student
router.get('/reports/:studentId', requireAuth, async (req: any, res) => {
  try {
    const studentId = req.params.studentId as string;
    
    // Authorization: only the student themselves, or parent, or staff
    if (req.user.role === 'STUDENT' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Check fee balance
    const feeRecords = await prisma.feeRecord.findMany({
      where: { studentId }
    });

    const totalBilled = feeRecords.reduce((sum, fr) => sum + fr.totalBilled, 0);
    const totalPaid = feeRecords.reduce((sum, fr) => sum + fr.amountPaid, 0);
    const balance = totalBilled - totalPaid;

    if (balance > 0) {
      return res.status(403).json({ error: 'Fee balance must be cleared to view report cards', balance });
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
