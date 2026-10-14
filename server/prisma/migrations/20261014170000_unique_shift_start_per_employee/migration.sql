-- DropIndex
DROP INDEX "Shift_userId_startsAt_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Shift_userId_startsAt_key" ON "Shift"("userId", "startsAt");
