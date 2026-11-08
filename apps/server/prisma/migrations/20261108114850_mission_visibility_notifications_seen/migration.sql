-- AlterTable
ALTER TABLE "CampaignMembership" ADD COLUMN     "notificationsSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Mission" ADD COLUMN     "assignedOnly" BOOLEAN NOT NULL DEFAULT false;

