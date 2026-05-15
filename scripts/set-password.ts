/**
 * One-off password reset for an existing admin user.
 *
 * Usage:
 *   tsx scripts/set-password.ts <email> <new-password>
 *
 * Example:
 *   tsx scripts/set-password.ts bilal@academy.com 'Bilal@1234'
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [, , emailArg, passwordArg] = process.argv;

if (!emailArg || !passwordArg) {
  console.error("Usage: tsx scripts/set-password.ts <email> <new-password>");
  process.exit(1);
}

const email = emailArg.toLowerCase();
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email "${email}"`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(passwordArg, 10);
  await prisma.user.update({
    where: { email },
    data: { passwordHash },
  });

  console.log(`✓ Password updated for ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
