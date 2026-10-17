-- AlterTable
ALTER TABLE "Shift" ADD COLUMN "absenceUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_absenceUserId_fkey" FOREIGN KEY ("absenceUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
