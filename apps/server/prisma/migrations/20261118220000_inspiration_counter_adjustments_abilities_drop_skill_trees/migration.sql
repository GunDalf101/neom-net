-- Inspiration becomes a stackable counter: a banked inspiration survives as 1.
ALTER TABLE "Character" ALTER COLUMN "inspiration" DROP DEFAULT;
ALTER TABLE "Character" ALTER COLUMN "inspiration" TYPE INTEGER USING (CASE WHEN "inspiration" THEN 1 ELSE 0 END);
ALTER TABLE "Character" ALTER COLUMN "inspiration" SET DEFAULT 0;

-- Flat DM adjustments per stat target, and abilities granted directly by the DM.
ALTER TABLE "Character" ADD COLUMN "adjustments" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Character" ADD COLUMN "abilityIds" JSONB NOT NULL DEFAULT '[]';

-- Skill trees are removed from the game.
DROP TABLE "CharacterUnlock";
DROP TABLE "SkillTreeNode";
DROP TABLE "SkillTreeDefinition";
