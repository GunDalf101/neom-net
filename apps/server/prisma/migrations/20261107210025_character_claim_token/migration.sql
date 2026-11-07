-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "claimCreatedAt" TIMESTAMP(3),
ADD COLUMN     "claimToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Character_claimToken_key" ON "Character"("claimToken");

