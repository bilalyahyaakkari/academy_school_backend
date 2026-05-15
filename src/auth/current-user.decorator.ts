import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import type { JwtPayload } from "./jwt.strategy";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    return ctx.switchToHttp().getRequest().user;
  },
);
