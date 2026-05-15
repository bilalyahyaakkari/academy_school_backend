import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PaymentsService } from "./payments.service";

/**
 * Two triggers, both calling the idempotent `generateInvoices`:
 *
 * 1. Cron: 00:05 on the 1st of every month — creates UNPAID rows for that month.
 * 2. On application bootstrap — catches up if the cron didn't fire (server was
 *    down on the 1st). The service skips students that already have a record,
 *    so running it on every boot is safe and fast.
 */
@Injectable()
export class PaymentsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PaymentsScheduler.name);

  constructor(private readonly payments: PaymentsService) {}

  @Cron("0 5 1 * *", { name: "monthlyInvoices" })
  async runMonthly() {
    const now = new Date();
    try {
      const result = await this.payments.generateInvoices(
        now.getFullYear(),
        now.getMonth() + 1,
      );
      this.logger.log(
        `Monthly cron: created ${result.created}, skipped ${result.skipped}`,
      );
    } catch (err) {
      this.logger.error("Monthly cron failed", err as Error);
    }
  }

  async onApplicationBootstrap() {
    const now = new Date();
    try {
      const result = await this.payments.generateInvoices(
        now.getFullYear(),
        now.getMonth() + 1,
      );
      if (result.created > 0) {
        this.logger.log(
          `Boot catch-up: generated ${result.created} invoices for ${now.getMonth() + 1}/${now.getFullYear()}`,
        );
      }
    } catch (err) {
      // Don't crash the app if the DB isn't reachable on boot.
      this.logger.warn(
        `Boot catch-up skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
