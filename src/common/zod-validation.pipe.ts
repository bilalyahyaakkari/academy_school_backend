import { ArgumentMetadata, BadRequestException, PipeTransform } from "@nestjs/common";
import { ZodSchema, ZodError } from "zod";

/**
 * Per-route validation pipe driven by a Zod schema.
 *
 * Usage:
 *   @UsePipes(new ZodValidationPipe(myDtoSchema))
 *   create(@Body() body: MyDto) { ... }
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        errors: this.formatZodError(result.error),
      });
    }
    return result.data;
  }

  private formatZodError(err: ZodError) {
    return err.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
  }
}
