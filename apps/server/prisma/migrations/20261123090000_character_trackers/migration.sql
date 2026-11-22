-- Custom per-character trackers (e.g. a propaganda bard's followers): DM-defined counters with milestones.
ALTER TABLE "Character" ADD COLUMN "trackers" JSONB NOT NULL DEFAULT '[]';
