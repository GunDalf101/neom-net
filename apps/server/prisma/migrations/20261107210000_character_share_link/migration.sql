-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "shareCreatedAt" TIMESTAMP(3),
ADD COLUMN     "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Character_shareToken_key" ON "Character"("shareToken");
