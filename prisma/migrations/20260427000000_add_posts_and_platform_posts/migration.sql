-- Phase 4: Replace the old Post table with Post + PlatformPost design.

-- Step 1: Drop old Post table.
DROP TABLE IF EXISTS "Post" CASCADE;

-- Step 2: Replace PostStatus enum (can't remove values in-place in Postgres).
ALTER TYPE "PostStatus" RENAME TO "PostStatus_old";
CREATE TYPE "PostStatus" AS ENUM ('queued', 'processing', 'published', 'failed', 'cancelled');
DROP TYPE "PostStatus_old";

-- Step 3: New enums.
CREATE TYPE "PostType" AS ENUM ('announcement', 'thread', 'story', 'promotional', 'educational', 'opinion');
CREATE TYPE "JobStatus" AS ENUM ('queued', 'processing', 'published', 'failed', 'cancelled');

-- Step 4: New Post table.
CREATE TABLE "Post" (
    "id"        TEXT          NOT NULL,
    "userId"    TEXT          NOT NULL,
    "idea"      VARCHAR(500)  NOT NULL,
    "postType"  "PostType"    NOT NULL,
    "tone"      "Tone"        NOT NULL,
    "language"  TEXT          NOT NULL,
    "modelUsed" TEXT          NOT NULL,
    "publishAt" TIMESTAMP(3),
    "status"    "PostStatus"  NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Post_userId_createdAt_idx" ON "Post"("userId", "createdAt");
CREATE INDEX "Post_status_idx"           ON "Post"("status");

ALTER TABLE "Post"
    ADD CONSTRAINT "Post_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 5: PlatformPost table.
CREATE TABLE "PlatformPost" (
    "id"           TEXT         NOT NULL,
    "postId"       TEXT         NOT NULL,
    "platform"     "Platform"   NOT NULL,
    "content"      TEXT         NOT NULL,
    "status"       "JobStatus"  NOT NULL DEFAULT 'queued',
    "publishedAt"  TIMESTAMP(3),
    "errorMessage" TEXT,
    "attempts"     INTEGER      NOT NULL DEFAULT 0,
    "externalId"   TEXT,
    CONSTRAINT "PlatformPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformPost_postId_platform_key" ON "PlatformPost"("postId", "platform");
CREATE INDEX        "PlatformPost_status_idx"          ON "PlatformPost"("status");

ALTER TABLE "PlatformPost"
    ADD CONSTRAINT "PlatformPost_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
