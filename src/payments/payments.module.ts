import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { PaymentsScheduler } from "./payments.scheduler";
import { RosterModule } from "../roster/roster.module";

@Module({
  imports: [RosterModule],
  providers: [PaymentsService, PaymentsScheduler],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
