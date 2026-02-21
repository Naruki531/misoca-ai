// app/api/drafts/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyBearer } from "@/lib/auth/server";

function now() {
  return Date.now();
}

type Ctx = { params: Promise<{ id: string }> };

type TaxRate = 0 | 8 | 10;

function toTaxRate(v: unknown, fallback: TaxRate = 10): TaxRate {
  const n = Number(v);
  if (n === 0 || n === 8 || n === 10) return n;
  return fallback;
}

function toNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function calcTotals(items: Array<{ amount: number; taxRate: TaxRate }>) {
  const subTotal = items.reduce((s, it) => s + it.amount, 0);
  const taxTotal = items.reduce((s, it) => s + Math.floor(it.amount * (it.taxRate / 100)), 0);
  return { subTotal, taxTotal, grandTotal: subTotal + taxTotal };
}

function normalizeDraftPatch(body: any) {
  const taxDefault = toTaxRate(body?.taxDefault, 10);
  const sourceItems = Array.isArray(body?.items) ? body.items.slice(0, 80) : [];

  const items = sourceItems.map((it: any) => {
    const qty = toNum(it?.qty, 1);
    const unitPrice = Math.max(0, Math.round(toNum(it?.unitPrice, 0)));
    const taxRate = toTaxRate(it?.taxRate, taxDefault);
    const amount = Math.round(qty * unitPrice);
    return {
      id: String(it?.id ?? ""),
      code: String(it?.code ?? ""),
      name: String(it?.name ?? ""),
      qty,
      unit: String(it?.unit ?? ""),
      unitPrice,
      taxRate,
      amount,
    };
  });

  const totals = calcTotals(items);

  return {
    instructionText: String(body?.instructionText ?? body?.rawInstruction ?? ""),
    clientId: body?.clientId ? String(body.clientId) : "",
    issuerId: body?.issuerId ? String(body.issuerId) : "",
    bankAccountIds: Array.isArray(body?.bankAccountIds)
      ? body.bankAccountIds.slice(0, 10).map((x: any) => String(x))
      : [],
    subject: String(body?.subject ?? ""),
    issueDate: String(body?.issueDate ?? ""),
    dueDate: body?.dueDate ? String(body.dueDate) : "",
    invoiceNo: String(body?.invoiceNo ?? ""),
    items,
    taxDefault,
    subTotal: totals.subTotal,
    taxTotal: totals.taxTotal,
    grandTotal: totals.grandTotal,
    note: String(body?.note ?? body?.notes ?? ""),
    updatedAt: now(),
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { uid } = await verifyBearer(req as unknown as Request);
    const { id } = await ctx.params;

    const ref = adminDb.collection("users").doc(uid).collection("drafts").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const raw = snap.data() as any;
    const draft = {
      id: snap.id,
      ...raw,
      instructionText: String(raw?.instructionText ?? raw?.rawInstruction ?? ""),
      note: String(raw?.note ?? raw?.notes ?? ""),
    };

    return NextResponse.json({ ok: true, draft });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 401 }
    );
  }
}

async function saveDraft(req: NextRequest, ctx: Ctx) {
  try {
    const { uid } = await verifyBearer(req as unknown as Request);
    const { id } = await ctx.params;

    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const ref = adminDb.collection("users").doc(uid).collection("drafts").doc(id);
    const normalized = normalizeDraftPatch(body);

    await ref.set(
      {
        ...normalized,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return saveDraft(req, ctx);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return saveDraft(req, ctx);
}
