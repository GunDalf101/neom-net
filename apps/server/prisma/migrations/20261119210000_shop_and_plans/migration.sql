-- Shop: structured item data, storefront flags.
ALTER TABLE "ItemDefinition" ADD COLUMN "meta" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "ItemDefinition" ADD COLUMN "forSale" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ItemDefinition" ADD COLUMN "stock" INTEGER;

-- Plans & subscriptions (housing, food, transport, connectivity, antivirus) from the GM economy handbook.
CREATE TABLE "PlanDefinition" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "district" TEXT,
    "monthlyCost" INTEGER NOT NULL DEFAULT 0,
    "purchasePrice" INTEGER NOT NULL DEFAULT 0,
    "effects" JSONB NOT NULL DEFAULT '[]',
    "visibleToPlayers" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CharacterPlan" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanDefinition_campaignId_kind_idx" ON "PlanDefinition"("campaignId", "kind");
CREATE UNIQUE INDEX "CharacterPlan_characterId_planId_key" ON "CharacterPlan"("characterId", "planId");
CREATE INDEX "CharacterPlan_characterId_idx" ON "CharacterPlan"("characterId");

ALTER TABLE "PlanDefinition" ADD CONSTRAINT "PlanDefinition_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterPlan" ADD CONSTRAINT "CharacterPlan_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterPlan" ADD CONSTRAINT "CharacterPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
