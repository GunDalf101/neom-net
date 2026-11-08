-- AlterTable
ALTER TABLE "MissionAssignment" ADD COLUMN     "note" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "response" TEXT NOT NULL DEFAULT 'pending';

