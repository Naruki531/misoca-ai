// app/api/drafts/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyBearer } from "@/lib/auth/server";

function now() {
  return Date.now();
}

// 空ドラフト（必要最低限）
function emptyDraft() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const today = `${yyyy}-${mm}-${dd}`;

  return {
    clientId: null,
    issueDate: today,
    dueDate: null,
    invoiceNo: "",
    subject: "",
    issuerId: null,
    items: [],
    subTotal: 0,
    taxTotal: 0,
    grandTotal: 0,
    notes: "",
    bankAccountIds: [],
    rawInstruction: "",
    createdAt: now(),
    updatedAt: now(),
  };
}

export async function POST(req: Request) {
  try {
    const { uid } = await verifyBearer(req);
    const body = await req.json().catch(() => ({}));
    const rawInstruction = typeof body.rawInstruction === "string" ? body.rawInstruction : "";

    const draftsCol = adminDb.collection("users").doc(uid).collection("drafts");

    const ref = await draftsCol.add({
      ...emptyDraft(),
      rawInstruction,
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 401 });
  }
}

// 任意：一覧（必要になったら使う）
export async function GET(req: Request) {
  try {
    const { uid } = await verifyBearer(req);
    const draftsCol = adminDb.collection("users").doc(uid).collection("drafts");

    const snap = await draftsCol.orderBy("updatedAt", "desc").limit(50).get();
    const drafts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ ok: true, drafts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 401 });
  }
}
