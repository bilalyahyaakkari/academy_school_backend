import { z } from "zod";

const isoDate = z
  .string()
  .min(1, "Required")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

const optionalString = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
);

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(120),
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

export const studentSchema = z.object({
  fullName: z.string().min(2).max(120),
  dateOfBirth: isoDate,
  address: z.string().max(300).optional().nullable(),
  school: z.string().max(120).optional().nullable(),
  phoneNumber: optionalString,
  groupId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  // Per-student override of the group's monthly fee. Null/omitted = inherit.
  monthlyFee: z.number().min(0).max(1_000_000).nullable().optional(),
  notes: optionalString,
});
export type StudentDto = z.infer<typeof studentSchema>;

export const importStudentsSchema = z.object({
  students: z.array(studentSchema).min(1).max(2000),
});
export type ImportStudentsDto = z.infer<typeof importStudentsSchema>;

export const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(2000),
});
export type BulkDeleteDto = z.infer<typeof bulkDeleteSchema>;

const scheduleSlot = z.object({
  day: z.enum([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const groupSchema = z.object({
  name: z.string().min(2).max(80),
  minAge: z.number().int().min(0).max(120).nullable().optional(),
  maxAge: z.number().int().min(0).max(120).nullable().optional(),
  schedule: z.array(scheduleSlot).default([]),
  monthlyFee: z.number().min(0).max(1_000_000),
  maxCapacity: z.number().int().min(1).max(10_000).nullable().optional(),
  coachName: optionalString,
});
export type GroupDto = z.infer<typeof groupSchema>;

export const generateInvoicesSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export const paymentUpdateSchema = z.object({
  status: z.enum(["PAID", "UNPAID", "PARTIAL"]),
  paidAmount: z.number().min(0).optional(),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "OTHER"]).nullable().optional(),
  notes: optionalString,
});
export type PaymentUpdateDto = z.infer<typeof paymentUpdateSchema>;

export const addPaymentSchema = z.object({
  // How much the parent is handing over right now (NOT the cumulative total).
  amount: z.number().positive().max(1_000_000),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "OTHER"]).optional(),
  notes: optionalString,
});
export type AddPaymentDto = z.infer<typeof addPaymentSchema>;

export const uniformSchema = z.object({
  studentId: z.string().uuid(),
  size: z.string().trim().min(1).max(20),
  price: z.number().min(0).max(1_000_000),
  isPaid: z.boolean().default(false),
  notes: optionalString,
});
export type UniformDto = z.infer<typeof uniformSchema>;

export const importUniformsSchema = z.object({
  uniforms: z.array(uniformSchema).min(1).max(2000),
});
export type ImportUniformsDto = z.infer<typeof importUniformsSchema>;

export const settingsSchema = z.object({
  academyName: z.string().min(1).max(80),
  defaultFee: z.number().min(0).max(1_000_000),
  whatsappCountry: z.string().regex(/^\d{1,4}$/),
  // Custom reminder template. Empty/null = use the built-in default.
  whatsappTemplate: z.string().max(2000).nullable().optional(),
});
export type SettingsDto = z.infer<typeof settingsSchema>;
