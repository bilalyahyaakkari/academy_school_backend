import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

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

/**
 * Close the pool after this long without a query, so Neon's compute can
 * auto-suspend instead of being held awake by an idle connection. Prisma
 * reconnects by itself on the next query.
 *
 * Set DB_IDLE_DISCONNECT_MS=0 to keep the connection open permanently.
 */
const IDLE_DISCONNECT_MS = Number(process.env.DB_IDLE_DISCONNECT_MS ?? 3 * 60_000);

/**
 * `query` is emitted as an event (not printed) purely so we can tell when the
 * database was last touched. Errors still go to stdout.
 */
const clientOptions = {
  log: [
    { emit: "event", level: "query" },
    { emit: "stdout", level: "error" },
  ],
} satisfies Prisma.PrismaClientOptions;

@Injectable()
export class PrismaService
  extends PrismaClient<typeof clientOptions>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private lastQueryAt = Date.now();
  private connected = false;
  private idleTimer?: NodeJS.Timeout;

  constructor() {
    const url = withNeonTimeouts(process.env.DATABASE_URL);
    super({
      ...clientOptions,
      ...(url ? { datasources: { db: { url } } } : {}),
    });

    this.$on("query", () => {
      this.lastQueryAt = Date.now();
      this.connected = true;
    });
  }

  /**
   * Drops the connection once the app has been quiet for a while.
   *
   * The timer only ever fires after a stretch with no queries at all, so there
   * is nothing in flight to interrupt; if a request does arrive mid-disconnect,
   * Prisma opens a new connection for it (that wake-up is what the 15s
   * connect_timeout above is for).
   */
  private startIdleWatch() {
    if (IDLE_DISCONNECT_MS <= 0) {
      this.logger.log("Idle disconnect disabled — connection stays open");
      return;
    }

    this.idleTimer = setInterval(
      () => {
        if (!this.connected) return;
        if (Date.now() - this.lastQueryAt < IDLE_DISCONNECT_MS) return;

        this.connected = false;
        void this.$disconnect()
          .then(() =>
            this.logger.log(
              `Idle for ${Math.round(IDLE_DISCONNECT_MS / 1000)}s — released the database connection`,
            ),
          )
          .catch((err) =>
            this.logger.warn(
              `Idle disconnect failed: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
      },
      Math.min(IDLE_DISCONNECT_MS, 30_000),
    );

    // Never keep the process alive just for this timer.
    this.idleTimer.unref();
  }

  /**
   * Retries the initial connection a few times. Same Neon wake-up problem as
   * above, but at boot: if NestJS gives up the first time it sees P1001, the
   * process never gets a chance to recover. Five retries with 3s backoff covers
   * the typical wake time.
   *
   * If it still fails we start anyway rather than throwing. A database that is
   * down for a reason retrying won't fix — an exhausted plan quota, say — would
   * otherwise crash-loop the process, so the health endpoint can't answer, the
   * host keeps recycling the service, and sign-in fails with a dead connection
   * instead of a message that says what's wrong. Prisma connects lazily on the
   * first query, so the app heals by itself once the database is back.
   */
  async onModuleInit() {
    const attempts = 5;
    const delayMs = 3000;
    for (let i = 1; i <= attempts; i++) {
      try {
        await this.$connect();
        this.connected = true;
        this.lastQueryAt = Date.now();
        this.startIdleWatch();
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
          this.logger.error(
            "Starting anyway — HTTP will serve and /api/health will answer, but " +
              "anything touching the database will fail until it recovers. " +
              "Check with: curl localhost:$PORT/api/health/db",
          );
          this.startIdleWatch();
          return;
        }
        this.logger.warn(
          `Database not reachable (attempt ${i}/${attempts}), retrying in ${delayMs}ms…`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  async onModuleDestroy() {
    if (this.idleTimer) clearInterval(this.idleTimer);
    await this.$disconnect();
  }
}
