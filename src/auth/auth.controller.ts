import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser } from "./current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  changePasswordSchema,
  loginSchema,
  type ChangePasswordDto,
  type LoginDto,
} from "../common/schemas";
import type { JwtPayload } from "./jwt.strategy";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return { id: user.sub, email: user.email };
  }

  @Patch("change-password")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user.sub, body);
  }
}
