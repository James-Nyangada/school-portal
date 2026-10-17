-- CreateTable
CREATE TABLE "TtDay" (
    "id" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "short" TEXT NOT NULL,

    CONSTRAINT "TtDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtPeriod" (
    "id" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "block" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TtPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtSubjectInfo" (
    "subjectId" TEXT NOT NULL,
    "short" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "roomType" TEXT,

    CONSTRAINT "TtSubjectInfo_pkey" PRIMARY KEY ("subjectId")
);

-- CreateTable
CREATE TABLE "TtTeacherInfo" (
    "teacherId" TEXT NOT NULL,
    "short" TEXT NOT NULL,
    "maxPerDay" INTEGER,
    "maxPerWeek" INTEGER,

    CONSTRAINT "TtTeacherInfo_pkey" PRIMARY KEY ("teacherId")
);

-- CreateTable
CREATE TABLE "TtRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'general',
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TtRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtUnavailability" (
    "id" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "periodIndex" INTEGER NOT NULL,

    CONSTRAINT "TtUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ignoreGeneralRooms" BOOLEAN NOT NULL DEFAULT true,
    "rules" JSONB NOT NULL DEFAULT '{"spreadSubjects":true,"noSameSubjectTwiceADay":true,"minimiseTeacherGaps":true,"respectMaxPerDay":true,"preferMorning":true}',

    CONSTRAINT "TtSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtTimetable" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TtTimetable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtParallelGroup" (
    "id" TEXT NOT NULL,
    "timetableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "TtParallelGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtLesson" (
    "id" TEXT NOT NULL,
    "timetableId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "periodsPerWeek" INTEGER NOT NULL,
    "doublesPerWeek" INTEGER NOT NULL DEFAULT 0,
    "roomType" TEXT,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TtLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtLessonClass" (
    "lessonId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "TtLessonClass_pkey" PRIMARY KEY ("lessonId","classId")
);

-- CreateTable
CREATE TABLE "TtLessonTeacher" (
    "lessonId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,

    CONSTRAINT "TtLessonTeacher_pkey" PRIMARY KEY ("lessonId","teacherId")
);

-- CreateTable
CREATE TABLE "TtEntry" (
    "id" TEXT NOT NULL,
    "timetableId" TEXT NOT NULL,
    "cardKey" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "length" INTEGER NOT NULL DEFAULT 1,
    "roomIds" JSONB NOT NULL DEFAULT '[]',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TtEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtOccupancy" (
    "id" TEXT NOT NULL,
    "timetableId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "periodIndex" INTEGER NOT NULL,

    CONSTRAINT "TtOccupancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtJob" (
    "id" TEXT NOT NULL,
    "timetableId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "placed" INTEGER,
    "total" INTEGER,
    "result" JSONB,
    "error" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TtJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtSubstitution" (
    "id" TEXT NOT NULL,
    "timetableId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "entryId" TEXT NOT NULL,
    "absentTeacherId" TEXT NOT NULL,
    "coverTeacherId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TtSubstitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "timetableId" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TtAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TtDay_index_key" ON "TtDay"("index");

-- CreateIndex
CREATE UNIQUE INDEX "TtPeriod_index_key" ON "TtPeriod"("index");

-- CreateIndex
CREATE UNIQUE INDEX "TtRoom_name_key" ON "TtRoom"("name");

-- CreateIndex
CREATE INDEX "TtUnavailability_resourceType_resourceId_idx" ON "TtUnavailability"("resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TtUnavailability_resourceType_resourceId_dayIndex_periodInd_key" ON "TtUnavailability"("resourceType", "resourceId", "dayIndex", "periodIndex");

-- CreateIndex
CREATE INDEX "TtTimetable_status_term_idx" ON "TtTimetable"("status", "term");

-- CreateIndex
CREATE INDEX "TtLesson_timetableId_idx" ON "TtLesson"("timetableId");

-- CreateIndex
CREATE INDEX "TtLessonClass_classId_idx" ON "TtLessonClass"("classId");

-- CreateIndex
CREATE INDEX "TtLessonTeacher_teacherId_idx" ON "TtLessonTeacher"("teacherId");

-- CreateIndex
CREATE INDEX "TtEntry_timetableId_dayIndex_periodIndex_idx" ON "TtEntry"("timetableId", "dayIndex", "periodIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TtEntry_timetableId_cardKey_key" ON "TtEntry"("timetableId", "cardKey");

-- CreateIndex
CREATE INDEX "TtOccupancy_timetableId_resourceType_resourceId_idx" ON "TtOccupancy"("timetableId", "resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TtOccupancy_timetableId_resourceType_resourceId_dayIndex_pe_key" ON "TtOccupancy"("timetableId", "resourceType", "resourceId", "dayIndex", "periodIndex");

-- CreateIndex
CREATE INDEX "TtJob_timetableId_status_idx" ON "TtJob"("timetableId", "status");

-- CreateIndex
CREATE INDEX "TtSubstitution_date_idx" ON "TtSubstitution"("date");

-- CreateIndex
CREATE UNIQUE INDEX "TtSubstitution_date_entryId_absentTeacherId_key" ON "TtSubstitution"("date", "entryId", "absentTeacherId");

-- CreateIndex
CREATE INDEX "TtAudit_timetableId_createdAt_idx" ON "TtAudit"("timetableId", "createdAt");

-- AddForeignKey
ALTER TABLE "TtSubjectInfo" ADD CONSTRAINT "TtSubjectInfo_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtTeacherInfo" ADD CONSTRAINT "TtTeacherInfo_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtParallelGroup" ADD CONSTRAINT "TtParallelGroup_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "TtTimetable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtLesson" ADD CONSTRAINT "TtLesson_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "TtTimetable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtLesson" ADD CONSTRAINT "TtLesson_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtLesson" ADD CONSTRAINT "TtLesson_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TtParallelGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtLessonClass" ADD CONSTRAINT "TtLessonClass_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "TtLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtLessonClass" ADD CONSTRAINT "TtLessonClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtLessonTeacher" ADD CONSTRAINT "TtLessonTeacher_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "TtLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtLessonTeacher" ADD CONSTRAINT "TtLessonTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtEntry" ADD CONSTRAINT "TtEntry_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "TtTimetable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtOccupancy" ADD CONSTRAINT "TtOccupancy_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TtEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtJob" ADD CONSTRAINT "TtJob_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "TtTimetable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtSubstitution" ADD CONSTRAINT "TtSubstitution_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "TtTimetable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtSubstitution" ADD CONSTRAINT "TtSubstitution_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TtEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

