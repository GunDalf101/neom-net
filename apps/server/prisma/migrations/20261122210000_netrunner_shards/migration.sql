-- Netrunner shards (hacks): definitions per campaign, and who can cast them.
ALTER TABLE "Character" ADD COLUMN "isNetrunner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Character" ADD COLUMN "ramMax" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Character" ADD COLUMN "ramUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Character" ADD COLUMN "shardIds" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "ShardDefinition" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "action" TEXT NOT NULL DEFAULT 'Action',
    "range" TEXT NOT NULL DEFAULT '',
    "duration" TEXT NOT NULL DEFAULT '',
    "ramCost" INTEGER NOT NULL DEFAULT 1,
    "effect" TEXT NOT NULL DEFAULT '',
    "equivalent" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "visibleToPlayers" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShardDefinition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShardDefinition_campaignId_idx" ON "ShardDefinition"("campaignId");
ALTER TABLE "ShardDefinition" ADD CONSTRAINT "ShardDefinition_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
