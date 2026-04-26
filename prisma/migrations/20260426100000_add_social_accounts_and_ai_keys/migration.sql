-- Migration: add_social_accounts_and_ai_keys
--
-- The existing SocialAccount table and Platform enum differ from the Phase 2 spec:
--   - Platform values were uppercase (TWITTER, INSTAGRAM, LINKEDIN, FACEBOOK, TELEGRAM)
--   - SocialAccount had platformId + encryptedToken; Phase 2 uses accessTokenEnc + refreshTokenEnc
-- PostgreSQL cannot rename or remove enum values in-place, so we drop the old enum
-- (after dropping the table that references it) and recreate it with the correct values.

-- Step 1: Drop the Post -> SocialAccount FK so we can drop the SocialAccount table.
ALTER TABLE "Post" DROP CONSTRAINT "Post_socialAccountId_fkey";

-- Step 2: Drop the old SocialAccount table entirely.
DROP TABLE "SocialAccount";

-- Step 3: Replace the Platform enum.
--   PostgreSQL forbids removing enum values from an existing type, so we rename the
--   old type out of the way, create a fresh one, then drop the old one.
ALTER TYPE "Platform" RENAME TO "Platform_old";

CREATE TYPE "Platform" AS ENUM ('twitter', 'linkedin', 'instagram', 'threads');

DROP TYPE "Platform_old";

-- Step 4: Recreate SocialAccount with the Phase 2 column layout.
CREATE TABLE "SocialAccount" (
    "id"              TEXT         NOT NULL,
    "userId"          TEXT         NOT NULL,
    "platform"        "Platform"   NOT NULL,
    "handle"          TEXT,
    "accessTokenEnc"  TEXT         NOT NULL,
    "refreshTokenEnc" TEXT,
    "expiresAt"       TIMESTAMP(3),
    "connectedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialAccount_userId_platform_key" ON "SocialAccount"("userId", "platform");
CREATE INDEX "SocialAccount_userId_idx" ON "SocialAccount"("userId");

ALTER TABLE "SocialAccount"
    ADD CONSTRAINT "SocialAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 5: Restore the Post -> SocialAccount FK.
ALTER TABLE "Post"
    ADD CONSTRAINT "Post_socialAccountId_fkey"
    FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 6: Create AiKey table.
CREATE TABLE "AiKey" (
    "id"              TEXT         NOT NULL,
    "userId"          TEXT         NOT NULL,
    "openaiKeyEnc"    TEXT,
    "anthropicKeyEnc" TEXT,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiKey_userId_key" ON "AiKey"("userId");

ALTER TABLE "AiKey"
    ADD CONSTRAINT "AiKey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
