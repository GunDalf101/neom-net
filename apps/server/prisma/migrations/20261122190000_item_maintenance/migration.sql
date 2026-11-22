-- Per-item monthly upkeep, billed with the plans. NULL = default (cyberware by rarity while installed, 0 otherwise).
ALTER TABLE "ItemDefinition" ADD COLUMN "maintenance" INTEGER;
