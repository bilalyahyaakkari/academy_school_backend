import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { settingsSchema, type SettingsDto } from "../common/schemas";

@Controller("settings")
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put()
  update(@Body(new ZodValidationPipe(settingsSchema)) body: SettingsDto) {
    return this.settings.update(body);
  }
}
