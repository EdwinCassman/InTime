-- DropForeignKey
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_userId_fkey";

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "originalUserId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_originalUserId_fkey" FOREIGN KEY ("originalUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
