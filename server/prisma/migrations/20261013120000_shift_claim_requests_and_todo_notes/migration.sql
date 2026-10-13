-- CreateEnum
CREATE TYPE "ShiftClaimRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "ShiftNoteType" AS ENUM ('INFO', 'TODO');

-- AlterTable
ALTER TABLE "ShiftNote" ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "type" "ShiftNoteType" NOT NULL DEFAULT 'INFO';

-- CreateTable
CREATE TABLE "ShiftClaimRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shiftId" TEXT,
    "shiftStartsAt" TIMESTAMP(3) NOT NULL,
    "shiftEndsAt" TIMESTAMP(3) NOT NULL,
    "status" "ShiftClaimRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ShiftClaimRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftClaimRequest_userId_idx" ON "ShiftClaimRequest"("userId");

-- CreateIndex
CREATE INDEX "ShiftClaimRequest_shiftId_idx" ON "ShiftClaimRequest"("shiftId");

-- AddForeignKey
ALTER TABLE "ShiftClaimRequest" ADD CONSTRAINT "ShiftClaimRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftClaimRequest" ADD CONSTRAINT "ShiftClaimRequest_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftNote" ADD CONSTRAINT "ShiftNote_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
