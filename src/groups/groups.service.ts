import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { serialize } from "../common/serialize";
import type { GroupDto } from "../common/schemas";

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const groups = await this.prisma.group.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { students: true } } },
    });
    return serialize(groups);
  }

  async findOne(id: string) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: {
        students: {
          orderBy: { fullName: "asc" },
        },
      },
    });
    if (!group) throw new NotFoundException("Group not found");
    return serialize(group);
  }

  async create(dto: GroupDto) {
    const g = await this.prisma.group.create({
      data: {
        name: dto.name,
        minAge: dto.minAge ?? null,
        maxAge: dto.maxAge ?? null,
        schedule: dto.schedule,
        monthlyFee: dto.monthlyFee,
        maxCapacity: dto.maxCapacity ?? null,
        coachName: dto.coachName ?? null,
      },
    });
    return serialize(g);
  }

  async update(id: string, dto: GroupDto) {
    await this.assertExists(id);
    const g = await this.prisma.group.update({
      where: { id },
      data: {
        name: dto.name,
        minAge: dto.minAge ?? null,
        maxAge: dto.maxAge ?? null,
        schedule: dto.schedule,
        monthlyFee: dto.monthlyFee,
        maxCapacity: dto.maxCapacity ?? null,
        coachName: dto.coachName ?? null,
      },
    });

    // Cascade fee change → every UNPAID invoice belonging to a student in this
    // group who doesn't have a per-student fee override.
    await this.prisma.payment.updateMany({
      where: {
        status: "UNPAID",
        student: { groupId: id, monthlyFee: null },
      },
      data: { amount: dto.monthlyFee },
    });

    return serialize(g);
  }

  async remove(id: string) {
    const count = await this.prisma.student.count({ where: { groupId: id } });
    if (count > 0) {
      throw new ConflictException(
        `Group has ${count} student(s). Reassign them before deleting.`,
      );
    }
    await this.assertExists(id);
    await this.prisma.group.delete({ where: { id } });
    return { success: true };
  }

  private async assertExists(id: string) {
    const exists = await this.prisma.group.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Group not found");
  }
}
