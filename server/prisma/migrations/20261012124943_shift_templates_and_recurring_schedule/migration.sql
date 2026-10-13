-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "fromRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shiftTemplateId" TEXT;

-- CreateTable
CREATE TABLE "ShiftTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weekdayStart" TEXT NOT NULL,
    "weekdayEnd" TEXT NOT NULL,
    "weekdayEndNextDay" BOOLEAN NOT NULL DEFAULT false,
    "weekendStart" TEXT NOT NULL,
    "weekendEnd" TEXT NOT NULL,
    "weekendEndNextDay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "shiftTemplateId" TEXT NOT NULL,

    CONSTRAINT "RecurringAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedScheduleDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedScheduleDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftTemplate_name_key" ON "ShiftTemplate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringAssignment_userId_weekday_key" ON "RecurringAssignment"("userId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedScheduleDay_userId_date_key" ON "GeneratedScheduleDay"("userId", "date");

-- AddForeignKey
ALTER TABLE "RecurringAssignment" ADD CONSTRAINT "RecurringAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringAssignment" ADD CONSTRAINT "RecurringAssignment_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedScheduleDay" ADD CONSTRAINT "GeneratedScheduleDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
