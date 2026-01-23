/*
  Warnings:

  - You are about to drop the column `videoId` on the `Vote` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,contentId,timeBucket]` on the table `Vote` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `contentId` to the `Vote` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Vote_userId_videoId_timeBucket_key";

-- DropIndex
DROP INDEX "Vote_videoId_timeBucket_idx";

-- AlterTable
ALTER TABLE "Vote" DROP COLUMN "videoId",
ADD COLUMN     "contentId" TEXT NOT NULL,
ADD COLUMN     "pageHost" TEXT,
ADD COLUMN     "pageUrl" TEXT;

-- CreateIndex
CREATE INDEX "Vote_contentId_timeBucket_idx" ON "Vote"("contentId", "timeBucket");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_userId_contentId_timeBucket_key" ON "Vote"("userId", "contentId", "timeBucket");
