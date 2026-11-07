/**
 * Creates or resets a user account and (optionally) joins it to a campaign by invite code.
 *
 *   npm run user:create -- <email> <password> [username] [inviteCode]
 *
 * The username defaults to the part of the email before "@" (sanitized).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const [email, password, usernameArg, inviteCode] = process.argv.slice(2);

if (!email || !password) {
  console.error("usage: npm run user:create -- <email> <password> [username] [inviteCode]");
  process.exit(2);
}

const username = (usernameArg ?? email.split("@")[0] ?? "user").replace(/[^a-zA-Z0-9_\-.]/g, "").slice(0, 32) || "user";

const user = await prisma.user.upsert({
  where: { email: email.toLowerCase() },
  create: { email: email.toLowerCase(), username, passwordHash: await bcrypt.hash(password, 12) },
  update: { passwordHash: await bcrypt.hash(password, 12) },
});
console.log(`User ready: ${user.email} (handle: ${user.username})`);

if (inviteCode) {
  const campaign = await prisma.campaign.findUnique({ where: { inviteCode: inviteCode.toUpperCase() } });
  if (!campaign) console.error(`No campaign with invite code ${inviteCode}`);
  else {
    await prisma.campaignMembership.upsert({
      where: { campaignId_userId: { campaignId: campaign.id, userId: user.id } },
      create: { campaignId: campaign.id, userId: user.id, role: "PLAYER" },
      update: {},
    });
    console.log(`Joined "${campaign.name}" as PLAYER`);
  }
}
await prisma.$disconnect();
