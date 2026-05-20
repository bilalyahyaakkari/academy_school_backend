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
import { UniformsService } from "./uniforms.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  uniformSchema,
  importUniformsSchema,
  bulkDeleteSchema,
  type UniformDto,
  type ImportUniformsDto,
  type BulkDeleteDto,
} from "../common/schemas";

@Controller("uniforms")
@UseGuards(JwtAuthGuard)
export class UniformsController {
  constructor(private readonly uniforms: UniformsService) {}

  @Get()
  list(@Query("paid") paid?: string) {
    const filter: { isPaid?: boolean } = {};
    if (paid === "true") filter.isPaid = true;
    if (paid === "false") filter.isPaid = false;
    return this.uniforms.list(filter);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(uniformSchema))
  create(@Body() body: UniformDto) {
    return this.uniforms.create(body);
  }

  @Post("import")
  importMany(
    @Body(new ZodValidationPipe(importUniformsSchema)) body: ImportUniformsDto,
  ) {
    return this.uniforms.importMany(body);
  }

  @Post("bulk-delete")
  bulkDelete(
    @Body(new ZodValidationPipe(bulkDeleteSchema)) body: BulkDeleteDto,
  ) {
    return this.uniforms.bulkDelete(body);
  }

  @Put(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(uniformSchema)) body: UniformDto,
  ) {
    return this.uniforms.update(id, body);
  }

  @Patch(":id/toggle-paid")
  togglePaid(@Param("id", ParseUUIDPipe) id: string) {
    return this.uniforms.togglePaid(id);
  }

  @Patch(":id/toggle-received")
  toggleReceived(@Param("id", ParseUUIDPipe) id: string) {
    return this.uniforms.toggleReceived(id);
  }

  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.uniforms.remove(id);
  }
}
