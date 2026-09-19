/**
 * Deletes invoices that belong to a month the student is not enrolled in.
 *
 * Removing a student from a month now discards their empty invoice with them
 * (see RosterService.discardEmptyInvoices), but rows created before that rule
 * existed are still sitting in the database, silently inflating the Outstanding
 * total. This prunes them.
 *
 * Invoices with any money recorded against them are never touched.
 *
 *   npx tsx scripts/prune-orphan-invoices.ts          # dry run, prints what it would do
 *   npx tsx scripts/prune-orphan-invoices.ts --apply  # actually deletes
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const [payments, enrollments] = await Promise.all([
    prisma.payment.findMany({
      select: {
        id: true,
        studentId: true,
        year: true,
        month: true,
        amount: true,
        paidAmount: true,
        status: true,
        student: { select: { fullName: true } },
      },
    }),
    prisma.enrollment.findMany({ select: { studentId: true, year: true, month: true } }),
  ]);

  const key = (x: { studentId: string; year: number; month: number }) =>
    `${x.studentId}|${x.year}|${x.month}`;
  const enrolled = new Set(enrollments.map(key));

  const orphans = payments.filter((p) => !enrolled.has(key(p)));
  const empty = orphans.filter((p) => Number(p.paidAmount) <= 0);
  const paid = orphans.filter((p) => Number(p.paidAmount) > 0);

  const owed = empty.reduce((n, p) => n + (Number(p.amount) - Number(p.paidAmount)), 0);

  console.log(`Invoices total            : ${payments.length}`);
  console.log(`For a month not enrolled  : ${orphans.length}`);
  console.log(`  ...with nothing paid    : ${empty.length}  (removes $${owed.toFixed(2)} of phantom debt)`);
  console.log(`  ...with money recorded  : ${paid.length}  (kept, never touched)`);

  const byMonth = new Map<string, number>();
  for (const p of empty) {
    const k = `${p.year}-${String(p.month).padStart(2, "0")}`;
    byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
  }
  for (const [m, n] of [...byMonth].sort()) console.log(`     ${m}: ${n}`);

  if (paid.length > 0) {
    console.log("\nKept (money already recorded):");
    for (const p of paid) {
      console.log(
        `  ${p.student.fullName} ${p.year}-${String(p.month).padStart(2, "0")}: $${Number(p.paidAmount)} of $${Number(p.amount)}`,
      );
    }
  }

  if (!apply) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --apply to delete.");
    return;
  }

  if (empty.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  const res = await prisma.payment.deleteMany({
    where: { id: { in: empty.map((p) => p.id) } },
  });
  console.log(`\nDeleted ${res.count} invoice(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
