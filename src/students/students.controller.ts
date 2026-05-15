import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { StudentsService } from "./students.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  studentSchema,
  importStudentsSchema,
  bulkDeleteSchema,
  type StudentDto,
  type ImportStudentsDto,
  type BulkDeleteDto,
} from "../common/schemas";

@Controller("students")
@UseGuards(JwtAuthGuard)
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  list(
    @Query("q") q?: string,
    @Query("groupId") groupId?: string,
    @Query("status") status?: "active" | "inactive",
  ) {
    return this.students.list({ q, groupId, status });
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.students.findOne(id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(studentSchema))
  create(@Body() body: StudentDto) {
    return this.students.create(body);
  }

  @Post("import")
  importMany(
    @Body(new ZodValidationPipe(importStudentsSchema)) body: ImportStudentsDto,
  ) {
    return this.students.importMany(body);
  }

  @Post("bulk-delete")
  bulkDelete(
    @Body(new ZodValidationPipe(bulkDeleteSchema)) body: BulkDeleteDto,
  ) {
    return this.students.bulkDelete(body);
  }

  @Put(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(studentSchema)) body: StudentDto,
  ) {
    return this.students.update(id, body);
  }

  @Patch(":id/toggle-active")
  toggleActive(@Param("id", ParseUUIDPipe) id: string) {
    return this.students.toggleActive(id);
  }

  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.students.remove(id);
  }
}
