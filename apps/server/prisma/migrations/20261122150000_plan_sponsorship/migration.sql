-- DM sponsorship of a held plan: a discount on the monthly cost (100 = free) and who pays.
ALTER TABLE "CharacterPlan" ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CharacterPlan" ADD COLUMN "sponsor" TEXT;
