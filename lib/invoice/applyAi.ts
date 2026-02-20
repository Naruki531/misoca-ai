import { AiInvoice } from "./schema";
import { InvoiceDraft, InvoiceItem } from "./types";
import { calcAmount, calculateTotals } from "./calc";
import { v4 as uuid } from "uuid";

export function applyAiToDraft(prev: InvoiceDraft, ai: AiInvoice): InvoiceDraft {
  const items: InvoiceItem[] = (ai.items || []).map((it) => {
    const base = {
      id: uuid(),
      code: it.code || "",
      name: it.name,
      qty: it.qty ?? 1,
      unit: it.unit || "式",
      unitPrice: it.unitPrice,
      taxRate: (it.taxRate ?? 10) as 0 | 8 | 10,
    };
    return calcAmount(base);
  });

  const totals = calculateTotals(items);

  return {
    ...prev,
    subject: ai.subject ?? prev.subject,
    issueDate: ai.issueDate ?? prev.issueDate,
    dueDate: ai.dueDate ?? prev.dueDate,
    items,
    subTotal: totals.subTotal,
    taxTotal: totals.taxTotal,
    grandTotal: totals.grandTotal,
    notes: ai.notes ?? prev.notes,
    updatedAt: Date.now(),
  };
}
