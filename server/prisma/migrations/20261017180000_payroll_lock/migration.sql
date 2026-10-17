-- AlterTable
ALTER TABLE "Shift" ADD COLUMN "absenceMarkedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PayrollLock" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLock_month_key" ON "PayrollLock"("month");
