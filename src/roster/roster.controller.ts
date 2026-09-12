import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RosterService } from "./roster.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  rosterAddSchema,
  rosterRemoveSchema,
  rosterMonthSchema,
  type RosterAddDto,
  type RosterRemoveDto,
} from "../common/schemas";

@Controller("roster")
@UseGuards(JwtAuthGuard)
export class RosterController {
  constructor(private readonly roster: RosterService) {}

  @Get()
  getMonth(
    @Query("year", ParseIntPipe) year: number,
    @Query("month", ParseIntPipe) month: number,
  ) {
    return this.roster.getMonth(year, month);
  }

  @Get("available")
  available(
    @Query("year", ParseIntPipe) year: number,
    @Query("month", ParseIntPipe) month: number,
  ) {
    return this.roster.available(year, month);
  }

  @Get("months")
  months() {
    return this.roster.months();
  }

  /** Force a carry-forward for a month the auto-seed skipped (e.g. far future). */
  @Post("seed")
  seed(
    @Body(new ZodValidationPipe(rosterMonthSchema)) body: { year: number; month: number },
  ) {
    return this.roster
      .ensureSeeded(body.year, body.month)
      .then((created) => ({ created }));
  }

  @Post("add")
  add(@Body(new ZodValidationPipe(rosterAddSchema)) body: RosterAddDto) {
    return this.roster.add(body.year, body.month, body.studentIds);
  }

  /** Remove from this one month only. */
  @Post("remove")
  remove(@Body(new ZodValidationPipe(rosterRemoveSchema)) body: RosterRemoveDto) {
    return this.roster.remove(body.year, body.month, body.studentId);
  }

  /** "They left" — remove from this month onwards and archive the student. */
  @Post("remove-from")
  removeFrom(@Body(new ZodValidationPipe(rosterRemoveSchema)) body: RosterRemoveDto) {
    return this.roster.removeFrom(body.year, body.month, body.studentId);
  }
}
