-- Campaign encyclopedia: NPCs, locations, items and lore the DM publishes for the crew.
CREATE TABLE "EncyclopediaEntry" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'lore',
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "refId" TEXT,
    "visibleToPlayers" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EncyclopediaEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EncyclopediaEntry_campaignId_kind_idx" ON "EncyclopediaEntry"("campaignId", "kind");

ALTER TABLE "EncyclopediaEntry" ADD CONSTRAINT "EncyclopediaEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
