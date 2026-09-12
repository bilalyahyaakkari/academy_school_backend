import { Module } from "@nestjs/common";
import { StudentsService } from "./students.service";
import { StudentsController } from "./students.controller";
import { RosterModule } from "../roster/roster.module";

@Module({
  imports: [RosterModule],
  providers: [StudentsService],
  controllers: [StudentsController],
})
export class StudentsModule {}
