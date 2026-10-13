-- CreateEnum
CREATE TYPE "TimeOffRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateTable
CREATE TABLE "TimeOffRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shiftId" TEXT,
    "shiftStartsAt" TIMESTAMP(3) NOT NULL,
    "shiftEndsAt" TIMESTAMP(3) NOT NULL,
    "status" "TimeOffRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "TimeOffRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftNote" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeOffRequest_userId_idx" ON "TimeOffRequest"("userId");

-- CreateIndex
CREATE INDEX "TimeOffRequest_shiftId_idx" ON "TimeOffRequest"("shiftId");

-- CreateIndex
CREATE INDEX "ShiftNote_shiftId_idx" ON "ShiftNote"("shiftId");

-- AddForeignKey
ALTER TABLE "TimeOffRequest" ADD CONSTRAINT "TimeOffRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOffRequest" ADD CONSTRAINT "TimeOffRequest_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftNote" ADD CONSTRAINT "ShiftNote_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftNote" ADD CONSTRAINT "ShiftNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
