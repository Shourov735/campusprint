import { z } from "zod";

export const optionCategorySchema = z.enum(["PAPER", "COLOR", "SIDES", "BINDING"]);
export const pricingUnitSchema = z.enum(["PER_PAGE", "FLAT"]);

export const createPrintOptionSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, "Code must contain uppercase letters, numbers, or underscores"),
  name: z.string().trim().min(2).max(100),
  category: optionCategorySchema,
  pricingUnit: pricingUnitSchema,
  unitPrice: z.number().nonnegative().max(10000),
  available: z.boolean().default(true),
  description: z.string().trim().max(300).optional()
});

export const replacePrintOptionSchema = createPrintOptionSchema;

export const patchPrintOptionSchema = createPrintOptionSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for partial update."
  });

export const listPrintOptionsQuerySchema = z.object({
  category: optionCategorySchema.optional(),
  available: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  sortBy: z.enum(["unitPrice", "name", "createdAt"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

export type CreatePrintOptionInput = z.infer<typeof createPrintOptionSchema>;
export type PatchPrintOptionInput = z.infer<typeof patchPrintOptionSchema>;
export type ListPrintOptionsQuery = z.infer<typeof listPrintOptionsQuerySchema>;
