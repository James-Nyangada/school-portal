import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import auditRoutes from './routes/audit';
import dashboardRoutes from './routes/dashboard';
import studentsRoutes from './routes/students';
import passwordRoutes from './routes/password';
import uploadRoutes from './routes/upload';
import feesRoutes from './routes/fees';
import financeRoutes from './routes/finance';
import feeStructuresRoutes from './routes/feeStructures';
import mpesaRoutes from './routes/mpesa';
import gradesRoutes from './routes/grades';
import attendanceRoutes from './routes/attendance';
import assignmentsRoutes from './routes/assignments';
import analyticsRoutes from './routes/analytics';
import communicationsRoutes from './routes/communications';
import classesRoutes from './routes/classes';
import subjectsRoutes from './routes/subjects';
import teacherAssignmentsRoutes from './routes/teacher-assignments';
import notificationsRoutes from './routes/notifications';
import newslettersRoutes from './routes/newsletters';
import gradingRoutes from './routes/grading';
import timetableRoutes from './routes/tt';
import schoolRoutes, { publicSchoolRouter } from './routes/school';
import paybillRoutes from './routes/paybill';
import clearanceRoutes from './routes/clearance';
import { recoverJobsOnBoot } from './services/tt/jobs.service';
import { scheduleNightlyReconciliation } from './services/mpesaReconciliation';
import { prisma } from './lib/prisma';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/auth/password', passwordRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/fees', feesRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/fee-structures', feeStructuresRoutes);
app.use('/api/mpesa', mpesaRoutes);
app.use('/api/payments/c2b', paybillRoutes);
app.use('/api/grades', gradesRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/communications', communicationsRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/subjects', subjectsRoutes);
app.use('/api/teacher-assignments', teacherAssignmentsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/newsletters', newslettersRoutes);
app.use('/api/grading', gradingRoutes);
app.use('/api/tt', timetableRoutes);
app.use('/api/school', schoolRoutes);
app.use('/api/clearance', clearanceRoutes);
app.use('/api/public', publicSchoolRouter);

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  void recoverJobsOnBoot();
  scheduleNightlyReconciliation();
});

// Let in-flight requests finish and release DB connections when the host stops/redeploys us
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  });
}
