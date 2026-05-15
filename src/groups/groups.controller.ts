import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { GroupsService } from "./groups.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { groupSchema, type GroupDto } from "../common/schemas";

@Controller("groups")
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  list() {
    return this.groups.list();
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.groups.findOne(id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(groupSchema))
  create(@Body() body: GroupDto) {
    return this.groups.create(body);
  }

  @Put(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(groupSchema)) body: GroupDto,
  ) {
    return this.groups.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.groups.remove(id);
  }
}
