-- RAM is the spell level: netrunners cast from slots per level (5e), not from one pool.
ALTER TABLE "Character" ADD COLUMN "shardSlots" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Character" ADD COLUMN "shardSlotsUsed" JSONB NOT NULL DEFAULT '{}';
-- The single RAM pool shipped a few hours earlier and is replaced by the slots above.
ALTER TABLE "Character" DROP COLUMN "ramMax";
ALTER TABLE "Character" DROP COLUMN "ramUsed";
