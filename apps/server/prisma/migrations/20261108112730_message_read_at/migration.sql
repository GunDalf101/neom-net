-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Message_toUserId_readAt_idx" ON "Message"("toUserId", "readAt");

