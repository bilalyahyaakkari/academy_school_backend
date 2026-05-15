import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { serialize } from "../common/serialize";
import type { UniformDto, ImportUniformsDto } from "../common/schemas";

@Injectable()
export class UniformsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: { isPaid?: boolean }) {
    const uniforms = await this.prisma.uniform.findMany({
      where: filter.isPaid !== undefined ? { isPaid: filter.isPaid } : undefined,
      orderBy: [{ isPaid: "asc" }, { orderedAt: "desc" }],
      include: {
        student: {
          select: { id: true, fullName: true, phoneNumber: true },
        },
      },
    });
    return serialize(uniforms);
  }

  async create(dto: UniformDto) {
    const u = await this.prisma.uniform.create({
      data: {
        studentId: dto.studentId,
        size: dto.size,
        price: dto.price,
        isPaid: dto.isPaid,
        paidAt: dto.isPaid ? new Date() : null,
        notes: dto.notes ?? null,
      },
    });
    return serialize(u);
  }

  async update(id: string, dto: UniformDto) {
    const cur = await this.prisma.uniform.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException("Uniform order not found");
    const u = await this.prisma.uniform.update({
      where: { id },
      data: {
        studentId: dto.studentId,
        size: dto.size,
        price: dto.price,
        isPaid: dto.isPaid,
        // Stamp paidAt when transitioning unpaid → paid; clear it when transitioning back.
        paidAt: dto.isPaid
          ? cur.isPaid
            ? cur.paidAt
            : new Date()
          : null,
        notes: dto.notes ?? null,
      },
    });
    return serialize(u);
  }

  async togglePaid(id: string) {
    const cur = await this.prisma.uniform.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException("Uniform order not found");
    const u = await this.prisma.uniform.update({
      where: { id },
      data: {
        isPaid: !cur.isPaid,
        paidAt: !cur.isPaid ? new Date() : null,
      },
    });
    return serialize(u);
  }

  /**
   * Bulk-import uniform orders. Each row is created independently so a single
   * bad row doesn't roll back the whole batch — the frontend surfaces per-row
   * errors.
   */
  async importMany(dto: ImportUniformsDto) {
    const created: { row: number; id: string }[] = [];
    const errors: { row: number; studentId: string; error: string }[] = [];

    // Validate studentIds upfront so we don't make N round-trips.
    const studentIds = Array.from(new Set(dto.uniforms.map((u) => u.studentId)));
    const validStudentIds = new Set(
      (
        await this.prisma.student.findMany({
          where: { id: { in: studentIds } },
          select: { id: true },
        })
      ).map((s) => s.id),
    );

    for (let i = 0; i < dto.uniforms.length; i++) {
      const u = dto.uniforms[i];
      try {
        if (!validStudentIds.has(u.studentId)) {
          throw new Error(`Student not found`);
        }
        const created_ = await this.prisma.uniform.create({
          data: {
            studentId: u.studentId,
            size: u.size,
            price: u.price,
            isPaid: u.isPaid,
            paidAt: u.isPaid ? new Date() : null,
            notes: u.notes ?? null,
          },
        });
        created.push({ row: i + 2, id: created_.id });
      } catch (e) {
        errors.push({
          row: i + 2,
          studentId: u.studentId,
          error: e instanceof Error ? e.message : "Failed to create",
        });
      }
    }

    return { created: created.length, failed: errors.length, errors };
  }

  async remove(id: string) {
    const cur = await this.prisma.uniform.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!cur) throw new NotFoundException("Uniform order not found");
    await this.prisma.uniform.delete({ where: { id } });
    return { success: true };
  }
}
