import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { serialize } from "../common/serialize";
import type { SettingsDto } from "../common/schemas";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const settings = await this.prisma.settings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        academyName: "Academy",
        defaultFee: 0,
        whatsappCountry: "963",
      },
      update: {},
    });
    return serialize(settings);
  }

  async update(dto: SettingsDto) {
    // Build the data payload field-by-field. Critically: only touch
    // whatsappTemplate if the caller actually included it. Otherwise
    // saving the General form would wipe a custom template.
    const data: {
      academyName: string;
      defaultFee: number;
      whatsappCountry: string;
      whatsappTemplate?: string | null;
    } = {
      academyName: dto.academyName,
      defaultFee: dto.defaultFee,
      whatsappCountry: dto.whatsappCountry,
    };

    if (dto.whatsappTemplate !== undefined) {
      // Empty/whitespace string → null (runtime falls back to default).
      data.whatsappTemplate =
        dto.whatsappTemplate && dto.whatsappTemplate.trim().length > 0
          ? dto.whatsappTemplate
          : null;
    }

    const settings = await this.prisma.settings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...data },
      update: data,
    });
    return serialize(settings);
  }
}
