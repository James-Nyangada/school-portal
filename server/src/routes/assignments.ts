import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ============================================================
// TEACHER: Create Assignment (QUIZ or FILE_UPLOAD)
// ============================================================
router.post('/', requireAuth, requireRole('TEACHER'), async (req: AuthRequest, res) => {
  try {
    const { title, description, type, subjectId, classId, dueDate, maxScore, questions, status } = req.body;
    const teacherId = req.user!.id;

    let finalSubjectId = null;
    if (subjectId) {
      const subject = await prisma.subject.findFirst({
        where: {
          OR: [
            { id: subjectId },
            { name: { equals: subjectId, mode: 'insensitive' } },
            { code: { equals: subjectId, mode: 'insensitive' } }
          ]
        }
      });
      if (subject) {
        finalSubjectId = subject.id;
      } else {
        return res.status(400).json({ error: `Subject '${subjectId}' not found. Please provide a valid Subject ID or Name, or leave it blank.` });
      }
    }

    const isPublishedValue = status !== 'DRAFT'; // Default to true unless explicitly 'DRAFT'

    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        type, // 'QUIZ' or 'FILE_UPLOAD'
        subjectId: finalSubjectId,
        classId: classId || null,
        teacherId,
        dueDate: new Date(dueDate),
        maxScore: maxScore || 100,
        isPublished: isPublishedValue,
      },
    });

    // If QUIZ type, create the questions
    if (type === 'QUIZ' && Array.isArray(questions) && questions.length > 0) {
      const questionData = questions.map((q: any, index: number) => ({
        assignmentId: assignment.id,
        questionText: q.questionText || q.text,
        questionType: q.questionType || q.type || 'MCQ',
        options: q.options ? JSON.stringify(q.options) : null,
        correctAnswer: q.correctAnswer || null,
        points: q.points || 1,
        sortOrder: index,
      }));

      await prisma.quizQuestion.createMany({ data: questionData });
    }

    const fullAssignment = await prisma.assignment.findUnique({
      where: { id: assignment.id },
      include: { questions: { orderBy: { sortOrder: 'asc' } }, _count: { select: { submissions: true } } },
    });

    res.status(201).json(fullAssignment);
  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET all assignments (filtered by teacher or student view)
// ============================================================
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { teacherId, studentId } = req.query;
    const where: any = {};

    if (req.user!.role === 'STUDENT') {
      where.isPublished = true;
      const studentUser = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { classId: true }
      });
      if (studentUser && studentUser.classId) {
        where.classId = studentUser.classId;
      }
    } else {
      if (teacherId) {
        where.teacherId = teacherId as string;
      } else if (req.user!.role === 'TEACHER') {
        where.teacherId = req.user!.id;
      }

      if (studentId) {
        where.isPublished = true;
        const studentUser = await prisma.user.findUnique({
          where: { id: studentId as string },
          select: { classId: true }
        });
        if (studentUser && studentUser.classId) {
          where.classId = studentUser.classId;
        }
      }
    }

    const assignments = await prisma.assignment.findMany({
      where,
      include: {
        subject: { select: { name: true, code: true } },
        class: { select: { name: true, level: true } },
        teacher: { select: { firstName: true, lastName: true } },
        questions: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mappedAssignments = assignments.map(a => ({
      ...a,
      status: a.isPublished ? 'PUBLISHED' : 'DRAFT',
      questions: a.questions.map(q => ({
        ...q,
        text: q.questionText,
        type: q.questionType,
        correctAnswer: (req.user!.role === 'STUDENT') ? undefined : q.correctAnswer
      }))
    }));

    // If student, also fetch their submissions for each assignment
    if (studentId || req.user!.role === 'STUDENT') {
      const sid = (studentId as string) || req.user!.id;
      const withSubmissions = await Promise.all(
        mappedAssignments.map(async (a) => {
          const mySubmission = await prisma.assignmentSubmission.findFirst({
            where: { assignmentId: a.id, studentId: sid },
            include: { responses: true },
          });
          return { ...a, submission: mySubmission, mySubmission };
        })
      );
      return res.json(withSubmissions);
    }

    return res.json(mappedAssignments);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET single assignment with questions
// ============================================================
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: req.params.id as string },
      include: {
        subject: { select: { name: true, code: true } },
        teacher: { select: { firstName: true, lastName: true } },
        questions: { orderBy: { sortOrder: 'asc' } },
        submissions: {
          include: {
            student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
            responses: true,
          },
        },
      },
    });

    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    // Map questions for frontend structure (text/type virtual fields) and hide correct answers if student
    const mappedQuestions = assignment.questions.map((q) => ({
      ...q,
      text: q.questionText,
      type: q.questionType,
      correctAnswer: (req.user!.role === 'STUDENT') ? undefined : q.correctAnswer,
    }));

    const result = {
      ...assignment,
      questions: mappedQuestions,
      status: assignment.isPublished ? 'PUBLISHED' : 'DRAFT'
    };

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// STUDENT: Submit a quiz (auto-grade MCQ) or file upload
// ============================================================
router.post('/:id/submit', requireAuth, async (req: AuthRequest, res) => {
  try {
    const assignmentId = req.params.id as string;
    const studentId = req.user!.id;
    const { answers, fileUrl, textContent } = req.body;

    // Check for existing submission
    const existing = await prisma.assignmentSubmission.findFirst({
      where: { assignmentId, studentId },
    });
    if (existing) {
      return res.status(400).json({ error: 'You have already submitted this assignment' });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    // Create the submission
    const submission = await prisma.assignmentSubmission.create({
      data: {
        assignmentId,
        studentId,
        fileUrl: fileUrl || null,
        textContent: textContent || null,
        maxScore: assignment.maxScore,
        status: 'PENDING',
      },
    });

    // If QUIZ, auto-grade MCQ questions
    if (assignment.type === 'QUIZ' && Array.isArray(answers)) {
      let totalScore = 0;
      let maxPossible = 0;

      const responseData = [];

      for (const question of assignment.questions) {
        const studentAnswer = answers.find((a: any) => a.questionId === question.id);
        maxPossible += question.points;

        if (question.questionType === 'MCQ' && question.correctAnswer) {
          const isCorrect = studentAnswer?.answer === question.correctAnswer;
          const pointsAwarded = isCorrect ? question.points : 0;
          totalScore += pointsAwarded;

          responseData.push({
            submissionId: submission.id,
            questionId: question.id,
            answer: studentAnswer?.answer || '',
            isCorrect,
            pointsAwarded,
          });
        } else {
          // OPEN_ENDED — store answer, teacher grades later
          responseData.push({
            submissionId: submission.id,
            questionId: question.id,
            answer: studentAnswer?.answer || '',
            isCorrect: null,
            pointsAwarded: null,
          });
        }
      }

      if (responseData.length > 0) {
        await prisma.quizResponse.createMany({ data: responseData });
      }

      // Check if all questions are MCQ (fully auto-gradable)
      const allMcq = assignment.questions.every((q) => q.questionType === 'MCQ');

      await prisma.assignmentSubmission.update({
        where: { id: submission.id },
        data: {
          score: totalScore,
          status: allMcq ? 'AUTO_GRADED' : 'PENDING',
          gradedAt: allMcq ? new Date() : null,
        },
      });

      return res.json({
        submissionId: submission.id,
        score: totalScore,
        maxScore: maxPossible,
        autoGraded: allMcq,
        message: allMcq
          ? `Quiz auto-graded! You scored ${totalScore}/${maxPossible}`
          : `Quiz submitted. MCQ score: ${totalScore}. Open-ended questions pending teacher review.`,
      });
    }

    // FILE_UPLOAD type — just confirm submission
    res.json({
      submissionId: submission.id,
      message: 'Submission received. Your teacher will grade it shortly.',
    });
  } catch (error) {
    console.error('Error submitting assignment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// TEACHER: Grade a submission manually
// ============================================================
router.patch('/submissions/:submissionId/grade', requireAuth, requireRole('TEACHER'), async (req: AuthRequest, res) => {
  try {
    const submissionId = req.params.submissionId as string;
    const { score, feedback } = req.body;

    const submission = await prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        score: parseFloat(score),
        feedback,
        status: 'MANUALLY_GRADED',
        gradedAt: new Date(),
      },
    });

    res.json(submission);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// TEACHER: Get submissions for an assignment
// ============================================================
router.get('/:id/submissions', requireAuth, requireRole('TEACHER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const submissions = await prisma.assignmentSubmission.findMany({
      where: { assignmentId: req.params.id as string },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
        responses: { include: { question: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
    res.json(submissions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
