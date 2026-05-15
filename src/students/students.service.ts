import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { serialize } from "../common/serialize";
import type { StudentDto, ImportStudentsDto, BulkDeleteDto } from "../common/schemas";
import type { Prisma } from "@prisma/client";

export type ListStudentsFilter = {
  q?: string;
  groupId?: string | "none";
  status?: "active" | "inactive";
};

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ListStudentsFilter) {
    const where: Prisma.StudentWhereInput = {};
    if (filter.q) where.fullName = { contains: filter.q, mode: "insensitive" };
    if (filter.groupId === "none") where.groupId = null;
    else if (filter.groupId) where.groupId = filter.groupId;
    if (filter.status === "active") where.isActive = true;
    if (filter.status === "inactive") where.isActive = false;

    const students = await this.prisma.student.findMany({
      where,
      orderBy: { fullName: "asc" },
      include: { group: { select: { id: true, name: true } } },
    });
    return serialize(students);
  }

  async findOne(id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        group: true,
        payments: { orderBy: [{ year: "desc" }, { month: "desc" }] },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    return serialize(student);
  }

  async create(dto: StudentDto) {
    const student = await this.prisma.student.create({
      data: {
        fullName: dto.fullName,
        dateOfBirth: new Date(dto.dateOfBirth),
        address: dto.address ?? null,
        school: dto.school ?? null,
        phoneNumber: dto.phoneNumber ?? null,
        groupId: dto.groupId ?? null,
        isActive: dto.isActive,
        monthlyFee: dto.monthlyFee ?? null,
        notes: dto.notes ?? null,
      },
    });
    return serialize(student);
  }

  async update(id: string, dto: StudentDto) {
    await this.assertExists(id);
    const student = await this.prisma.student.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        dateOfBirth: new Date(dto.dateOfBirth),
        address: dto.address ?? null,
        school: dto.school ?? null,
        phoneNumber: dto.phoneNumber ?? null,
        groupId: dto.groupId ?? null,
        isActive: dto.isActive,
        monthlyFee: dto.monthlyFee ?? null,
        notes: dto.notes ?? null,
      },
    });
    return serialize(student);
  }

  async toggleActive(id: string) {
    const cur = await this.prisma.student.findUnique({
      where: { id },
      select: { isActive: true },
    });
    if (!cur) throw new NotFoundException("Student not found");
    const updated = await this.prisma.student.update({
      where: { id },
      data: { isActive: !cur.isActive },
    });
    return serialize(updated);
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.student.delete({ where: { id } });
    return { success: true };
  }

  async bulkDelete(dto: BulkDeleteDto) {
    // Cascade on Payment.studentId removes their payment history too.
    const result = await this.prisma.student.deleteMany({
      where: { id: { in: dto.ids } },
    });
    return { deleted: result.count };
  }

  /**
   * Bulk-import students. Each row is created independently inside the same
   * transaction so a single bad row doesn't roll back the whole batch — the
   * frontend then surfaces per-row errors.
   */
  async importMany(dto: ImportStudentsDto) {
    const created: { row: number; id: string; fullName: string }[] = [];
    const errors: { row: number; fullName: string; error: string }[] = [];

    // Validate group IDs upfront so we don't make N round-trips.
    const groupIds = Array.from(
      new Set(dto.students.map((s) => s.groupId).filter((g): g is string => !!g)),
    );
    const validGroupIds = new Set(
      (
        await this.prisma.group.findMany({
          where: { id: { in: groupIds } },
          select: { id: true },
        })
      ).map((g) => g.id),
    );

    for (let i = 0; i < dto.students.length; i++) {
      const s = dto.students[i];
      try {
        if (s.groupId && !validGroupIds.has(s.groupId)) {
          throw new Error(`Group not found`);
        }
        const student = await this.prisma.student.create({
          data: {
            fullName: s.fullName,
            dateOfBirth: new Date(s.dateOfBirth),
            address: s.address ?? null,
            school: s.school ?? null,
            phoneNumber: s.phoneNumber ?? null,
            groupId: s.groupId ?? null,
            isActive: s.isActive,
            monthlyFee: s.monthlyFee ?? null,
            notes: s.notes ?? null,
          },
        });
        created.push({ row: i + 2, id: student.id, fullName: student.fullName });
      } catch (e) {
        errors.push({
          row: i + 2, // +2 = 1-indexed + header row
          fullName: s.fullName,
          error: e instanceof Error ? e.message : "Failed to create",
        });
      }
    }

    return { created: created.length, failed: errors.length, errors };
  }

  private async assertExists(id: string) {
    const exists = await this.prisma.student.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Student not found");
  }
}
