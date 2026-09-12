import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { serialize } from "../common/serialize";

/** A year+month pair collapsed to a single sortable integer. */
function ordinal(year: number, month: number) {
  return year * 12 + (month - 1);
}

export function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * The monthly roster — "who was in the academy during month X".
 *
 * Every month-scoped screen (payments, attendance) reads from here instead of
 * `Student.isActive`, which is what used to make an archived student vanish from
 * months they had already been part of.
 *
 * Rows appear one of three ways:
 *   1. carried forward automatically from the previous month (`ensureSeeded`),
 *   2. added by hand when someone joins or comes back,
 *   3. created alongside a new student (`enrollCurrentMonth`).
 */
@Injectable()
export class RosterService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fills an empty month by copying the most recent earlier month that has a
   * roster, skipping students who have since been archived (i.e. left).
   *
   * No-op when the month already has rows — so it is safe to call on every read,
   * and editing a month by hand is never undone by a later visit.
   *
   * Future months beyond "next month" are left alone: browsing ahead to
   * December shouldn't silently commit a roster for it.
   */
  async ensureSeeded(year: number, month: number): Promise<number> {
    const existing = await this.prisma.enrollment.count({ where: { year, month } });
    if (existing > 0) return 0;

    const cur = currentMonth();
    if (ordinal(year, month) > ordinal(cur.year, cur.month) + 1) return 0;

    const source = await this.latestMonthBefore(year, month);
    if (!source) return 0;

    const previous = await this.prisma.enrollment.findMany({
      where: { year: source.year, month: source.month },
      select: { studentId: true, student: { select: { archived: true, groupId: true } } },
    });

    const toCreate = previous
      .filter((e) => !e.student.archived)
      .map((e) => ({
        studentId: e.studentId,
        year,
        month,
        groupId: e.student.groupId,
      }));

    if (toCreate.length === 0) return 0;

    const res = await this.prisma.enrollment.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
    return res.count;
  }

  /** Most recent month strictly before (year, month) that has any roster rows. */
  private async latestMonthBefore(year: number, month: number) {
    const months = await this.prisma.enrollment.groupBy({
      by: ["year", "month"],
      _count: { _all: true },
    });
    const target = ordinal(year, month);
    const earlier = months
      .filter((m) => ordinal(m.year, m.month) < target)
      .sort((a, b) => ordinal(b.year, b.month) - ordinal(a.year, a.month));
    return earlier[0] ?? null;
  }

  /** Student ids enrolled in a month. Seeds the month first if it's empty. */
  async studentIdsForMonth(year: number, month: number): Promise<string[]> {
    await this.ensureSeeded(year, month);
    const rows = await this.prisma.enrollment.findMany({
      where: { year, month },
      select: { studentId: true },
    });
    return rows.map((r) => r.studentId);
  }

  /**
   * The roster screen: every student in this month with their group, their
   * invoice for the month, and how many sessions they attended.
   */
  async getMonth(year: number, month: number) {
    const seeded = await this.ensureSeeded(year, month);

    const rows = await this.prisma.enrollment.findMany({
      where: { year, month },
      include: {
        group: { select: { id: true, name: true } },
        student: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            isActive: true,
            archived: true,
            groupId: true,
            group: { select: { id: true, name: true } },
          },
        },
      },
    });

    const studentIds = rows.map((r) => r.studentId);

    const payments = await this.prisma.payment.findMany({
      where: { year, month, studentId: { in: studentIds } },
      select: { id: true, studentId: true, amount: true, paidAmount: true, status: true },
    });
    const paymentBy = new Map(payments.map((p) => [p.studentId, p]));

    // Was each student also here last month? Lets the UI flag "new this month".
    const prevOrd = ordinal(year, month) - 1;
    const prevYear = Math.floor(prevOrd / 12);
    const prevMonth = (prevOrd % 12) + 1;
    const prev = await this.prisma.enrollment.findMany({
      where: { year: prevYear, month: prevMonth, studentId: { in: studentIds } },
      select: { studentId: true },
    });
    const wasHereLastMonth = new Set(prev.map((p) => p.studentId));

    const students = rows
      .map((r) => ({
        enrollmentId: r.id,
        studentId: r.studentId,
        fullName: r.student.fullName,
        phoneNumber: r.student.phoneNumber,
        isActive: r.student.isActive,
        archived: r.student.archived,
        // Group as of this month, falling back to the student's current group.
        group: r.group ?? r.student.group,
        isNew: !wasHereLastMonth.has(r.studentId),
        payment: paymentBy.get(r.studentId) ?? null,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    // Which students left compared to last month (were there, aren't now).
    const prevAll = await this.prisma.enrollment.findMany({
      where: { year: prevYear, month: prevMonth },
      select: { studentId: true, student: { select: { fullName: true } } },
    });
    const here = new Set(studentIds);
    const left = prevAll
      .filter((p) => !here.has(p.studentId))
      .map((p) => ({ studentId: p.studentId, fullName: p.student.fullName }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    return serialize({
      year,
      month,
      seeded,
      previous: { year: prevYear, month: prevMonth },
      students,
      newCount: students.filter((s) => s.isNew).length,
      leftCount: left.length,
      left,
    });
  }

  /** Students who could be added to this month (everyone not already in it). */
  async available(year: number, month: number) {
    const enrolled = await this.prisma.enrollment.findMany({
      where: { year, month },
      select: { studentId: true },
    });
    const ids = enrolled.map((e) => e.studentId);

    const students = await this.prisma.student.findMany({
      where: { id: { notIn: ids.length > 0 ? ids : ["-"] } },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        archived: true,
        group: { select: { id: true, name: true } },
      },
    });
    return serialize(students);
  }

  /**
   * Adds students to a month. Un-archives anyone who is coming back, since
   * being on a month's roster and being "gone" are contradictory.
   */
  async add(year: number, month: number, studentIds: string[]) {
    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, groupId: true, archived: true },
    });
    if (students.length === 0) throw new NotFoundException("No such students");

    const cur = currentMonth();
    const isFuture = ordinal(year, month) >= ordinal(cur.year, cur.month);

    const res = await this.prisma.enrollment.createMany({
      data: students.map((s) => ({
        studentId: s.id,
        year,
        month,
        groupId: s.groupId,
      })),
      skipDuplicates: true,
    });

    // Re-adding someone to the current (or a future) month means they're back.
    const returning = students.filter((s) => s.archived).map((s) => s.id);
    if (isFuture && returning.length > 0) {
      await this.prisma.student.updateMany({
        where: { id: { in: returning } },
        data: { archived: false, archivedAt: null, isActive: true },
      });
    }

    return { added: res.count, restored: isFuture ? returning.length : 0 };
  }

  /**
   * Removes a student from one month. Their invoice for that month is kept on
   * purpose — money already recorded shouldn't disappear because someone left.
   */
  async remove(year: number, month: number, studentId: string) {
    await this.prisma.enrollment.deleteMany({ where: { year, month, studentId } });

    const payment = await this.prisma.payment.findUnique({
      where: { studentId_month_year: { studentId, month, year } },
      select: { id: true, amount: true, paidAmount: true, status: true },
    });

    return serialize({
      removed: true,
      keptPayment: payment,
    });
  }

  /**
   * Removes a student from this month and every month after it — the "they left"
   * button. Past months are untouched.
   */
  async removeFrom(year: number, month: number, studentId: string) {
    const from = ordinal(year, month);
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId },
      select: { id: true, year: true, month: true },
    });
    const ids = rows.filter((r) => ordinal(r.year, r.month) >= from).map((r) => r.id);
    if (ids.length > 0) {
      await this.prisma.enrollment.deleteMany({ where: { id: { in: ids } } });
    }
    await this.prisma.student.update({
      where: { id: studentId },
      data: { archived: true, archivedAt: new Date(), isActive: false },
    });
    return { removedMonths: ids.length };
  }

  /** Months that have a roster, newest first, with headcounts. */
  async months() {
    const grouped = await this.prisma.enrollment.groupBy({
      by: ["year", "month"],
      _count: { _all: true },
    });
    return grouped
      .map((g) => ({ year: g.year, month: g.month, count: g._count._all }))
      .sort((a, b) => ordinal(b.year, b.month) - ordinal(a.year, a.month));
  }

  // ---------- hooks used by StudentsService ----------

  /** New student → they're part of the current month from day one. */
  async enrollCurrentMonth(studentId: string, groupId: string | null) {
    const { year, month } = currentMonth();
    await this.prisma.enrollment.createMany({
      data: [{ studentId, year, month, groupId }],
      skipDuplicates: true,
    });
  }

  /**
   * Student moved to another group → update the snapshot on the current and
   * future months only, so past checklists still show the group they were in.
   */
  async syncGroupSnapshot(studentId: string, groupId: string | null) {
    const { year, month } = currentMonth();
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId },
      select: { id: true, year: true, month: true },
    });
    const from = ordinal(year, month);
    const ids = rows.filter((r) => ordinal(r.year, r.month) >= from).map((r) => r.id);
    if (ids.length > 0) {
      await this.prisma.enrollment.updateMany({ where: { id: { in: ids } }, data: { groupId } });
    }
  }

  /**
   * Archiving = they left. Drop them from months AFTER the current one; the
   * current month and all history stay, because they did train those months.
   */
  async dropFutureMonths(studentId: string) {
    const { year, month } = currentMonth();
    const from = ordinal(year, month);
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId },
      select: { id: true, year: true, month: true },
    });
    const ids = rows.filter((r) => ordinal(r.year, r.month) > from).map((r) => r.id);
    if (ids.length > 0) {
      await this.prisma.enrollment.deleteMany({ where: { id: { in: ids } } });
    }
    return ids.length;
  }
}
