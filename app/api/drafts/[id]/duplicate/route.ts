import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyBearer } from "@/lib/auth/server";

function now() {
  return Date.now();
}

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { uid } = await verifyBearer(req as unknown as Request);
    const { id } = await ctx.params;

    const srcRef = adminDb.collection("users").doc(uid).collection("drafts").doc(id);
    const srcSnap = await srcRef.get();
    if (!srcSnap.exists) {
      return NextResponse.json({ ok: false, error: "source_not_found" }, { status: 404 });
    }

    const src = srcSnap.data() as any;
    const nextIssueDate = todayYmd();
    const items = Array.isArray(src.items)
      ? src.items.map((it: any) => ({
          id: String(it?.id ?? ""),
          code: String(it?.code ?? ""),
          name: String(it?.name ?? ""),
          qty: Number(it?.qty ?? 1),
          unit: String(it?.unit ?? ""),
          unitPrice: Number(it?.unitPrice ?? 0),
          taxRate: Number(it?.taxRate ?? src?.taxDefault ?? 10),
          amount: Number(it?.amount ?? 0),
        }))
      : [];

    const copyDoc = {
      instructionText: String(src?.instructionText ?? ""),
      clientId: src?.clientId ?? "",
      issuerId: src?.issuerId ?? "",
      bankAccountIds: Array.isArray(src?.bankAccountIds)
        ? src.bankAccountIds.slice(0, 10).map((x: any) => String(x))
        : [],
      subject: String(src?.subject ?? ""),
      issueDate: nextIssueDate,
      dueDate: "",
      invoiceNo: "",
      items: items.slice(0, 80),
      taxDefault: Number(src?.taxDefault ?? 10),
      subTotal: Number(src?.subTotal ?? 0),
      taxTotal: Number(src?.taxTotal ?? 0),
      grandTotal: Number(src?.grandTotal ?? 0),
      note: String(src?.note ?? ""),
      sourceDraftId: id,
      createdAt: now(),
      updatedAt: now(),
    };

    const ref = await adminDb.collection("users").doc(uid).collection("drafts").add(copyDoc);
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 400 });
  }
}
