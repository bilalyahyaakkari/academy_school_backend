import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Public liveness probe. Used by Render's health check, uptime pings, and for
 * quick "is the backend alive?" checks. No JwtAuthGuard — intentional.
 *
 * Always returns 200 as long as the HTTP layer responds; DB reachability is
 * reported as a structured field. We deliberately do NOT 5xx on DB blips so
 * Render won't kill the process for a transient Neon cold-start.
 */
@Controller("health")
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const uptime = Math.round((Date.now() - this.startedAt) / 1000);
    let db: "ok" | "error" = "ok";
    let dbError: string | undefined;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      db = "error";
      dbError = err instanceof Error ? err.message : "unknown";
    }
    return {
      status: "ok",
      db,
      ...(dbError ? { dbError } : {}),
      uptime,
    };
  }
}
