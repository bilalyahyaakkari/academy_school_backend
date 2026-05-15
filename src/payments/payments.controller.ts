import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  generateInvoicesSchema,
  paymentUpdateSchema,
  addPaymentSchema,
  type PaymentUpdateDto,
  type AddPaymentDto,
} from "../common/schemas";

@Controller("payments")
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("month")
  listForMonth(
    @Query("year", ParseIntPipe) year: number,
    @Query("month", ParseIntPipe) month: number,
  ) {
    return this.payments.listForMonth(year, month);
  }

  @Get("history")
  history(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("status") status?: string,
  ) {
    return this.payments.history({ from, to, status });
  }

  @Get("outstanding")
  outstanding() {
    return this.payments.outstanding();
  }

  @Post("generate-invoices")
  generateInvoices(@Body(new ZodValidationPipe(generateInvoicesSchema)) body: { year: number; month: number }) {
    return this.payments.generateInvoices(body.year, body.month);
  }

  @Patch(":id/mark-paid")
  markPaid(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("method") method?: "CASH" | "BANK_TRANSFER" | "OTHER",
  ) {
    return this.payments.markPaid(id, method ?? "CASH");
  }

  @Post(":id/add-payment")
  addPayment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addPaymentSchema)) body: AddPaymentDto,
  ) {
    return this.payments.addPayment(id, body);
  }

  @Patch(":id/mark-unpaid")
  markUnpaid(@Param("id", ParseUUIDPipe) id: string) {
    return this.payments.markUnpaid(id);
  }

  @Put(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(paymentUpdateSchema)) body: PaymentUpdateDto,
  ) {
    return this.payments.update(id, body);
  }
}
