import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { PrismaClient, Role, Status } from '@prisma/client';
import bcrypt from 'bcrypt';

const router = Router();
const prisma = new PrismaClient();

// POST /api/students/admit
router.post('/admit', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: any, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      dob, 
      gender, 
      previousSchool, 
      medicalNotes,
      studentEmail,
      studentPassword,
      parentName,
      parentPhone,
      parentEmail,
      parentRelationship,
      parentPassword,
      classId,
      birthCertificateUrl,
      reportCardUrl,
      passportPhotoUrl
    } = req.body;
    
    // Check if student email is already in use
    if (studentEmail) {
      const existingStudent = await prisma.user.findUnique({
        where: { email: studentEmail }
      });
      if (existingStudent) {
        return res.status(400).json({ error: 'Student email is already in use' });
      }
    }

    // Extract manual admission number and nemis number
    const { admissionNumber: manualAdmissionNumber, nemisNumber } = req.body;

    // Check uniqueness of manually entered admission number
    let finalAdmissionNumber = manualAdmissionNumber;
    if (finalAdmissionNumber) {
      const existingAdm = await prisma.user.findUnique({
        where: { admissionNumber: finalAdmissionNumber }
      });
      if (existingAdm) {
        return res.status(400).json({ error: 'Admission number is already in use' });
      }
    } else {
      finalAdmissionNumber = `ADM-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // Check uniqueness of NEMIS number
    if (nemisNumber) {
      const existingNemis = await prisma.user.findUnique({
        where: { nemisNumber }
      });
      if (existingNemis) {
        return res.status(400).json({ error: 'NEMIS number is already in use' });
      }
    }

    // Hash student password or auto-generate
    const tempPassword = studentPassword || Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const newStudent = await prisma.user.create({
      data: {
        role: Role.STUDENT,
        firstName,
        lastName,
        email: studentEmail || null,
        admissionNumber: finalAdmissionNumber,
        nemisNumber: nemisNumber || null,
        passwordHash,
        status: Status.PENDING_ACTIVATION,
        createdById: req.user.id,
        birthCertificateUrl: birthCertificateUrl || null,
        reportCardUrl: reportCardUrl || null,
        passportPhotoUrl: passportPhotoUrl || null,
        classId: classId || null
      }
    });

    const { subjectIds } = req.body; // array of subject ids for elective/student-specific subjects
    if (subjectIds && Array.isArray(subjectIds) && subjectIds.length > 0) {
      await prisma.studentSubject.createMany({
        data: subjectIds.map((subjectId: string) => ({
          studentId: newStudent.id,
          subjectId
        }))
      });
    }
    
    // Find or create parent
    let parent = null;
    const orConditions = [];
    if (parentPhone) orConditions.push({ phone: parentPhone });
    if (parentEmail) orConditions.push({ email: parentEmail });
    
    if (orConditions.length > 0) {
      const existingUser = await prisma.user.findFirst({
        where: { OR: orConditions }
      });
      if (existingUser) {
        if (existingUser.role !== Role.PARENT) {
          return res.status(400).json({ 
            error: `The parent's phone number or email is already registered to a user with the role ${existingUser.role}. Please use a different one.` 
          });
        }
        parent = existingUser;
      }
    }
    
    if (!parent) {
      const parentTempPassword = parentPassword || Math.random().toString(36).slice(-8);
      const parentPasswordHash = await bcrypt.hash(parentTempPassword, 10);
      
      parent = await prisma.user.create({
        data: {
          role: Role.PARENT,
          firstName: parentName.split(' ')[0],
          lastName: parentName.split(' ').slice(1).join(' ') || '',
          phone: parentPhone || null,
          email: parentEmail || null,
          passwordHash: parentPasswordHash,
          status: Status.PENDING_ACTIVATION,
          createdById: req.user.id
        }
      });
    }
    
    await prisma.studentParent.create({
      data: {
        studentId: newStudent.id,
        parentId: parent.id,
        relationship: parentRelationship || null
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: 'ADMIT_STUDENT',
        targetId: newStudent.id,
        details: `Admitted student ${firstName} ${lastName}`
      }
    });

    const { passwordHash: _, ...rest } = newStudent;
    res.status(201).json({ ...rest, tempPassword });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/students/:id/subjects
router.get('/:id/subjects', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    
    // Authorization: only the student themselves, or parent, or staff
    if (req.user.role === 'STUDENT' && req.user.id !== id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const student = await prisma.user.findUnique({
      where: { id },
      include: {
        studentSubjects: {
          include: { subject: true }
        }
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    let classSubjects: any[] = [];
    if (student.classId) {
      const classData = await prisma.class.findUnique({
        where: { id: student.classId },
        include: {
          subjects: {
            include: { subject: true }
          }
        }
      });
      if (classData) {
        classSubjects = classData.subjects.map((cs: any) => cs.subject);
      }
    }

    const studentSpecificSubjects = student.studentSubjects.map((ss: any) => ss.subject);

    // Union by id
    const allSubjectsMap = new Map();
    classSubjects.forEach((sub: any) => allSubjectsMap.set(sub.id, sub));
    studentSpecificSubjects.forEach((sub: any) => allSubjectsMap.set(sub.id, sub));

    res.json(Array.from(allSubjectsMap.values()));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/students/:id - Update student bio data, class, documents, and parent info
router.patch('/:id', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: any, res) => {
  try {
    const studentId = req.params.id as string;
    const { 
      firstName, 
      lastName, 
      dob, 
      gender, 
      previousSchool, 
      medicalNotes,
      studentEmail,
      phone,
      admissionNumber,
      nemisNumber,
      classId,
      birthCertificateUrl,
      reportCardUrl,
      passportPhotoUrl,
      // Parent
      parentName,
      parentPhone,
      parentEmail,
      parentRelationship,
      // Subject IDs
      subjectIds
    } = req.body;

    // Verify student exists
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      include: { childLinks: true }
    });

    if (!student || student.role !== Role.STUDENT) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Prepare update data
    const studentUpdateData: any = {};
    if (firstName !== undefined) studentUpdateData.firstName = firstName;
    if (lastName !== undefined) studentUpdateData.lastName = lastName;
    if (dob !== undefined) studentUpdateData.dob = dob ? new Date(dob) : null;
    if (gender !== undefined) studentUpdateData.gender = gender || null;
    if (previousSchool !== undefined) studentUpdateData.previousSchool = previousSchool || null;
    if (medicalNotes !== undefined) studentUpdateData.medicalNotes = medicalNotes || null;
    if (studentEmail !== undefined) studentUpdateData.email = studentEmail || null;
    if (phone !== undefined) studentUpdateData.phone = phone || null;
    if (birthCertificateUrl !== undefined) studentUpdateData.birthCertificateUrl = birthCertificateUrl || null;
    if (reportCardUrl !== undefined) studentUpdateData.reportCardUrl = reportCardUrl || null;
    if (passportPhotoUrl !== undefined) studentUpdateData.passportPhotoUrl = passportPhotoUrl || null;
    if (classId !== undefined) studentUpdateData.classId = classId || null;
    if (nemisNumber !== undefined) studentUpdateData.nemisNumber = nemisNumber || null;

    if (admissionNumber !== undefined && admissionNumber !== student.admissionNumber) {
      // check unique
      const existingAdm = await prisma.user.findUnique({ where: { admissionNumber } });
      if (existingAdm) return res.status(400).json({ error: 'Admission number is already in use' });
      studentUpdateData.admissionNumber = admissionNumber;
    }

    // Run transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Student User
      const updatedStudent = await tx.user.update({
        where: { id: studentId },
        data: studentUpdateData
      });

      // 2. Update StudentSpecific Subjects
      if (subjectIds !== undefined && Array.isArray(subjectIds)) {
        await tx.studentSubject.deleteMany({ where: { studentId } });
        if (subjectIds.length > 0) {
          await tx.studentSubject.createMany({
            data: subjectIds.map((subjectId: string) => ({
              studentId,
              subjectId
            }))
          });
        }
      }

      // 3. Handle Parent Linking & Updating
      if (parentPhone || parentEmail || parentName) {
        // Find existing parent links
        const existingLink = await tx.studentParent.findFirst({
          where: { studentId }
        });

        let parentUser = null;
        const orConditions = [];
        if (parentPhone) orConditions.push({ phone: parentPhone });
        if (parentEmail) orConditions.push({ email: parentEmail });

        if (orConditions.length > 0) {
          const foundParent = await tx.user.findFirst({
            where: { OR: orConditions }
          });
          if (foundParent) {
            if (foundParent.role !== Role.PARENT) {
              throw new Error(`The parent's contact info is registered to a ${foundParent.role} account.`);
            }
            parentUser = foundParent;
          }
        }

        if (parentUser) {
          // Update parent fields if provided
          const parentUpdateData: any = {};
          if (parentName) {
            parentUpdateData.firstName = parentName.split(' ')[0];
            parentUpdateData.lastName = parentName.split(' ').slice(1).join(' ') || '';
          }
          await tx.user.update({
            where: { id: parentUser.id },
            data: parentUpdateData
          });
        } else {
          // Create new parent
          const parentTempPassword = Math.random().toString(36).slice(-8);
          const parentPasswordHash = await bcrypt.hash(parentTempPassword, 10);
          
          parentUser = await tx.user.create({
            data: {
              role: Role.PARENT,
              firstName: parentName ? parentName.split(' ')[0] : 'Parent',
              lastName: parentName ? parentName.split(' ').slice(1).join(' ') : '',
              phone: parentPhone || null,
              email: parentEmail || null,
              passwordHash: parentPasswordHash,
              status: Status.PENDING_ACTIVATION,
              createdById: req.user.id
            }
          });
        }

        // Relink if changed
        if (existingLink) {
          if (existingLink.parentId !== parentUser.id) {
            await tx.studentParent.update({
              where: { id: existingLink.id },
              data: { parentId: parentUser.id, relationship: parentRelationship || null }
            });
          } else if (parentRelationship) {
            await tx.studentParent.update({
              where: { id: existingLink.id },
              data: { relationship: parentRelationship }
            });
          }
        } else {
          await tx.studentParent.create({
            data: {
              studentId,
              parentId: parentUser.id,
              relationship: parentRelationship || null
            }
          });
        }
      }

      return updatedStudent;
    });

    res.json({ message: 'Student information updated successfully', student: result });
  } catch (error: any) {
    console.error('Error updating student:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
