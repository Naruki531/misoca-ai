// app/api/drafts/[id]/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { pdf } from "@react-pdf/renderer";
import { buildInvoicePdf, PdfData } from "@/lib/invoice/pdf";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function mustBearer(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) throw new Error("Unauthorized");
  return token;
}

function ymdToJa(ymd: string) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${y}年${m}月${d}日`;
}

/**
 * @react-pdf/renderer の出力が環境によって
 * - Buffer
 * - Uint8Array
 * - ReadableStream<Uint8Array>
 * のいずれかになり得るので Uint8Array に正規化する。
 */
async function renderPdfToBytes(doc: any): Promise<Uint8Array> {
  const out: any = pdf(doc);

  if (typeof out.toBuffer === "function") {
    const b = await out.toBuffer();

    // ReadableStream の場合
    if (b && typeof (b as any).getReader === "function") {
      const reader = (b as ReadableStream<Uint8Array>).getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const total = chunks.reduce((s, c) => s + c.byteLength, 0);
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.byteLength;
      }
      return bytes;
    }

    // Uint8Array の場合
    if (b instanceof Uint8Array) return b;

    // Buffer等の場合（Nodeでは Buffer は Uint8Array 互換）
    return new Uint8Array(b);
  }

  if (typeof out.toBlob === "function") {
    const blob = await out.toBlob();
    return new Uint8Array(await blob.arrayBuffer());
  }

  throw new Error("PDF render output method not found");
}

const resend = new Resend(mustEnv("RESEND_API_KEY"));
const FROM = mustEnv("MAIL_FROM");

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const token = mustBearer(req);
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await req.json();
    const toEmail = String(body?.toEmail ?? "").trim();
    if (!toEmail) {
      return NextResponse.json({ ok: false, error: "toEmail is required" }, { status: 400 });
    }

    const snap = await adminDb.doc(`users/${uid}/drafts/${id}`).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const d = snap.data() as any;

    const [issuerSnap, clientSnap] = await Promise.all([
      d.issuerId ? adminDb.doc(`users/${uid}/issuers/${d.issuerId}`).get() : Promise.resolve(null as any),
      d.clientId ? adminDb.doc(`users/${uid}/clients/${d.clientId}`).get() : Promise.resolve(null as any),
    ]);

    const issuer = issuerSnap?.exists ? (issuerSnap.data() as any) : { name: "" };
    const client = clientSnap?.exists ? (clientSnap.data() as any) : { name: "" };

    let bankText = "";
    if (Array.isArray(d.bankAccountIds) && d.bankAccountIds.length > 0) {
      const b0 = d.bankAccountIds[0];
      const bSnap = await adminDb.doc(`users/${uid}/bankAccounts/${b0}`).get();
      if (bSnap.exists) {
        const b = bSnap.data() as any;
        bankText = `${b.bankName} ${b.branchName}${b.branchCode ? `(${b.branchCode})` : ""} (${b.accountType})${b.accountNumber} ${b.accountName}`;
      }
    }

    const subTotal = Number(d.subTotal ?? 0);
    const taxTotal = Number(d.taxTotal ?? 0);
    const grandTotal = Number(d.grandTotal ?? 0);

    const data: PdfData = {
      issueDateText: ymdToJa(d.issueDate ?? ""),
      invoiceNo: d.invoiceNo ?? "",
      issuer: {
        name: issuer.name ?? "",
        postal: issuer.postal ?? issuer.postcode ?? "",
        address: issuer.address ?? "",
        tel: issuer.tel ?? issuer.contact ?? "",
        regNo: issuer.regNo ?? issuer.registrationNumber ?? "",
      },
      client: { name: client.name ?? "" },
      subject: d.subject ?? "",
      dueDateText: d.dueDate ? ymdToJa(d.dueDate) : "",
      currencyTotalText: `¥ ${grandTotal.toLocaleString("ja-JP")} -`,
      items: Array.isArray(d.items)
        ? d.items.map((it: any) => ({
            code: it.code ?? "",
            name: it.name ?? "",
            qty: Number(it.qty ?? 1),
            unitPrice: Number(it.unitPrice ?? 0),
            amount: Number(it.amount ?? 0),
          }))
        : [],
      subTotal,
      taxRate: 10,
      taxTotal,
      grandTotal,
      bankText,
    };

    // PDF生成 → Uint8Array → Buffer にして添付（Resend互換）
    const doc = buildInvoicePdf(data);
    const bytes = await renderPdfToBytes(doc);
    const attachment = Buffer.from(bytes);

    const subject = `請求書 ${data.invoiceNo || ""} ${data.subject || ""}`.trim();
    const html = `
      <div>
        <p>${client.name ? `${client.name} 様` : ""}</p>
        <p>請求書を送付いたします。添付PDFをご確認ください。</p>
        <p>請求番号: ${data.invoiceNo}</p>
        <p>件名: ${data.subject}</p>
        ${data.dueDateText ? `<p>お支払い期限: ${data.dueDateText}</p>` : ""}
        <p>ご請求金額: ${data.currencyTotalText}</p>
      </div>
    `;

    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject,
      html,
      attachments: [
        {
          filename: `invoice_${data.invoiceNo || id}.pdf`,
          content: attachment,
        },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}