import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Public liveness probe. Used by Render's health check, uptime pings, and for
 * quick "is the backend alive?" checks. No JwtAuthGuard — intentional.
 *
 * `GET /health` deliberately does NOT touch the database.
 *
 * It used to run `SELECT 1` on every call, and Render polls this path
 * constantly — which meant the database was queried around the clock and
 * Neon's compute could never auto-suspend. A month of that exhausts the free
 * tier's compute hours even though nobody is using the app.
 *
 * The database check still exists, at `GET /health/db`, for when you actually
 * want to know. Keep it off any automated polling path.
 */
@Controller("health")
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: is the process serving HTTP? No database access. */
  @Get()
  check() {
    return { status: "ok", uptime: this.uptime() };
  }

  /**
   * Readiness: can we actually reach the database?
   *
   * Still answers 200 with `db: "error"` rather than 5xx, so pointing a
   * platform health check at it by accident can't get the service recycled for
   * a transient Neon cold start.
   */
  @Get("db")
  async checkDb() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", db: "ok" as const, uptime: this.uptime() };
    } catch (err) {
      return {
        status: "ok",
        db: "error" as const,
        dbError: err instanceof Error ? err.message : "unknown",
        uptime: this.uptime(),
      };
    }
  }

  private uptime() {
    return Math.round((Date.now() - this.startedAt) / 1000);
  }
}
