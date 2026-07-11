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
import mpesaRoutes from './routes/mpesa';
import gradesRoutes from './routes/grades';
import attendanceRoutes from './routes/attendance';
import assignmentsRoutes from './routes/assignments';
import analyticsRoutes from './routes/analytics';
import communicationsRoutes from './routes/communications';
import classesRoutes from './routes/classes';
import subjectsRoutes from './routes/subjects';
import teacherAssignmentsRoutes from './routes/teacher-assignments';
import gradingRoutes from './routes/grading';

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
app.use('/api/mpesa', mpesaRoutes);
app.use('/api/grades', gradesRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/communications', communicationsRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/subjects', subjectsRoutes);
app.use('/api/teacher-assignments', teacherAssignmentsRoutes);
app.use('/api/grading', gradingRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
