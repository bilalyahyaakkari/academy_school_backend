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

  // CORS — frontend served from FRONTEND_ORIGIN. Allow credentials so the
  // frontend can forward bearer tokens via Authorization headers.
  app.enableCors({
    origin: config.get<string>("FRONTEND_ORIGIN", "http://localhost:3000"),
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
