import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }

  /**
   * Retries the initial connection a few times. Neon free-tier compute
   * auto-suspends after ~5 min idle and can take 5–15s to wake — if NestJS
   * crashes the first time it sees P1001, the process never gets a chance
   * to recover. Five retries with 3s backoff covers the typical wake time.
   */
  async onModuleInit() {
    const attempts = 5;
    const delayMs = 3000;
    for (let i = 1; i <= attempts; i++) {
      try {
        await this.$connect();
        if (i > 1) {
          this.logger.log(`Database connected after ${i} attempt(s)`);
        }
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (i === attempts) {
          this.logger.error(
            `Failed to connect to database after ${attempts} attempts: ${message}`,
          );
          throw err;
        }
        this.logger.warn(
          `Database not reachable (attempt ${i}/${attempts}), retrying in ${delayMs}ms…`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
