import { z } from "zod";

export const AiInvoiceSchema = z.object({
  client: z.object({
    hint: z.string().optional(),
    mode: z.enum(["byNameOrLast", "byNameOnly", "byLastOnly"]).default("byNameOrLast"),
  }),
  subject: z.string().max(70).optional(),
  issueDate: z.string().optional(), // YYYY-MM-DD
  dueDate: z.string().optional(),
  currency: z.literal("JPY").default("JPY"),
  items: z.array(z.object({
    code: z.string().optional().default(""),
    name: z.string().min(1),
    qty: z.number().positive().default(1),
    unit: z.string().default("式"),
    unitPrice: z.number().int().nonnegative(),
    taxRate: z.union([z.literal(0), z.literal(8), z.literal(10)]).default(10),
  })).max(80),
  notes: z.string().optional().default(""),
  confidence: z.any().optional(),
  warnings: z.array(z.string()).optional().default([]),
});
export type AiInvoice = z.infer<typeof AiInvoiceSchema>;
