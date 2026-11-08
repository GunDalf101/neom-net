-- CreateTable
CREATE TABLE "Faction" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'cyan',
    "icon" TEXT NOT NULL DEFAULT 'users',
    "isCity" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Faction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reputation" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reputation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Faction_campaignId_sortOrder_idx" ON "Faction"("campaignId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Faction_campaignId_key_key" ON "Faction"("campaignId", "key");

-- CreateIndex
CREATE INDEX "Reputation_campaignId_idx" ON "Reputation"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Reputation_characterId_factionId_key" ON "Reputation"("characterId", "factionId");

-- AddForeignKey
ALTER TABLE "Faction" ADD CONSTRAINT "Faction_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reputation" ADD CONSTRAINT "Reputation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reputation" ADD CONSTRAINT "Reputation_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reputation" ADD CONSTRAINT "Reputation_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "Faction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

