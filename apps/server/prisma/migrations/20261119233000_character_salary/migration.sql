-- Monthly salary, paid (minus district tax) when the DM turns the month.
ALTER TABLE "Character" ADD COLUMN "salary" INTEGER NOT NULL DEFAULT 3000;
