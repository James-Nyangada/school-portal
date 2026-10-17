import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { requireAuth, requireRole, requireFeature, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
});

// Handout formats a teacher may attach to a FILE_UPLOAD assignment
const ATTACHMENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
};

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Cloudinary's raw-file limit on the free plan
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ATTACHMENT_TYPES[ext]) cb(null, true);
    else cb(new Error('Only PDF, Word (.docx) or text (.txt) files can be attached'));
  },
}).single('file');

// Only accept handouts uploaded through POST /attachment (they're fetched server-side on download)
const isOwnAttachment = (url: unknown): url is string =>
  typeof url === 'string' &&
  url.startsWith(`https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/raw/upload/`);

// Students who count towards a class's roster (left/graduated students are excluded)
const classStudentsWhere = (classId: string) => ({
  role: 'STUDENT' as const,
  classId,
  status: { notIn: ['COMPLETED' as const, 'TRANSFERRED' as const] },
});

const teachesSubject = (teacherId: string, subjectId: string) =>
  prisma.teacherSubject.findUnique({ where: { teacherId_subjectId: { teacherId, subjectId } } });

const toQuestionData = (questions: any[], assignmentId: string) =>
  questions.map((q: any, index: number) => ({
    assignmentId,
    questionText: q.questionText || q.text,
    questionType: q.questionType || q.type || 'MCQ',
    options: q.options ? JSON.stringify(q.options) : null,
    correctAnswer: q.correctAnswer || null,
    points: q.points || 1,
    sortOrder: index,
  }));

// ============================================================
// TEACHER: Upload a handout for a FILE_UPLOAD assignment
// Returns { url, name } to send as attachmentUrl/attachmentName on create/edit
// ============================================================
router.post('/attachment', requireAuth, requireRole('TEACHER'), (req: AuthRequest, res) => {
  attachmentUpload(req, res, async (err: any) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({ error: tooBig ? 'File is too large (max 10 MB)' : err.message });
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .slice(0, 60) || 'assignment';

      // Upload as a raw file so PDFs/DOCX are delivered as-is (image-type PDFs are blocked by default)
      const uploaded = await cloudinary.uploader.upload(
        `data:${ATTACHMENT_TYPES[ext]};base64,${file.buffer.toString('base64')}`,
        {
          folder: 'school_portal_assignments',
          resource_type: 'raw',
          public_id: `${Date.now()}-${base}${ext}`,
        }
      );

      res.status(201).json({ url: uploaded.secure_url, name: file.originalname });
    } catch (error: any) {
      console.error('Error uploading assignment attachment:', error);
      res.status(500).json({ error: error.message || 'Failed to upload file' });
    }
  });
});

// ============================================================
// TEACHER: Create Assignment (QUIZ or FILE_UPLOAD)
// ============================================================
router.post('/', requireAuth, requireRole('TEACHER'), requireFeature('assignmentsEnabled', 'Assignments and quizzes'), async (req: AuthRequest, res) => {
  try {
    const { title, description, type, subjectId, classId, dueDate, maxScore, questions, status, attachmentUrl, attachmentName } = req.body;
    const teacherId = req.user!.id;

    if (attachmentUrl && !isOwnAttachment(attachmentUrl)) {
      return res.status(400).json({ error: 'Invalid attachment. Please upload the file again.' });
    }

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

      if (!(await teachesSubject(teacherId, finalSubjectId))) {
        return res.status(403).json({ error: `You do not teach ${subject.name}. You can only create assignments for your own subjects.` });
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
        attachmentUrl: type === 'FILE_UPLOAD' ? attachmentUrl || null : null,
        attachmentName: type === 'FILE_UPLOAD' && attachmentUrl ? attachmentName || 'assignment' : null,
      },
    });

    // If QUIZ type, create the questions
    if (type === 'QUIZ' && Array.isArray(questions) && questions.length > 0) {
      await prisma.quizQuestion.createMany({ data: toQuestionData(questions, assignment.id) });
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

    // Teacher/admin view: how many students in the class have submitted
    const classIds = [...new Set(assignments.map((a) => a.classId).filter(Boolean))] as string[];
    const sizes = classIds.length
      ? await prisma.user.groupBy({
          by: ['classId'],
          where: { ...classStudentsWhere(''), classId: { in: classIds } },
          _count: { _all: true },
        })
      : [];
    const sizeByClass = new Map(sizes.map((s) => [s.classId, s._count._all]));

    return res.json(
      mappedAssignments.map((a) => ({
        ...a,
        classSize: a.classId ? sizeByClass.get(a.classId) ?? 0 : 0,
        submittedCount: a._count.submissions,
      }))
    );
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
    if (!assignment.isPublished || !assignment.isOpen) {
      return res.status(403).json({ error: 'This assignment is closed and no longer accepts submissions' });
    }
    if (assignment.type === 'FILE_UPLOAD') {
      return res.status(400).json({ error: 'Hand this assignment in to your teacher. They will record your submission.' });
    }

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

// ============================================================
// TEACHER: Edit an assignment (details, open/closed, questions)
// ============================================================
router.patch('/:id', requireAuth, requireRole('TEACHER'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const teacherId = req.user!.id;
    const existing = await prisma.assignment.findUnique({
      where: { id },
      include: { _count: { select: { submissions: true } } },
    });
    if (!existing || existing.teacherId !== teacherId) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const { title, description, type, subjectId, classId, dueDate, maxScore, isOpen, status, questions, attachmentUrl, attachmentName } = req.body;
    const data: any = {};
    if (attachmentUrl !== undefined) {
      if (attachmentUrl && !isOwnAttachment(attachmentUrl)) {
        return res.status(400).json({ error: 'Invalid attachment. Please upload the file again.' });
      }
      data.attachmentUrl = attachmentUrl || null;
      data.attachmentName = attachmentUrl ? attachmentName || 'assignment' : null;
    }
    if ((type ?? existing.type) === 'QUIZ') {
      data.attachmentUrl = null;
      data.attachmentName = null;
    }
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (type !== undefined) data.type = type;
    if (classId !== undefined) data.classId = classId || null;
    if (dueDate !== undefined) data.dueDate = new Date(dueDate);
    if (maxScore !== undefined) data.maxScore = Number(maxScore) || 100;
    if (isOpen !== undefined) data.isOpen = Boolean(isOpen);
    if (status !== undefined) data.isPublished = status !== 'DRAFT';
    if (subjectId !== undefined && subjectId !== existing.subjectId) {
      if (subjectId && !(await teachesSubject(teacherId, subjectId))) {
        return res.status(403).json({ error: 'You can only create assignments for your own subjects.' });
      }
      data.subjectId = subjectId || null;
    }

    // Questions can't change once students have answered them
    const replaceQuestions = Array.isArray(questions);
    if (replaceQuestions && existing._count.submissions > 0) {
      return res.status(400).json({ error: 'Questions cannot be changed after students have submitted.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.assignment.update({ where: { id }, data });
      if (replaceQuestions) {
        await tx.quizQuestion.deleteMany({ where: { assignmentId: id } });
        if ((data.type ?? existing.type) === 'QUIZ' && questions.length > 0) {
          await tx.quizQuestion.createMany({ data: toQuestionData(questions, id) });
        }
      }
    });

    const updated = await prisma.assignment.findUnique({
      where: { id },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json(updated);
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// TEACHER: Class roster for an assignment — who has / hasn't submitted
// ============================================================
router.get('/:id/roster', requireAuth, requireRole('TEACHER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: req.params.id as string },
      select: { id: true, teacherId: true, classId: true },
    });
    if (!assignment || (req.user!.role === 'TEACHER' && assignment.teacherId !== req.user!.id)) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    if (!assignment.classId) return res.json([]);

    const [students, submissions, reminders] = await Promise.all([
      prisma.user.findMany({
        where: classStudentsWhere(assignment.classId),
        select: { id: true, firstName: true, lastName: true, admissionNumber: true, passportPhotoUrl: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      prisma.assignmentSubmission.findMany({
        where: { assignmentId: assignment.id },
        include: { responses: { include: { question: true } } },
      }),
      prisma.notification.groupBy({
        by: ['userId'],
        where: { assignmentId: assignment.id, type: 'ASSIGNMENT_REMINDER' },
        _max: { createdAt: true },
      }),
    ]);

    const subByStudent = new Map(submissions.map((s) => [s.studentId, s]));
    const remindedAt = new Map(reminders.map((r) => [r.userId, r._max.createdAt]));

    res.json(
      students.map((st) => ({
        student: st,
        submission: subByStudent.get(st.id) ?? null,
        lastRemindedAt: remindedAt.get(st.id) ?? null,
      }))
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// TEACHER: Record a hand-in for a FILE_UPLOAD assignment (work is done on paper)
// Body: { submitted: boolean, score?: number | null, feedback?: string }
// ============================================================
router.put('/:id/roster/:studentId', requireAuth, requireRole('TEACHER'), async (req: AuthRequest, res) => {
  try {
    const studentId = req.params.studentId as string;
    const { submitted, score, feedback } = req.body;
    const assignment = await prisma.assignment.findUnique({ where: { id: req.params.id as string } });
    if (!assignment || assignment.teacherId !== req.user!.id) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    if (assignment.type !== 'FILE_UPLOAD') {
      return res.status(400).json({ error: 'Only file assignments are marked as handed in by the teacher' });
    }

    const student = await prisma.user.findFirst({
      where: { id: studentId, ...classStudentsWhere(assignment.classId ?? '') },
      select: { id: true },
    });
    if (!student) return res.status(400).json({ error: 'Student is not in this class' });

    const existing = await prisma.assignmentSubmission.findFirst({ where: { assignmentId: assignment.id, studentId } });

    if (!submitted) {
      if (existing) await prisma.assignmentSubmission.delete({ where: { id: existing.id } });
      return res.json(null);
    }

    const hasScore = score !== null && score !== undefined && score !== '';
    const numericScore = hasScore ? Number(score) : null;
    if (numericScore !== null && (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > assignment.maxScore)) {
      return res.status(400).json({ error: `Score must be between 0 and ${assignment.maxScore}` });
    }

    const data = {
      score: numericScore,
      maxScore: assignment.maxScore,
      feedback: feedback?.trim() || null,
      status: numericScore !== null ? ('MANUALLY_GRADED' as const) : ('PENDING' as const),
      gradedAt: numericScore !== null ? new Date() : null,
    };

    const submission = existing
      ? await prisma.assignmentSubmission.update({ where: { id: existing.id }, data })
      : await prisma.assignmentSubmission.create({ data: { ...data, assignmentId: assignment.id, studentId } });

    res.json(submission);
  } catch (error) {
    console.error('Error recording hand-in:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// Download the handout of a FILE_UPLOAD assignment with its original file name
// ============================================================
router.get('/:id/attachment', requireAuth, async (req: AuthRequest, res) => {
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: req.params.id as string },
      select: { teacherId: true, classId: true, isPublished: true, attachmentUrl: true, attachmentName: true },
    });
    if (!assignment || !isOwnAttachment(assignment.attachmentUrl)) {
      return res.status(404).json({ error: 'No file attached to this assignment' });
    }

    const { role, id: userId } = req.user!;
    let allowed = role === 'ADMIN' || role === 'SUPER_ADMIN' || (role === 'TEACHER' && assignment.teacherId === userId);
    if (role === 'STUDENT' && assignment.isPublished && assignment.classId) {
      const inClass = await prisma.user.findFirst({ where: { id: userId, classId: assignment.classId }, select: { id: true } });
      allowed = !!inClass;
    }
    if (!allowed) return res.status(404).json({ error: 'No file attached to this assignment' });

    // Public delivery of PDFs is blocked on the account ("deny or ACL failure"), so fetch through
    // a signed API download instead. public_id is the URL path after /raw/upload/[v123/].
    const publicId = assignment.attachmentUrl.split('/raw/upload/')[1]!.replace(/^v\d+\//, '');
    const upstream = await fetch(
      cloudinary.utils.private_download_url(publicId, '', { resource_type: 'raw', type: 'upload' })
    );
    if (!upstream.ok) {
      console.error('Attachment fetch failed:', upstream.status, assignment.attachmentUrl);
      return res.status(502).json({ error: 'Could not fetch the file. Please try again later.' });
    }

    const name = assignment.attachmentName || 'assignment';
    const ext = path.extname(name).toLowerCase();
    res.setHeader('Content-Type', ATTACHMENT_TYPES[ext] || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${name.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`
    );
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// TEACHER: Remind a student who hasn't submitted (dashboard alert)
// ============================================================
router.post('/:id/remind', requireAuth, requireRole('TEACHER'), async (req: AuthRequest, res) => {
  try {
    const { studentId } = req.body;
    const assignment = await prisma.assignment.findUnique({
      where: { id: req.params.id as string },
      include: { subject: { select: { name: true } } },
    });
    if (!assignment || assignment.teacherId !== req.user!.id) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const student = await prisma.user.findFirst({
      where: { id: studentId, ...classStudentsWhere(assignment.classId ?? '') },
      select: { id: true },
    });
    if (!student) return res.status(400).json({ error: 'Student is not in this class' });

    const submitted = await prisma.assignmentSubmission.findFirst({ where: { assignmentId: assignment.id, studentId } });
    if (submitted) return res.status(400).json({ error: 'Student has already submitted this assignment' });

    const due = assignment.dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const notification = await prisma.notification.create({
      data: {
        userId: studentId,
        type: 'ASSIGNMENT_REMINDER',
        title: `Assignment due: ${assignment.title}`,
        message: `${assignment.subject?.name ? assignment.subject.name + ' — ' : ''}Your teacher is waiting for your submission. Due ${due}.`,
        link: `/student/assignments?open=${assignment.id}`,
        assignmentId: assignment.id,
        senderId: req.user!.id,
      },
    });

    res.status(201).json(notification);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
