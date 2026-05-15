/**
 * Add a new admin user (or update an existing one's password).
 *
 * Usage:
 *   tsx scripts/add-admin.ts <email> <password> [name]
 *
 * Examples:
 *   tsx scripts/add-admin.ts maamoun@academy.com 'Maamoun@123'
 *   tsx scripts/add-admin.ts maamoun@academy.com 'Maamoun@123' Maamoun
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [, , emailArg, passwordArg, nameArg] = process.argv;

if (!emailArg || !passwordArg) {
  console.error("Usage: tsx scripts/add-admin.ts <email> <password> [name]");
  process.exit(1);
}

const email = emailArg.toLowerCase();
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash(passwordArg, 10);
  const existing = await prisma.user.findUnique({ where: { email } });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      ...(nameArg ? { name: nameArg } : {}),
    },
    create: {
      email,
      passwordHash,
      name: nameArg ?? "Admin",
    },
  });

  console.log(`✓ Admin ${existing ? "updated" : "created"}: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
