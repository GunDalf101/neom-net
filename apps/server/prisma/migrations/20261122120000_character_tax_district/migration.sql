-- Tax district chosen by the player while they have no housing plan. Housing overrides it; NULL means Dogtown.
ALTER TABLE "Character" ADD COLUMN "taxDistrict" TEXT;
