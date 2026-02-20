import { InvoiceItem } from "./types";

export function calcAmount(item: Omit<InvoiceItem, "amount">): InvoiceItem {
  const amount = Math.round(item.qty * item.unitPrice);
  return { ...item, amount };
}

export function calculateTotals(items: InvoiceItem[]) {
  const subTotal = items.reduce((sum, i) => sum + i.amount, 0);

  const taxByRate = items.reduce((acc, i) => {
    const r = i.taxRate;
    acc[r] = (acc[r] || 0) + i.amount;
    return acc;
  }, {} as Record<number, number>);

  // 端数：いったん切り捨て（後で設定化しても良い）
  const taxTotal = Object.entries(taxByRate).reduce((sum, [rate, amount]) => {
    const r = Number(rate);
    return sum + Math.floor(amount * (r / 100));
  }, 0);

  return {
    subTotal,
    taxTotal,
    grandTotal: subTotal + taxTotal,
    taxByRate,
  };
}
