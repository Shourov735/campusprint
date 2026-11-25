import { z } from "zod";

export const orderStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "AWAITING_PAYMENT",
  "PAID",
  "PRINTING",
  "READY",
  "COLLECTED",
  "REJECTED",
  "CANCELLED"
]);

export const documentInputSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((name) => name.toLowerCase().endsWith(".pdf"), {
      message: "Only PDF documents (.pdf) are supported."
    }),
  mimeType: z.literal("application/pdf").default("application/pdf"),
  pageCount: z.number().int().min(1).max(2000),
  sizeBytes: z.number().int().min(1).max(50 * 1024 * 1024)
});

export const createOrderSchema = z.object({
  document: documentInputSchema,
  copies: z.number().int().min(1).max(100).default(1),
  optionIds: z
    .array(z.string().trim().min(1))
    .min(1, "At least one print option must be selected.")
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Duplicate print option IDs are not allowed."
    }),
  notes: z.string().trim().max(500).optional()
});

export const replaceOrderSchema = createOrderSchema;

export const patchOrderSchema = z
  .object({
    document: documentInputSchema.partial().optional(),
    copies: z.number().int().min(1).max(100).optional(),
    optionIds: z
      .array(z.string().trim().min(1))
      .min(1, "At least one print option must be selected.")
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Duplicate print option IDs are not allowed."
      })
      .optional(),
    notes: z.string().trim().max(500).optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for partial update."
  });

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
  rejectionReason: z.string().trim().min(3).max(300).optional()
});

export const payOrderSchema = z.object({
  transactionId: z.string().trim().min(4).max(100),
  provider: z.string().trim().min(2).max(50).default("SSLCOMMERZ_SANDBOX"),
  amount: z.number().positive().optional()
});

export const listOrdersQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "totalPrice"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type PatchOrderInput = z.infer<typeof patchOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type PayOrderInput = z.infer<typeof payOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
