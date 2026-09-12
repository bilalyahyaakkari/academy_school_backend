import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Neon suspends the compute after ~5 minutes of inactivity. The next query has
 * to wake it, which regularly takes longer than Prisma's 5s default
 * `connect_timeout` — and a query that lands exactly on the wake-up surfaces to
 * the user as a bare 500 ("Internal server error"), even though the app and the
 * database are both perfectly healthy.
 *
 * Giving Prisma 15s to connect covers the wake. Appended as plain text rather
 * than via `new URL()` so a password with URL-special characters can't get
 * re-encoded on the way through. Explicit values in DATABASE_URL always win.
 */
function withNeonTimeouts(url: string | undefined): string | undefined {
  if (!url) return url;
  let out = url;
  if (!/[?&]connect_timeout=/.test(out)) {
    out += `${out.includes("?") ? "&" : "?"}connect_timeout=15`;
  }
  if (!/[?&]pool_timeout=/.test(out)) {
    out += `&pool_timeout=15`;
  }
  return out;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url = withNeonTimeouts(process.env.DATABASE_URL);
    super({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
      ...(url ? { datasources: { db: { url } } } : {}),
    });
  }

  /**
   * Retries the initial connection a few times. Same Neon wake-up problem as
   * above, but at boot: if NestJS crashes the first time it sees P1001, the
   * process never gets a chance to recover. Five retries with 3s backoff covers
   * the typical wake time.
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
