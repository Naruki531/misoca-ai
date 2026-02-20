// app/api/invoices/next-number/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyBearer } from "@/lib/auth/server";

function yyyymmdd(dateStr?: string) {
  // dateStr: "YYYY-MM-DD"
  const d = dateStr ? new Date(dateStr) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

export async function POST(req: Request) {
  try {
    const { uid } = await verifyBearer(req);
    const body = await req.json().catch(() => ({}));
    const issueDate = (body?.issueDate ?? "").toString(); // YYYY-MM-DD
    const key = yyyymmdd(issueDate);

    const ref = adminDb
      .collection("users")
      .doc(uid)
      .collection("counters")
      .doc("invoiceNumbers")
      .collection("days")
      .doc(key);

    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const seq = (snap.exists ? (snap.data()?.seq ?? 0) : 0) + 1;
      tx.set(ref, { seq }, { merge: true });
      return seq;
    });

    const invoiceNo = `${key}-${String(result).padStart(3, "0")}`;
    return NextResponse.json({ ok: true, invoiceNo });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 400 });
  }
}
