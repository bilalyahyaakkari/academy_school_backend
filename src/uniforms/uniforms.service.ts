import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { serialize } from "../common/serialize";
import type {
  UniformDto,
  ImportUniformsDto,
  BulkDeleteDto,
  UniformAddPaymentDto,
} from "../common/schemas";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

@Injectable()
export class UniformsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: { isPaid?: boolean }) {
    const uniforms = await this.prisma.uniform.findMany({
      where: {
        student: { archived: false },
        ...(filter.isPaid !== undefined ? { isPaid: filter.isPaid } : {}),
      },
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
    // If the caller provided paidAmount, trust it (and clamp); otherwise infer
    // from the isPaid flag: paid → fully paid, unpaid → 0.
    const paidAmount = clamp(
      dto.paidAmount ?? (dto.isPaid ? dto.price : 0),
      0,
      dto.price,
    );
    const isPaid = paidAmount >= dto.price && dto.price > 0;

    const u = await this.prisma.uniform.create({
      data: {
        studentId: dto.studentId,
        size: dto.size,
        price: dto.price,
        paidAmount,
        isPaid,
        paidAt: isPaid ? new Date() : null,
        isReceived: dto.isReceived,
        receivedAt: dto.isReceived ? new Date() : null,
        notes: dto.notes ?? null,
      },
    });
    return serialize(u);
  }

  async update(id: string, dto: UniformDto) {
    const cur = await this.prisma.uniform.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException("Uniform order not found");

    // If caller passed paidAmount, use it; otherwise preserve current.
    // But if isPaid toggles, sync paidAmount to match.
    let paidAmount =
      dto.paidAmount !== undefined ? dto.paidAmount : Number(cur.paidAmount);
    if (dto.isPaid && paidAmount < dto.price) paidAmount = dto.price;
    if (!dto.isPaid && paidAmount >= dto.price && dto.price > 0) paidAmount = 0;
    paidAmount = clamp(paidAmount, 0, dto.price);
    const isPaid = paidAmount >= dto.price && dto.price > 0;

    const u = await this.prisma.uniform.update({
      where: { id },
      data: {
        studentId: dto.studentId,
        size: dto.size,
        price: dto.price,
        paidAmount,
        isPaid,
        paidAt: isPaid ? (cur.isPaid ? cur.paidAt : new Date()) : null,
        isReceived: dto.isReceived,
        receivedAt: dto.isReceived
          ? cur.isReceived
            ? cur.receivedAt
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
    const next = !cur.isPaid;
    const u = await this.prisma.uniform.update({
      where: { id },
      data: {
        isPaid: next,
        // Toggling "paid" jumps paidAmount to full price; toggling "unpaid"
        // resets it to 0 so the running total reflects the new state.
        paidAmount: next ? cur.price : 0,
        paidAt: next ? new Date() : null,
      },
    });
    return serialize(u);
  }

  /**
   * Record a partial (or full) payment against an outstanding uniform order.
   * Bumps paidAmount by the given amount, clamped to never exceed price.
   * Auto-flips isPaid when the running total reaches price.
   */
  async addPayment(id: string, dto: UniformAddPaymentDto) {
    const cur = await this.prisma.uniform.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException("Uniform order not found");

    const price = Number(cur.price);
    const before = Number(cur.paidAmount);
    const next = clamp(before + dto.amount, 0, price);
    const isPaid = next >= price && price > 0;

    const u = await this.prisma.uniform.update({
      where: { id },
      data: {
        paidAmount: next,
        isPaid,
        paidAt: isPaid && !cur.isPaid ? new Date() : cur.paidAt,
      },
    });
    return serialize(u);
  }

  async toggleReceived(id: string) {
    const cur = await this.prisma.uniform.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException("Uniform order not found");
    const u = await this.prisma.uniform.update({
      where: { id },
      data: {
        isReceived: !cur.isReceived,
        receivedAt: !cur.isReceived ? new Date() : null,
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

  async bulkDelete(dto: BulkDeleteDto) {
    const result = await this.prisma.uniform.deleteMany({
      where: { id: { in: dto.ids } },
    });
    return { deleted: result.count };
  }
}
