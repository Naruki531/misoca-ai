export type TaxRate = 0 | 8 | 10;

export type InvoiceItem = {
  id: string;
  code?: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number; // 円（整数）
  taxRate: TaxRate;  // デフォ10
  amount: number;    // qty * unitPrice
};

export type InvoiceDraft = {
  clientId: string | null;
  issueDate: string;   // YYYY-MM-DD
  dueDate: string | null;
  invoiceNo: string;   // 発行時に確定推奨
  subject: string;
  issuerId: string | null;

  items: InvoiceItem[];

  subTotal: number;
  taxTotal: number;
  grandTotal: number;

  notes: string;
  bankAccountIds: string[]; // 0..10

  rawInstruction?: string;
  updatedAt: number;
  createdAt: number;
};
