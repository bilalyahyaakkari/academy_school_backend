import { Module } from "@nestjs/common";
import { RosterService } from "./roster.service";
import { RosterController } from "./roster.controller";

@Module({
  providers: [RosterService],
  controllers: [RosterController],
  exports: [RosterService],
})
export class RosterModule {}
