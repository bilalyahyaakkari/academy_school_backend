import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AttendanceService } from "./attendance.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  attendanceSaveSchema,
  attendanceSessionSchema,
  type AttendanceSaveDto,
  type AttendanceSessionDto,
} from "../common/schemas";

@Controller("attendance")
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get("overview")
  overview(
    @Query("year", ParseIntPipe) year: number,
    @Query("month", ParseIntPipe) month: number,
  ) {
    return this.attendance.overview(year, month);
  }

  @Get("group/:groupId")
  monthGrid(
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Query("year", ParseIntPipe) year: number,
    @Query("month", ParseIntPipe) month: number,
  ) {
    return this.attendance.monthGrid(groupId, year, month);
  }

  @Get("student/:studentId")
  studentMonth(
    @Param("studentId", ParseUUIDPipe) studentId: string,
    @Query("year", ParseIntPipe) year: number,
    @Query("month", ParseIntPipe) month: number,
  ) {
    return this.attendance.studentMonth(studentId, year, month);
  }

  @Get("session/:id")
  getSession(@Param("id", ParseUUIDPipe) id: string) {
    return this.attendance.getSession(id);
  }

  @Post("session")
  createSession(
    @Body(new ZodValidationPipe(attendanceSessionSchema)) body: AttendanceSessionDto,
  ) {
    return this.attendance.createSession(body);
  }

  @Put("session/:id")
  saveSession(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(attendanceSaveSchema)) body: AttendanceSaveDto,
  ) {
    return this.attendance.saveSession(id, body);
  }

  @Delete("session/:id")
  deleteSession(@Param("id", ParseUUIDPipe) id: string) {
    return this.attendance.deleteSession(id);
  }
}
