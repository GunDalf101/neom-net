-- Savings account: whatever balance is left when a session ends is swept here.
ALTER TABLE "Character" ADD COLUMN "savings" INTEGER NOT NULL DEFAULT 0;
