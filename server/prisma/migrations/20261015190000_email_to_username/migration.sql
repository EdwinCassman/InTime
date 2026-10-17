-- Replace email-based login with a simple username.
-- Backfills username from the part of the email before '@', lowercased, and
-- de-duplicates automatically if that ever collides (defensive — not expected
-- with this team's real data, but the migration must not fail either way).

ALTER TABLE "User" ADD COLUMN "username" TEXT;

UPDATE "User" SET "username" = lower(split_part("email", '@', 1));

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "username" ORDER BY "createdAt") AS rn
  FROM "User"
)
UPDATE "User" u
SET "username" = u."username" || ranked.rn::text
FROM ranked
WHERE u."id" = ranked."id" AND ranked.rn > 1;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

DROP INDEX IF EXISTS "User_email_key";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

ALTER TABLE "User" DROP COLUMN "email";
