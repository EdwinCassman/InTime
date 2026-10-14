-- DropForeignKey
ALTER TABLE "RecurringAssignment" DROP CONSTRAINT "RecurringAssignment_shiftTemplateId_fkey";

-- AlterTable
ALTER TABLE "RecurringAssignment" ADD COLUMN     "customEndNextDay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customEndTime" TEXT,
ADD COLUMN     "customStartTime" TEXT,
ALTER COLUMN "shiftTemplateId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "RecurringAssignment" ADD CONSTRAINT "RecurringAssignment_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
