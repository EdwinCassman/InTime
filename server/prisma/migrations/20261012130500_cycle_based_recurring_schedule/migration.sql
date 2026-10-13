-- DropForeignKey
ALTER TABLE "GeneratedScheduleDay" DROP CONSTRAINT "GeneratedScheduleDay_userId_fkey";

-- DropIndex
DROP INDEX "RecurringAssignment_userId_weekday_key";

-- AlterTable
ALTER TABLE "RecurringAssignment" DROP COLUMN "weekday",
ADD COLUMN     "cycleDay" INTEGER NOT NULL;

-- DropTable
DROP TABLE "GeneratedScheduleDay";

-- CreateTable
CREATE TABLE "ScheduleOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOverride_userId_date_key" ON "ScheduleOverride"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringAssignment_userId_cycleDay_key" ON "RecurringAssignment"("userId", "cycleDay");

-- AddForeignKey
ALTER TABLE "ScheduleOverride" ADD CONSTRAINT "ScheduleOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
