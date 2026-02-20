// app/api/bank-accounts/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyBearer } from "@/lib/auth/server";

function now() {
  return Date.now();
}

export async function GET(req: Request) {
  try {
    const { uid } = await verifyBearer(req);
    const col = adminDb.collection("users").doc(uid).collection("bankAccounts");
    const snap = await col.orderBy("createdAt", "desc").limit(200).get();
    const bankAccounts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, bankAccounts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const { uid } = await verifyBearer(req);
    const body = await req.json();

    const bankName = (body?.bankName ?? "").toString().trim();
    const branchName = (body?.branchName ?? "").toString().trim();
    const accountType = (body?.accountType ?? "").toString().trim(); // 普通/当座など
    const accountNumber = (body?.accountNumber ?? "").toString().trim();
    const accountName = (body?.accountName ?? "").toString().trim();

    if (!bankName || !branchName || !accountType || !accountNumber || !accountName) {
      return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
    }

    const col = adminDb.collection("users").doc(uid).collection("bankAccounts");
    const ref = await col.add({
      bankName,
      branchName,
      accountType,
      accountNumber,
      accountName,
      createdAt: now(),
      updatedAt: now(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 400 });
  }
}
