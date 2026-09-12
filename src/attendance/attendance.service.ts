import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RosterService } from "../roster/roster.service";
import { serialize } from "../common/serialize";
import type { AttendanceSaveDto, AttendanceSessionDto } from "../common/schemas";

/** "YYYY-MM-DD" (or any ISO string) → UTC midnight, so @db.Date never shifts. */
function toDateOnly(input: string): Date {
  const [y, m, d] = input.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function monthRange(year: number, month: number) {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
}

function ymOf(date: Date) {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/**
 * Attendance checklists. One checklist = one group on one day.
 *
 * Who appears on a checklist comes from the monthly roster (RosterService), not
 * from the group's current members — so re-opening September's checklists still
 * shows September's students even after people have joined or left since.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roster: RosterService,
  ) {}

  /** Students on this group's roster for this month, alphabetical. */
  private async rosterStudents(groupId: string, year: number, month: number) {
    await this.roster.ensureSeeded(year, month);
    const rows = await this.prisma.enrollment.findMany({
      where: { year, month, groupId },
      select: {
        studentId: true,
        student: { select: { id: true, fullName: true, phoneNumber: true } },
      },
    });
    return rows
      .map((r) => r.student)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /** Landing page: one card per group for the chosen month. */
  async overview(year: number, month: number) {
    await this.roster.ensureSeeded(year, month);

    const groups = await this.prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, coachName: true, schedule: true },
    });

    const sessions = await this.prisma.attendanceSession.findMany({
      where: { date: monthRange(year, month) },
      orderBy: { date: "desc" },
      select: {
        id: true,
        groupId: true,
        date: true,
        _count: { select: { records: true } },
        records: { where: { present: true }, select: { id: true } },
      },
    });

    const enrollments = await this.prisma.enrollment.groupBy({
      by: ["groupId"],
      where: { year, month },
      _count: { _all: true },
    });
    const rosterCount = new Map(
      enrollments.map((e) => [e.groupId ?? "", e._count._all]),
    );

    const cards = groups.map((g) => {
      const own = sessions.filter((s) => s.groupId === g.id);
      const totalSlots = own.reduce((n, s) => n + s._count.records, 0);
      const totalPresent = own.reduce((n, s) => n + s.records.length, 0);
      return {
        groupId: g.id,
        groupName: g.name,
        coachName: g.coachName,
        schedule: g.schedule,
        studentCount: rosterCount.get(g.id) ?? 0,
        sessionCount: own.length,
        lastSessionDate: own[0]?.date ?? null,
        attendanceRate: totalSlots > 0 ? Math.round((totalPresent / totalSlots) * 100) : null,
      };
    });

    return serialize({ year, month, groups: cards });
  }

  /**
   * The month grid for one group: every checklist as a column, every student as
   * a row, plus how many times each student showed up this month.
   */
  async monthGrid(groupId: string, year: number, month: number) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, coachName: true, schedule: true },
    });
    if (!group) throw new NotFoundException("Group not found");

    const sessions = await this.prisma.attendanceSession.findMany({
      where: { groupId, date: monthRange(year, month) },
      orderBy: { date: "asc" },
      include: { records: { select: { studentId: true, present: true } } },
    });

    const roster = await this.rosterStudents(groupId, year, month);

    // Include anyone with a record this month even if they've since left the
    // roster — otherwise their attendance would silently vanish from the grid.
    const byId = new Map(roster.map((s) => [s.id, { ...s, onRoster: true }]));
    const strayIds = sessions
      .flatMap((s) => s.records.map((r) => r.studentId))
      .filter((id) => !byId.has(id));
    if (strayIds.length > 0) {
      const strays = await this.prisma.student.findMany({
        where: { id: { in: Array.from(new Set(strayIds)) } },
        select: { id: true, fullName: true, phoneNumber: true },
      });
      for (const s of strays) byId.set(s.id, { ...s, onRoster: false });
    }

    const students = Array.from(byId.values())
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((s) => {
        const cells = sessions.map((sess) => {
          const rec = sess.records.find((r) => r.studentId === s.id);
          return {
            sessionId: sess.id,
            // null = this student wasn't on the checklist that day at all.
            present: rec ? rec.present : null,
          };
        });
        const presentCount = cells.filter((c) => c.present === true).length;
        return {
          studentId: s.id,
          fullName: s.fullName,
          phoneNumber: s.phoneNumber,
          onRoster: s.onRoster,
          presentCount,
          absentCount: cells.filter((c) => c.present === false).length,
          cells,
        };
      });

    return serialize({
      group,
      year,
      month,
      sessions: sessions.map((s) => ({
        id: s.id,
        date: s.date,
        notes: s.notes,
        presentCount: s.records.filter((r) => r.present).length,
        totalCount: s.records.length,
      })),
      students,
      sessionCount: sessions.length,
    });
  }

  /** One checklist, with a row for every student who should be on it. */
  async getSession(id: string) {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id },
      include: {
        group: { select: { id: true, name: true, coachName: true } },
        records: { select: { studentId: true, present: true } },
      },
    });
    if (!session) throw new NotFoundException("Checklist not found");

    const { year, month } = ymOf(session.date);
    const roster = await this.rosterStudents(session.groupId, year, month);

    const presentBy = new Map(session.records.map((r) => [r.studentId, r.present]));
    const byId = new Map(roster.map((s) => [s.id, s]));

    // Students with a record but no longer on the roster still show, so their
    // mark can be seen (and corrected) rather than being orphaned.
    const strayIds = session.records
      .map((r) => r.studentId)
      .filter((sid) => !byId.has(sid));
    if (strayIds.length > 0) {
      const strays = await this.prisma.student.findMany({
        where: { id: { in: strayIds } },
        select: { id: true, fullName: true, phoneNumber: true },
      });
      for (const s of strays) byId.set(s.id, s);
    }

    const students = Array.from(byId.values())
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((s) => ({
        studentId: s.id,
        fullName: s.fullName,
        phoneNumber: s.phoneNumber,
        present: presentBy.get(s.id) ?? false,
      }));

    return serialize({
      id: session.id,
      groupId: session.groupId,
      group: session.group,
      date: session.date,
      notes: session.notes,
      year,
      month,
      students,
      presentCount: students.filter((s) => s.present).length,
      // A checklist with zero saved records has never been filled in.
      isNew: session.records.length === 0,
    });
  }

  /**
   * Opens the checklist for a group on a day. One per group per day: asking
   * twice returns the same one instead of creating a duplicate.
   *
   * Everyone starts unchecked — you tick the students who showed up.
   */
  async createSession(dto: AttendanceSessionDto) {
    const date = toDateOnly(dto.date);
    const group = await this.prisma.group.findUnique({
      where: { id: dto.groupId },
      select: { id: true },
    });
    if (!group) throw new NotFoundException("Group not found");

    const existing = await this.prisma.attendanceSession.findUnique({
      where: { groupId_date: { groupId: dto.groupId, date } },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };

    const session = await this.prisma.attendanceSession.create({
      data: { groupId: dto.groupId, date, notes: dto.notes ?? null },
    });
    return { id: session.id, created: true };
  }

  /** Saves the ticked boxes. Records are upserted so re-saving just corrects. */
  async saveSession(id: string, dto: AttendanceSaveDto) {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!session) throw new NotFoundException("Checklist not found");

    await this.prisma.$transaction([
      ...dto.records.map((r) =>
        this.prisma.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId: id, studentId: r.studentId } },
          create: { sessionId: id, studentId: r.studentId, present: r.present },
          update: { present: r.present },
        }),
      ),
      this.prisma.attendanceSession.update({
        where: { id },
        data: { notes: dto.notes ?? null },
      }),
    ]);

    return {
      saved: dto.records.length,
      presentCount: dto.records.filter((r) => r.present).length,
    };
  }

  async deleteSession(id: string) {
    await this.prisma.attendanceSession.delete({ where: { id } });
    return { success: true };
  }

  /** Per-student attendance for a month across every group. */
  async studentMonth(studentId: string, year: number, month: number) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: { studentId, session: { date: monthRange(year, month) } },
      include: {
        session: {
          select: { id: true, date: true, group: { select: { id: true, name: true } } },
        },
      },
      orderBy: { session: { date: "asc" } },
    });

    return serialize({
      year,
      month,
      sessions: records.map((r) => ({
        sessionId: r.session.id,
        date: r.session.date,
        group: r.session.group,
        present: r.present,
      })),
      presentCount: records.filter((r) => r.present).length,
      totalCount: records.length,
    });
  }
}
