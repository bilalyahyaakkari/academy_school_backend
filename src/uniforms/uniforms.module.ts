import { Module } from "@nestjs/common";
import { UniformsService } from "./uniforms.service";
import { UniformsController } from "./uniforms.controller";

@Module({
  providers: [UniformsService],
  controllers: [UniformsController],
})
export class UniformsModule {}
