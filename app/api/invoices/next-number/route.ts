import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";

function yyyymmdd(dateStr: string) {
  // dateStr: YYYY-MM-DD
  return dateStr.replaceAll("-", "");
}

export async function POST(req: Request) {
  try {
    const { uid } = await verifyBearer(req);
    const body = await req.json();
    const issueDate: string = body.issueDate; // YYYY-MM-DD 必須
    if (!issueDate) throw new Error("issueDate required");

    const key = yyyymmdd(issueDate);
    const counterRef = adminDb.doc(`users/${uid}/counters/${key}`);

    const invoiceNo = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const seq = snap.exists ? (snap.data()?.seq || 0) + 1 : 1;
      tx.set(counterRef, { seq, updatedAt: Date.now() }, { merge: true });
      const padded = String(seq).padStart(3, "0");
      return `${key}-${padded}`;
    });

    return NextResponse.json({ ok: true, invoiceNo });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 400 });
  }
}
