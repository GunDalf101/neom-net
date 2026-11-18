-- Mission kinds: main (cannot be refused), secondary (optional), personal (assigned character only, cannot be refused).
ALTER TABLE "Mission" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'main';
