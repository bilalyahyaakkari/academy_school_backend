import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { PaymentsScheduler } from "./payments.scheduler";

@Module({
  providers: [PaymentsService, PaymentsScheduler],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
