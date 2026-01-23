-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('NONE', 'FETCHED', 'FAILED');

-- CreateTable
CREATE TABLE "Content" (
    "contentId" TEXT NOT NULL,
    "source" TEXT,
    "title" TEXT,
    "channelName" TEXT,
    "pageUrl" TEXT,
    "pageHost" TEXT,
    "captionBaseUrl" TEXT,
    "captionLanguage" TEXT,
    "captionIsAuto" BOOLEAN,
    "transcriptStatus" "TranscriptStatus" NOT NULL DEFAULT 'NONE',
    "transcriptFetchedAt" TIMESTAMP(3),
    "transcriptError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("contentId")
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "start" INTEGER NOT NULL,
    "dur" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranscriptSegment_contentId_start_idx" ON "TranscriptSegment"("contentId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptSegment_contentId_start_key" ON "TranscriptSegment"("contentId", "start");

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("contentId") ON DELETE CASCADE ON UPDATE CASCADE;
