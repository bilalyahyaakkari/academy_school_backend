import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RosterService } from "../roster/roster.service";
import { serialize } from "../common/serialize";
import type { PaymentUpdateDto, AddPaymentDto } from "../common/schemas";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roster: RosterService,
  ) {}

  /**
   * One row per student who belongs to THIS month, with their invoice embedded.
   *
   * The list is exactly the monthly roster — nothing else. That's what keeps
   * each month's payments separate: a student who left in October is still
   * listed under September, a student who came back in December doesn't
   * retroactively appear in the months they were gone, and removing someone
   * from a month removes them from that month's totals too.
   *
   * A removed student's invoice row is NOT deleted — it just stops being part
   * of this month's page. It remains visible on the Outstanding view, which is
   * the cross-month "who still owes us" screen.
   */
  async listForMonth(year: number, month: number) {
    const rosterIds = await this.roster.studentIdsForMonth(year, month);
    if (rosterIds.length === 0) return [];

    const students = await this.prisma.student.findMany({
      where: { id: { in: rosterIds } },
      orderBy: { fullName: "asc" },
      include: {
        group: { select: { id: true, name: true } },
        payments: { where: { year, month }, take: 1 },
      },
    });

    return serialize(students);
  }

  async history(filter: { from?: string; to?: string; status?: string }) {
    // No archived filter: history is history — a student who has left still
    // shows the months they paid for.
    const where: Record<string, unknown> = {};
    if (filter.status === "PAID" || filter.status === "UNPAID" || filter.status === "PARTIAL") {
      where.status = filter.status;
    }
    if (filter.from || filter.to) {
      where.paymentDate = {
        ...(filter.from ? { gte: new Date(filter.from) } : {}),
        ...(filter.to ? { lte: new Date(filter.to) } : {}),
      };
    }

    const payments = await this.prisma.payment.findMany({
      where,
      orderBy: [{ paymentDate: "desc" }, { year: "desc" }, { month: "desc" }],
      include: { student: { select: { id: true, fullName: true } } },
      take: 500,
    });
    return serialize(payments);
  }

  /**
   * Creates UNPAID rows for every student on this month's roster who doesn't
   * already have one. Idempotent.
   */
  async generateInvoices(year: number, month: number) {
    const settings = await this.prisma.settings.findUnique({ where: { id: "singleton" } });
    const defaultFee = Number(settings?.defaultFee ?? 0);

    // Invoice exactly the students on this month's roster.
    const rosterIds = await this.roster.studentIdsForMonth(year, month);
    if (rosterIds.length === 0) return { created: 0, skipped: 0 };

    const students = await this.prisma.student.findMany({
      where: { id: { in: rosterIds } },
      include: { group: { select: { monthlyFee: true } } },
    });

    const existing = await this.prisma.payment.findMany({
      where: { year, month, studentId: { in: students.map((s) => s.id) } },
      select: { studentId: true },
    });
    const have = new Set(existing.map((e) => e.studentId));

    // Fee precedence: per-student override > group fee > Settings.defaultFee.
    const toCreate = students
      .filter((s) => !have.has(s.id))
      .map((s) => ({
        studentId: s.id,
        year,
        month,
        amount:
          s.monthlyFee != null
            ? Number(s.monthlyFee)
            : s.group
              ? Number(s.group.monthlyFee)
              : defaultFee,
        status: "UNPAID" as const,
      }));

    if (toCreate.length > 0) {
      await this.prisma.payment.createMany({ data: toCreate });
    }
    return { created: toCreate.length, skipped: have.size };
  }

  async markPaid(id: string, method: "CASH" | "BANK_TRANSFER" | "OTHER" = "CASH") {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Payment not found");
    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        status: "PAID",
        paidAmount: p.amount,
        paymentDate: new Date(),
        paymentMethod: method,
      },
    });
    return serialize(updated);
  }

  /**
   * Adds an incremental payment to a Payment row. Status is derived automatically:
   *   newPaid >= total  → PAID
   *   newPaid > 0       → PARTIAL
   *   newPaid == 0      → UNPAID  (rare; shouldn't happen via this endpoint)
   *
   * Caps the new paidAmount at the total (so accidentally entering more than
   * what's owed doesn't create a negative remaining balance).
   */
  async addPayment(id: string, dto: AddPaymentDto) {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Payment not found");

    const total = Number(p.amount);
    const currentPaid = Number(p.paidAmount);
    const newPaid = Math.min(total, currentPaid + dto.amount);

    const status =
      newPaid >= total ? "PAID" : newPaid > 0 ? "PARTIAL" : "UNPAID";

    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        paidAmount: newPaid,
        status,
        paymentDate: new Date(),
        paymentMethod: dto.paymentMethod ?? p.paymentMethod ?? "CASH",
        notes: dto.notes ?? p.notes,
      },
    });
    return serialize(updated);
  }

  async markUnpaid(id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Payment not found");
    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: "UNPAID", paidAmount: 0, paymentDate: null, paymentMethod: null },
    });
    return serialize(updated);
  }

  /**
   * Per-student aggregate of unpaid balances across all months.
   * Used by the "Outstanding" view so admins can see at a glance who owes
   * how much, sorted by largest balance first.
   *
   * Students who have left are included (flagged `archived`) — leaving doesn't
   * settle a debt, and hiding them is how balances used to go missing.
   */
  async outstanding() {
    const unpaid = await this.prisma.payment.findMany({
      where: { status: { in: ["UNPAID", "PARTIAL"] } },
      orderBy: [{ year: "asc" }, { month: "asc" }],
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            isActive: true,
            archived: true,
            group: { select: { id: true, name: true } },
          },
        },
      },
    });

    const byStudent = new Map<string, {
      studentId: string;
      fullName: string;
      phoneNumber: string | null;
      isActive: boolean;
      archived: boolean;
      group: { id: string; name: string } | null;
      unpaidAmount: number;
      unpaidCount: number;
      oldestUnpaid: { month: number; year: number };
    }>();

    for (const p of unpaid) {
      const due = Number(p.amount) - Number(p.paidAmount);
      if (due <= 0) continue;

      const existing = byStudent.get(p.studentId);
      if (existing) {
        existing.unpaidAmount += due;
        existing.unpaidCount += 1;
      } else {
        byStudent.set(p.studentId, {
          studentId: p.studentId,
          fullName: p.student.fullName,
          phoneNumber: p.student.phoneNumber,
          isActive: p.student.isActive,
          archived: p.student.archived,
          group: p.student.group,
          unpaidAmount: due,
          unpaidCount: 1,
          oldestUnpaid: { month: p.month, year: p.year },
        });
      }
    }

    return Array.from(byStudent.values()).sort(
      (a, b) => b.unpaidAmount - a.unpaidAmount,
    );
  }

  async update(id: string, dto: PaymentUpdateDto) {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Payment not found");

    const paidAmount =
      dto.status === "PAID"
        ? Number(p.amount)
        : dto.status === "UNPAID"
          ? 0
          : (dto.paidAmount ?? 0);

    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        status: dto.status,
        paidAmount,
        paymentMethod: dto.status === "UNPAID" ? null : (dto.paymentMethod ?? null),
        paymentDate: dto.status === "UNPAID" ? null : new Date(),
        notes: dto.notes ?? null,
      },
    });
    return serialize(updated);
  }
}
