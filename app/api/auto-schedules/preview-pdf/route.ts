import { NextRequest, NextResponse } from "next/server";
import * as ReactPdf from "@react-pdf/renderer";
import { verifyBearer } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { buildInvoicePdf, PdfData } from "@/lib/invoice/pdf";
import { applyTextRules } from "@/lib/automation/template";
import { resolveBlockRowValues } from "@/lib/automation/cellFormula";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ymdToJa(ymd: string) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${y}年${m}月${d}日`;
}

async function renderDocumentToBuffer(doc: any): Promise<Buffer> {
  const maybeRenderToBuffer = (ReactPdf as any).renderToBuffer;
  if (typeof maybeRenderToBuffer === "function") return await maybeRenderToBuffer(doc);
  const out = (ReactPdf as any).pdf(doc);
  const b = await out.toBuffer();
  if (Buffer.isBuffer(b)) return b;
  return Buffer.from(b);
}

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyBearer(req as unknown as Request);
    const body = await req.json().catch(() => ({}));

    const templateDraftId = String(body?.templateDraftId ?? "").trim();
    const runDate = String(body?.runDate ?? "").trim();
    if (!templateDraftId || !/^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
      return NextResponse.json({ ok: false, error: "templateDraftId and runDate are required" }, { status: 400 });
    }

    const rules = Array.isArray(body?.rules) ? body.rules : [];
    const blockKeys = Array.isArray(body?.blockKeys) ? body.blockKeys.map((x: any) => String(x)) : [];
    const blockRows = Array.isArray(body?.blockRows) ? body.blockRows : [];
    const row = blockRows.find((r: any) => String(r?.runDate) === runDate);
    const prev = blockRows.find((r: any) => String(r?.runDate) < runDate);
    const prevValues = resolveBlockRowValues(String(prev?.runDate || runDate), blockKeys, prev?.values || {}, {});
    const blockValues = resolveBlockRowValues(runDate, blockKeys, row?.values || {}, prevValues);

    const fieldTemplates = body?.fieldTemplates && typeof body.fieldTemplates === "object" ? body.fieldTemplates : {};

    const srcSnap = await adminDb.doc(`users/${uid}/drafts/${templateDraftId}`).get();
    if (!srcSnap.exists) {
      return NextResponse.json({ ok: false, error: "template_draft_not_found" }, { status: 404 });
    }
    const src = srcSnap.data() as any;

    const applyAll = (v: any) => {
      const withBlocks = String(v ?? "").replace(/\{\{(BLOCK_[0-9]+)\}\}/g, (_, k: string) => blockValues[k] ?? "");
      return applyTextRules(withBlocks, rules, runDate);
    };

    const items = Array.isArray(src.items)
      ? src.items.slice(0, 80).map((it: any, idx: number) => ({
          code: applyAll(fieldTemplates?.itemCodeTemplates?.[idx] ?? it?.code),
          name: applyAll(fieldTemplates?.itemNameTemplates?.[idx] ?? it?.name),
          qty: Number(it?.qty ?? 1),
          unit: applyAll(fieldTemplates?.itemUnitTemplates?.[idx] ?? it?.unit),
          unitPrice: Number(it?.unitPrice ?? 0),
          amount: Math.round(Number(it?.qty ?? 1) * Number(it?.unitPrice ?? 0)),
          taxRate: Number(it?.taxRate ?? src?.taxDefault ?? 10),
        }))
      : [];
    const subTotal = items.reduce((s, it) => s + Number(it.amount ?? 0), 0);
    const taxTotal = items.reduce((s, it) => s + Math.floor(Number(it.amount ?? 0) * (Number(it.taxRate ?? 10) / 100)), 0);
    const grandTotal = subTotal + taxTotal;

    const clientId = src?.clientId ?? "";
    const issuerId = src?.issuerId ?? "";
    const bankAccountIds = Array.isArray(src?.bankAccountIds) ? src.bankAccountIds : [];

    const [issuerSnap, clientSnap] = await Promise.all([
      issuerId ? adminDb.doc(`users/${uid}/issuers/${issuerId}`).get() : Promise.resolve(null as any),
      clientId ? adminDb.doc(`users/${uid}/clients/${clientId}`).get() : Promise.resolve(null as any),
    ]);
    const issuer = issuerSnap?.exists ? (issuerSnap.data() as any) : {};
    const client = clientSnap?.exists ? (clientSnap.data() as any) : {};

    let bankText = "";
    if (bankAccountIds[0]) {
      const bSnap = await adminDb.doc(`users/${uid}/bankAccounts/${bankAccountIds[0]}`).get();
      if (bSnap.exists) {
        const b = bSnap.data() as any;
        bankText = `${b.bankName} ${b.branchName}${b.branchCode ? `(${b.branchCode})` : ""} (${b.accountType})${b.accountNumber} ${b.accountName}`;
      }
    }

    const issueDate = applyAll(fieldTemplates?.issueDateTemplate ?? runDate);
    const dueDate = applyAll(fieldTemplates?.dueDateTemplate ?? (src?.dueDate || ""));
    const invoiceNo = applyAll(fieldTemplates?.invoiceNoTemplate ?? "");
    const subject = applyAll(fieldTemplates?.subjectTemplate ?? src?.subject);

    const pdfData: PdfData = {
      issueDateText: ymdToJa(issueDate),
      invoiceNo,
      issuer: {
        name: issuer.name ?? "",
        contactName: issuer.contactName ?? "",
        postal: issuer.postal ?? "",
        address: issuer.address ?? "",
        tel: issuer.tel ?? "",
        regNo: issuer.regNo ?? "",
      },
      client: { name: client.name ?? "" },
      subject,
      dueDateText: dueDate ? ymdToJa(dueDate) : "",
      currencyTotalText: `¥ ${Number(grandTotal).toLocaleString("ja-JP")} -`,
      items,
      subTotal,
      taxRate: Number(src?.taxDefault ?? 10),
      taxTotal,
      grandTotal,
      bankText,
    };

    const buffer = await renderDocumentToBuffer(buildInvoicePdf(pdfData));
    const ab = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(ab).set(buffer);
    return new NextResponse(ab, {
      headers: {
        "content-type": "application/pdf",
        "content-length": String(buffer.length),
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
