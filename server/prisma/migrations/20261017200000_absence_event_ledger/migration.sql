-- CreateEnum
CREATE TYPE "AbsenceEventKind" AS ENUM ('ABSENCE', 'COVERAGE');

-- CreateTable
CREATE TABLE "AbsenceEvent" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "AbsenceEventKind" NOT NULL,
    "absenceType" "AbsenceType" NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "shiftDate" TIMESTAMP(3) NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbsenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AbsenceEvent_shiftId_idx" ON "AbsenceEvent"("shiftId");

-- CreateIndex
CREATE INDEX "AbsenceEvent_employeeId_shiftDate_idx" ON "AbsenceEvent"("employeeId", "shiftDate");

-- AddForeignKey
ALTER TABLE "AbsenceEvent" ADD CONSTRAINT "AbsenceEvent_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceEvent" ADD CONSTRAINT "AbsenceEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: reconstruct ABSENCE events for every shift that currently has an
-- unresolved (still open or claimed-but-never-re-marked) absence tag, so
-- existing test data doesn't lose its adjustment history.
INSERT INTO "AbsenceEvent" ("id", "shiftId", "employeeId", "kind", "absenceType", "hours", "shiftDate", "markedAt")
SELECT
  gen_random_uuid()::text,
  "id",
  "absenceUserId",
  'ABSENCE',
  "absenceType",
  EXTRACT(EPOCH FROM ("endsAt" - "startsAt")) / 3600.0,
  "startsAt",
  COALESCE("absenceMarkedAt", "createdAt")
FROM "Shift"
WHERE "absenceType" IS NOT NULL AND "absenceUserId" IS NOT NULL;

-- Backfill: reconstruct COVERAGE events for every currently-claimed shift
-- that's still tagged with an absence (userId set, absenceUserId different).
INSERT INTO "AbsenceEvent" ("id", "shiftId", "employeeId", "kind", "absenceType", "hours", "shiftDate", "markedAt")
SELECT
  gen_random_uuid()::text,
  "id",
  "userId",
  'COVERAGE',
  "absenceType",
  EXTRACT(EPOCH FROM ("endsAt" - "startsAt")) / 3600.0,
  "startsAt",
  COALESCE("absenceMarkedAt", "createdAt")
FROM "Shift"
WHERE "absenceType" IS NOT NULL AND "userId" IS NOT NULL AND "userId" != "absenceUserId";
