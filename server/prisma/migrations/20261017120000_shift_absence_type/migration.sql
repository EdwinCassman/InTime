-- CreateEnum
CREATE TYPE "AbsenceType" AS ENUM ('SICK', 'VAB', 'UNPAID_LEAVE', 'VACATION');

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN "absenceType" "AbsenceType";
