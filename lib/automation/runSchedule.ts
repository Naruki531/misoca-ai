import * as ReactPdf from "@react-pdf/renderer";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebase/admin";
import { buildInvoicePdf, PdfData } from "@/lib/invoice/pdf";
import { applyTextRules, buildDateTokens, nextMonthYmd, renderRuleTemplate } from "@/lib/automation/template";

export type AutoRule = {
  pattern: string;
  template: string;
};

export type AutoScheduleDoc = {
  name: string;
  templateDraftId: string;
  nextRunDate: string; // YYYY-MM-DD
  active: boolean;
  autoSend?: boolean;
  toEmail?: string;
  rules?: AutoRule[];
  fieldTemplates?: {
    subjectTemplate?: string;
    noteTemplate?: string;
    itemNameTemplates?: string[];
  } | null;
  blockRows?: Array<{ runDate: string; values: Record<string, string> }>;
  blockKeys?: string[];
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastRunStatus?: "ok" | "error";
  lastDraftId?: string;
  lastError?: string;
};

function ymdToJa(ymd: string) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${y}年${m}月${d}日`;
}

async function renderDocumentToBuffer(doc: any): Promise<Buffer> {
  const maybeRenderToBuffer = (ReactPdf as any).renderToBuffer;
  if (typeof maybeRenderToBuffer === "function") {
    return await maybeRenderToBuffer(doc);
  }
  const out = (ReactPdf as any).pdf(doc);
  if (!out || typeof out.toBuffer !== "function") {
    throw new Error("PDF render method not found");
  }
  const b = await out.toBuffer();
  if (Buffer.isBuffer(b)) return b;
  if (b instanceof Uint8Array) return Buffer.from(b);
  if (b && typeof b.getReader === "function") {
    const reader = (b as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks.map((x) => Buffer.from(x)));
  }
  return Buffer.from(b);
}

function withRules(value: any, rules: AutoRule[], runDate: string) {
  return applyTextRules(String(value ?? ""), rules, runDate);
}

function withBlocks(value: any, values: Record<string, string>) {
  return String(value ?? "").replace(/\{\{(BLOCK_[0-9]+)\}\}/g, (_, key: string) => {
    return values[key] ?? "";
  });
}

function calcTotals(items: any[]) {
  const subTotal = items.reduce((s, it) => s + Number(it.amount ?? 0), 0);
  const taxTotal = items.reduce((s, it) => s + Math.floor(Number(it.amount ?? 0) * (Number(it.taxRate ?? 10) / 100)), 0);
  return { subTotal, taxTotal, grandTotal: subTotal + taxTotal };
}

export async function runAutoSchedule(uid: string, scheduleId: string, runDate: string) {
  const scheduleRef = adminDb.doc(`users/${uid}/autoSchedules/${scheduleId}`);
  const scheduleSnap = await scheduleRef.get();
  if (!scheduleSnap.exists) throw new Error("schedule_not_found");
  const schedule = scheduleSnap.data() as AutoScheduleDoc;
  if (!schedule.active) throw new Error("schedule_inactive");

  const templateRef = adminDb.doc(`users/${uid}/drafts/${schedule.templateDraftId}`);
  const templateSnap = await templateRef.get();
  if (!templateSnap.exists) throw new Error("template_draft_not_found");
  const src = templateSnap.data() as any;

  const rules = Array.isArray(schedule.rules) ? schedule.rules : [];
  const blockRow = Array.isArray(schedule.blockRows)
    ? schedule.blockRows.find((r) => String(r?.runDate) === runDate)
    : null;
  const blockValues = blockRow?.values && typeof blockRow.values === "object"
    ? blockRow.values
    : {};
  const dateTokens = buildDateTokens(runDate);
  const expandedBlockValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(blockValues)) {
    expandedBlockValues[k] = renderRuleTemplate(String(v ?? ""), dateTokens);
  }
  const fieldTemplates = schedule.fieldTemplates ?? {};
  const applyAll = (v: any) => withRules(withBlocks(v, expandedBlockValues), rules, runDate);

  const items = Array.isArray(src.items)
    ? src.items.slice(0, 80).map((it: any, idx: number) => {
        const qty = Number(it?.qty ?? 1);
        const unitPrice = Number(it?.unitPrice ?? 0);
        const amount = Math.round(qty * unitPrice);
        const itemNameTemplate =
          Array.isArray(fieldTemplates?.itemNameTemplates) ? fieldTemplates.itemNameTemplates[idx] : undefined;
        return {
          id: String(it?.id ?? ""),
          code: applyAll(it?.code),
          name: applyAll(itemNameTemplate ?? it?.name),
          qty,
          unit: applyAll(it?.unit),
          unitPrice,
          taxRate: Number(it?.taxRate ?? src?.taxDefault ?? 10),
          amount,
        };
      })
    : [];
  const totals = calcTotals(items);

  const newDraft = {
    instructionText: applyAll(src?.instructionText),
    clientId: src?.clientId ?? "",
    issuerId: src?.issuerId ?? "",
    bankAccountIds: Array.isArray(src?.bankAccountIds)
      ? src.bankAccountIds.slice(0, 10).map((x: any) => String(x))
      : [],
    subject: applyAll(fieldTemplates?.subjectTemplate ?? src?.subject),
    issueDate: runDate,
    dueDate: src?.dueDate ? applyAll(src.dueDate) : "",
    invoiceNo: "",
    items,
    taxDefault: Number(src?.taxDefault ?? 10),
    subTotal: totals.subTotal,
    taxTotal: totals.taxTotal,
    grandTotal: totals.grandTotal,
    note: applyAll(fieldTemplates?.noteTemplate ?? src?.note),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sourceDraftId: schedule.templateDraftId,
    generatedByScheduleId: scheduleId,
  };

  const createdRef = await adminDb.collection(`users/${uid}/drafts`).add(newDraft);
  const createdDraftId = createdRef.id;

  let sentMail = false;
  if (schedule.autoSend && schedule.toEmail) {
    const [issuerSnap, clientSnap] = await Promise.all([
      newDraft.issuerId ? adminDb.doc(`users/${uid}/issuers/${newDraft.issuerId}`).get() : Promise.resolve(null as any),
      newDraft.clientId ? adminDb.doc(`users/${uid}/clients/${newDraft.clientId}`).get() : Promise.resolve(null as any),
    ]);
    const issuer = issuerSnap?.exists ? (issuerSnap.data() as any) : { name: "" };
    const client = clientSnap?.exists ? (clientSnap.data() as any) : { name: "" };

    let bankText = "";
    if (Array.isArray(newDraft.bankAccountIds) && newDraft.bankAccountIds.length > 0) {
      const bSnap = await adminDb.doc(`users/${uid}/bankAccounts/${newDraft.bankAccountIds[0]}`).get();
      if (bSnap.exists) {
        const b = bSnap.data() as any;
        bankText = `${b.bankName} ${b.branchName}${b.branchCode ? `(${b.branchCode})` : ""} (${b.accountType})${b.accountNumber} ${b.accountName}`;
      }
    }

    const pdfData: PdfData = {
      issueDateText: ymdToJa(newDraft.issueDate),
      invoiceNo: "",
      issuer: {
        name: issuer.name ?? "",
        contactName: issuer.contactName ?? "",
        postal: issuer.postal ?? "",
        address: issuer.address ?? "",
        tel: issuer.tel ?? "",
        regNo: issuer.regNo ?? "",
      },
      client: { name: client.name ?? "" },
      subject: newDraft.subject ?? "",
      dueDateText: newDraft.dueDate ? ymdToJa(newDraft.dueDate) : "",
      currencyTotalText: `¥ ${Number(newDraft.grandTotal ?? 0).toLocaleString("ja-JP")} -`,
      items: newDraft.items ?? [],
      subTotal: Number(newDraft.subTotal ?? 0),
      taxRate: Number(newDraft.taxDefault ?? 10),
      taxTotal: Number(newDraft.taxTotal ?? 0),
      grandTotal: Number(newDraft.grandTotal ?? 0),
      bankText,
    };

    const doc = buildInvoicePdf(pdfData);
    const attachment = await renderDocumentToBuffer(doc);

    const key = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;
    if (!key || !from) {
      throw new Error("auto_send_env_missing");
    }
    const resend = new Resend(key);
    await resend.emails.send({
      from,
      to: schedule.toEmail,
      subject: `請求書 ${newDraft.subject || ""}`.trim(),
      html: `
        <div>
          <p>${client.name ? `${client.name} 様` : ""}</p>
          <p>定期請求書を送付いたします。添付PDFをご確認ください。</p>
          <p>件名: ${newDraft.subject || ""}</p>
          <p>請求日: ${ymdToJa(newDraft.issueDate)}</p>
          ${newDraft.dueDate ? `<p>支払期限: ${ymdToJa(newDraft.dueDate)}</p>` : ""}
          <p>ご請求金額: ¥ ${Number(newDraft.grandTotal ?? 0).toLocaleString("ja-JP")} -</p>
        </div>
      `,
      attachments: [
        {
          filename: `invoice_${createdDraftId}.pdf`,
          content: attachment,
        },
      ],
    });
    sentMail = true;
  }

  await scheduleRef.set(
    {
      nextRunDate: nextMonthYmd(runDate),
      lastRunAt: Date.now(),
      lastRunStatus: "ok",
      lastDraftId: createdDraftId,
      lastError: "",
      updatedAt: Date.now(),
    },
    { merge: true }
  );

  return { createdDraftId, sentMail };
}
