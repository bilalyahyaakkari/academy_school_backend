import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { Logger, ValidationPipe } from "@nestjs/common";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
  });
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api");

  // CORS — FRONTEND_ORIGIN may be a single origin or a comma-separated list
  // (e.g. "http://localhost:3000,https://academy.vercel.app"). Trailing
  // slashes are stripped so they don't cause spurious mismatches.
  const originList = config
    .get<string>("FRONTEND_ORIGIN", "http://localhost:3000")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => {
      // Same-origin / curl / server-to-server requests have no Origin header.
      if (!origin) return cb(null, true);
      cb(null, originList.includes(origin));
    },
    credentials: true,
  });

  // Built-in transformer (we use a custom Zod pipe per-route for actual validation,
  // but this handles class-transformer for whatever shapes pass through).
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const port = config.get<number>("PORT", 5001);
  await app.listen(port);
  new Logger("Bootstrap").log(`Listening on http://localhost:${port}/api`);
}

bootstrap();
