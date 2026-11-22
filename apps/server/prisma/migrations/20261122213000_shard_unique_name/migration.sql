-- One shard per name in a campaign: makes the boot-time catalog catch-up safe to run concurrently.
-- Dev databases that booted two servers at once may hold doubled rows: keep the oldest of each name.
-- (No-op on a database where the table was just created.)
DELETE FROM "ShardDefinition" a
USING "ShardDefinition" b
WHERE a."campaignId" = b."campaignId"
  AND a."name" = b."name"
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

CREATE UNIQUE INDEX "ShardDefinition_campaignId_name_key" ON "ShardDefinition"("campaignId", "name");
