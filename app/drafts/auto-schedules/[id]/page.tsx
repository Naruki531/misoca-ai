"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { getIdToken } from "@/lib/auth/client";
import { buildDateTokens, renderRuleTemplate } from "@/lib/automation/template";
import { resolveBlockRowValues } from "@/lib/automation/cellFormula";

type BlockRow = {
  runDate: string;
  values: Record<string, string>;
};

type BasePreviewItem = {
  code: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
};

const SPECIAL_BLOCK_KEYS = ["BLOCK_RUN_DATE", "BLOCK_RUN_EOM"];

function nextMonth(dateYmd: string, i: number) {
  const [y, m, d] = String(dateYmd || "").split("-").map((x) => Number(x));
  const base = Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) ? new Date(y, m - 1, d) : new Date();
  const dt = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function incrementFirstNumber(text: string, plus: number) {
  const m = String(text).match(/(\d+)/);
  if (!m) return text;
  const raw = m[1];
  const n = Number(raw);
  if (!Number.isFinite(n)) return text;
  const next = String(n + plus).padStart(raw.length, "0");
  return text.replace(raw, next);
}

function seriesValueByRunDate(seed: string, runDate: string, plus: number) {
  const s = String(seed ?? "");
  if (!s.trim()) return s;
  const rd = String(runDate ?? "").trim();
  if (!rd) return incrementFirstNumber(s, plus);
  const t = buildDateTokens(rd);
  let replaced = false;
  let out = s;

  out = out.replace(/(\d{4})年\s*(\d{1,2})月/g, (_, _y: string, m: string) => {
    replaced = true;
    const mm = m.length >= 2 ? t.MM : t.M;
    return `${t.YYYY}年${mm}月`;
  });
  out = out.replace(/(\d{4})([/-])(\d{1,2})(?!\d)/g, (_, _y: string, sep: string, m: string) => {
    replaced = true;
    const mm = m.length >= 2 ? t.MM : t.M;
    return `${t.YYYY}${sep}${mm}`;
  });
  out = out.replace(/(\d{1,2})月/g, (_, m: string) => {
    replaced = true;
    const mm = m.length >= 2 ? t.MM : t.M;
    return `${mm}月`;
  });
  if (replaced) return out;
  return incrementFirstNumber(s, plus);
}

export default function AutoScheduleEditPage() {
  const router = useRouter();
  const params = useParams();
  const scheduleId = String((params as any)?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [draggingBlock, setDraggingBlock] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState("");

  const [templateDraftId, setTemplateDraftId] = useState("");
  const [scheduleName, setScheduleName] = useState("");
  const [nextRunDate, setNextRunDate] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [toName, setToName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [recipients, setRecipients] = useState<Array<{ id: string; email: string; label?: string }>>([]);

  const [instructionTextTemplate, setInstructionTextTemplate] = useState("");
  const [subjectTemplate, setSubjectTemplate] = useState("");
  const [issueDateTemplate, setIssueDateTemplate] = useState("");
  const [dueDateTemplate, setDueDateTemplate] = useState("");
  const [invoiceNoTemplate, setInvoiceNoTemplate] = useState("");
  const [noteTemplate, setNoteTemplate] = useState("");
  const [itemCodeTemplates, setItemCodeTemplates] = useState<string[]>([]);
  const [itemNameTemplates, setItemNameTemplates] = useState<string[]>([]);
  const [itemUnitTemplates, setItemUnitTemplates] = useState<string[]>([]);
  const [previewItemsBase, setPreviewItemsBase] = useState<BasePreviewItem[]>([]);

  const [blockKeys, setBlockKeys] = useState<string[]>(["BLOCK_1", "BLOCK_2", "BLOCK_3"]);
  const [blockRows, setBlockRows] = useState<BlockRow[]>([]);
  const [compactMode, setCompactMode] = useState(true);
  const [rangeEndDate, setRangeEndDate] = useState("");
  const [fillMode, setFillMode] = useState<"copy" | "series">("copy");
  const [fillKey, setFillKey] = useState("BLOCK_1");

  function blockClass(key: string) {
    if (key === "BLOCK_RUN_DATE") return "blockTag blockTag6";
    if (key === "BLOCK_RUN_EOM") return "blockTag blockTag7";
    const n = (Number(key.replace("BLOCK_", "")) || 1) - 1;
    const idx = ((n % 8) + 8) % 8;
    return `blockTag blockTag${idx + 1}`;
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      await load();
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId]);

  useEffect(() => {
    return () => {
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    };
  }, [previewPdfUrl]);

  async function load() {
    if (!scheduleId) return;
    setLoading(true);
    setErr("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/auto-schedules/${scheduleId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `load failed: ${res.status}`);
      const s = j.schedule || {};

      setTemplateDraftId(String(s.templateDraftId ?? ""));
      setScheduleName(String(s.name ?? ""));
      setNextRunDate(String(s.nextRunDate ?? ""));
      setAutoSend(!!s.autoSend);
      setToName(String(s.toName ?? ""));
      setToEmail(String(s.toEmail ?? ""));

      const ft = s.fieldTemplates || {};
      setInstructionTextTemplate(String(ft.instructionTextTemplate ?? ""));
      setSubjectTemplate(String(ft.subjectTemplate ?? ""));
      setIssueDateTemplate(String(ft.issueDateTemplate ?? ""));
      setDueDateTemplate(String(ft.dueDateTemplate ?? ""));
      setInvoiceNoTemplate(String(ft.invoiceNoTemplate ?? ""));
      setNoteTemplate(String(ft.noteTemplate ?? ""));
      setItemCodeTemplates(Array.isArray(ft.itemCodeTemplates) ? ft.itemCodeTemplates.map((x: any) => String(x ?? "")) : []);
      setItemNameTemplates(Array.isArray(ft.itemNameTemplates) ? ft.itemNameTemplates.map((x: any) => String(x ?? "")) : []);
      setItemUnitTemplates(Array.isArray(ft.itemUnitTemplates) ? ft.itemUnitTemplates.map((x: any) => String(x ?? "")) : []);

      const keys =
        Array.isArray(s.blockKeys) && s.blockKeys.length > 0
          ? s.blockKeys.map((x: any) => String(x))
          : ["BLOCK_1", "BLOCK_2", "BLOCK_3"];
      setBlockKeys(keys);
      setFillKey(keys[0] || "BLOCK_1");

      if (Array.isArray(s.blockRows) && s.blockRows.length > 0) {
        setBlockRows(
          s.blockRows.map((r: any) => ({
            runDate: String(r?.runDate ?? ""),
            values: r?.values && typeof r.values === "object" ? r.values : {},
          }))
        );
      } else {
        setBlockRows(
          Array.from({ length: 3 }).map((_, i) => ({
            runDate: nextMonth(String(s.nextRunDate || ""), i),
            values: {},
          }))
        );
      }
      setRangeEndDate(nextMonth(String(s.nextRunDate || ""), 12));

      const [dRes, rRes] = await Promise.all([
        fetch(`/api/drafts/${String(s.templateDraftId ?? "")}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch("/api/recipients", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);

      const rj = await rRes.json().catch(() => ({}));
      if (rRes.ok && rj?.ok) {
        setRecipients(
          Array.isArray(rj.recipients)
            ? rj.recipients.map((x: any) => ({ id: String(x.id ?? ""), email: String(x.email ?? ""), label: x.label ? String(x.label) : "" }))
            : []
        );
      }

      const dj = await dRes.json().catch(() => ({}));
      if (dRes.ok && dj?.ok) {
        const src = dj?.draft || {};
        const srcItems = Array.isArray(src.items) ? src.items : [];
        setPreviewItemsBase(
          srcItems.map((it: any) => ({
            code: String(it?.code ?? ""),
            name: String(it?.name ?? ""),
            qty: Number(it?.qty ?? 1),
            unit: String(it?.unit ?? ""),
            unitPrice: Number(it?.unitPrice ?? 0),
            taxRate: Number(it?.taxRate ?? 10),
          }))
        );
        if (!instructionTextTemplate) setInstructionTextTemplate(String(src?.instructionText ?? ""));
        if (!subjectTemplate) setSubjectTemplate(String(src?.subject ?? ""));
        if (!issueDateTemplate) setIssueDateTemplate(String(src?.issueDate ?? ""));
        if (!dueDateTemplate) setDueDateTemplate(String(src?.dueDate ?? ""));
        if (!invoiceNoTemplate) setInvoiceNoTemplate(String(src?.invoiceNo ?? ""));
        if (!noteTemplate) setNoteTemplate(String(src?.note ?? ""));
        if (itemCodeTemplates.length === 0) setItemCodeTemplates(srcItems.map((it: any) => String(it?.code ?? "")));
        if (itemNameTemplates.length === 0) setItemNameTemplates(srcItems.map((it: any) => String(it?.name ?? "")));
        if (itemUnitTemplates.length === 0) setItemUnitTemplates(srcItems.map((it: any) => String(it?.unit ?? "")));
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function insertToken(
    target: "instructionText" | "subject" | "issueDate" | "dueDate" | "invoiceNo" | "note" | "itemCode" | "itemName" | "itemUnit",
    idx: number | string,
    blockKey: string
  ) {
    const token = `{{${blockKey}}}`;
    if (target === "instructionText") return setInstructionTextTemplate((p) => `${p}${token}`);
    if (target === "subject") return setSubjectTemplate((p) => `${p}${token}`);
    if (target === "issueDate") return setIssueDateTemplate((p) => `${p}${token}`);
    if (target === "dueDate") return setDueDateTemplate((p) => `${p}${token}`);
    if (target === "invoiceNo") return setInvoiceNoTemplate((p) => `${p}${token}`);
    if (target === "note") return setNoteTemplate((p) => `${p}${token}`);
    const i = Number(idx);
    if (target === "itemCode") {
      return setItemCodeTemplates((prev) => {
        const next = prev.slice();
        next[i] = `${next[i] ?? ""}${token}`;
        return next;
      });
    }
    if (target === "itemName") {
      return setItemNameTemplates((prev) => {
        const next = prev.slice();
        next[i] = `${next[i] ?? ""}${token}`;
        return next;
      });
    }
    return setItemUnitTemplates((prev) => {
      const next = prev.slice();
      next[i] = `${next[i] ?? ""}${token}`;
      return next;
    });
  }

  function onDrop(
    target: "instructionText" | "subject" | "issueDate" | "dueDate" | "invoiceNo" | "note" | "itemCode" | "itemName" | "itemUnit",
    idx: number | string,
    e: any
  ) {
    e.preventDefault();
    const key = e.dataTransfer.getData("text/plain") || draggingBlock;
    if (!key) return;
    insertToken(target, idx, key);
    setDraggingBlock("");
  }

  function addBlock() {
    const n = blockKeys.length + 1;
    setBlockKeys((prev) => [...prev, `BLOCK_${n}`]);
  }

  function addRow() {
    setBlockRows((prev) => [
      ...prev,
      { runDate: nextMonth(nextRunDate || prev[prev.length - 1]?.runDate || "", 1), values: {} },
    ]);
  }

  function generateRowsUntilDate() {
    const start = nextRunDate || blockRows[0]?.runDate;
    if (!start || !rangeEndDate) return;
    const dates: string[] = [];
    for (let i = 0; i < 240; i++) {
      const d = nextMonth(start, i);
      if (d > rangeEndDate) break;
      dates.push(d);
    }
    setBlockRows((prev) => {
      const map = new Map<string, BlockRow>();
      for (const r of prev) map.set(r.runDate, r);
      return dates.map((d) => map.get(d) || { runDate: d, values: {} });
    });
  }

  function applyFillSelectedKey() {
    setBlockRows((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.map((r) => ({ ...r, values: { ...(r.values || {}) } }));
      let seedIdx = next.findIndex((r) => String(r.values?.[fillKey] ?? "").trim() !== "");
      if (seedIdx < 0) seedIdx = 0;
      const seed = String(next[seedIdx].values?.[fillKey] ?? "");
      if (!seed) return prev;
      for (let i = seedIdx + 1; i < next.length; i++) {
        next[i].values[fillKey] =
          fillMode === "copy" ? seed : seriesValueByRunDate(seed, String(next[i].runDate ?? ""), i - seedIdx);
      }
      return next;
    });
  }

  async function addRecipient() {
    try {
      const label = (window.prompt("送信先名（必須）", "") || "").trim();
      if (!label) return setErr("送信先名は必須です");
      const email = (window.prompt("送信先メールアドレス（必須）", "") || "").trim().toLowerCase();
      if (!email || !email.includes("@")) return setErr("送信先メールアドレスが不正です");
      const token = await getIdToken();
      const res = await fetch("/api/recipients", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label, email }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `recipient add failed: ${res.status}`);
      setRecipients((prev) => (prev.some((r) => r.email === email) ? prev : [...prev, { id: String(j.id ?? email), email, label }]));
      setToName(label);
      setToEmail(email);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  const preview = useMemo(() => {
    const row = blockRows[0];
    const runDate = row?.runDate || nextRunDate || nextMonth("", 0);
    const values = resolveBlockRowValues(runDate, blockKeys, row?.values || {}, {});
    values.BLOCK_RUN_DATE = runDate;
    const eom = new Date(runDate.slice(0, 4) as any, Number(runDate.slice(5, 7)), 0);
    values.BLOCK_RUN_EOM = `${eom.getFullYear()}-${String(eom.getMonth() + 1).padStart(2, "0")}-${String(eom.getDate()).padStart(2, "0")}`;
    const apply = (text: string) => String(text ?? "").replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, k: string) => values[k] ?? "");
    const items = previewItemsBase.map((it, i) => {
      const code = apply(itemCodeTemplates[i] || it.code || "");
      const name = apply(itemNameTemplates[i] || it.name || "");
      const unit = apply(itemUnitTemplates[i] || it.unit || "");
      const amount = Math.round(Number(it.qty || 0) * Number(it.unitPrice || 0));
      return { ...it, code, name, unit, amount };
    });
    const subTotal = items.reduce((s, it) => s + Number((it as any).amount || 0), 0);
    const taxTotal = items.reduce((s, it) => s + Math.floor(Number((it as any).amount || 0) * (Number(it.taxRate || 10) / 100)), 0);
    const grandTotal = subTotal + taxTotal;
    return {
      runDate,
      issueDate: apply(issueDateTemplate || runDate),
      dueDate: apply(dueDateTemplate || ""),
      invoiceNo: apply(invoiceNoTemplate || ""),
      subject: apply(subjectTemplate),
      note: apply(noteTemplate),
      tokenPreview: renderRuleTemplate("{{MONTH_LABEL}}", buildDateTokens(runDate)),
      items,
      subTotal,
      taxTotal,
      grandTotal,
    };
  }, [blockRows, nextRunDate, blockKeys, issueDateTemplate, dueDateTemplate, invoiceNoTemplate, subjectTemplate, noteTemplate, itemCodeTemplates, itemNameTemplates, itemUnitTemplates, previewItemsBase]);

  async function refreshPdfPreview() {
    try {
      setPreviewLoading(true);
      setErr("");
      const token = await getIdToken();
      const runDate = blockRows[0]?.runDate || nextRunDate;
      if (!runDate) throw new Error("プレビュー用の実行日がありません");
      const res = await fetch("/api/auto-schedules/preview-pdf", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          templateDraftId,
          runDate,
          blockKeys,
          blockRows,
          fieldTemplates: {
            instructionTextTemplate,
            subjectTemplate,
            issueDateTemplate,
            dueDateTemplate,
            invoiceNoTemplate,
            noteTemplate,
            itemCodeTemplates,
            itemNameTemplates,
            itemUnitTemplates,
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/auto-schedules/${scheduleId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: scheduleName,
          nextRunDate,
          autoSend,
          toName,
          toEmail,
          blockKeys,
          blockRows,
          fieldTemplates: {
            instructionTextTemplate,
            subjectTemplate,
            issueDateTemplate,
            dueDateTemplate,
            invoiceNoTemplate,
            noteTemplate,
            itemCodeTemplates,
            itemNameTemplates,
            itemUnitTemplates,
          },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `save failed: ${res.status}`);
      setMsg("保存しました");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="page"><div className="container"><div className="card"><div className="cardBody">読み込み中…</div></div></div></div>;
  }

  return (
    <div className="page">
      <div className="container">
        <div className="topBar">
          <div>
            <h1>自動予約設定</h1>
            <div className="sub">ブロックを差し込み、規則セルで値を制御します</div>
          </div>
          <div className="topActions">
            <button className="btnOutline" onClick={() => router.push("/drafts")} type="button">一覧へ戻る</button>
            <button className="btn" onClick={save} disabled={saving} type="button">{saving ? "保存中…" : "保存"}</button>
          </div>
        </div>

        {msg ? <div className="toast ok">{msg}</div> : null}
        {err ? <div className="toast err">{err}</div> : null}

        <section className="card">
          <div className="cardHead"><h3>基本設定</h3></div>
          <div className="cardBody">
            <div className="formGrid">
              <div className="field"><label>予約名</label><input className="input" value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} /></div>
              <div className="field"><label>次回作成日</label><input className="input" type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} /></div>
              <div className="field"><label>自動送信</label><select className="input" value={autoSend ? "on" : "off"} onChange={(e) => setAutoSend(e.target.value === "on")}><option value="off">OFF</option><option value="on">ON</option></select></div>
              <div className="field"><label>送信先名</label><input className="input" value={toName} onChange={(e) => setToName(e.target.value)} /></div>
              <div className="field">
                <label>送信先メール</label>
                <div className="row">
                  <select
                    className="input"
                    value={toEmail}
                    onChange={(e) => {
                      const v = e.target.value;
                      setToEmail(v);
                      const hit = recipients.find((r) => r.email === v);
                      if (hit?.label) setToName(hit.label);
                    }}
                  >
                    <option value="">選択</option>
                    {recipients.map((r) => <option key={r.id} value={r.email}>{r.label ? `${r.label} <${r.email}>` : r.email}</option>)}
                  </select>
                  <button className="miniBtn" onClick={addRecipient} type="button">＋登録</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="cardHead">
            <h3>ブロックパレット</h3>
            <button className="miniBtn" onClick={addBlock} type="button">＋ブロック追加</button>
          </div>
          <div className="cardBody">
            <div className="btnRow">
              {[...SPECIAL_BLOCK_KEYS, ...blockKeys].map((key) => (
                <button key={key} className={blockClass(key)} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", key); setDraggingBlock(key); }} type="button">{key}</button>
              ))}
              <div className="hint">特別ブロック: {"{{BLOCK_RUN_DATE}}"}（自動作成日） / {"{{BLOCK_RUN_EOM}}"}（その月末日）</div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="cardHead"><h3>請求書テンプレート（全項目）</h3></div>
          <div className="cardBody">
            <div className="field"><label>指示文テンプレート</label><textarea className="textarea" rows={3} value={instructionTextTemplate} onChange={(e) => setInstructionTextTemplate(e.target.value)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop("instructionText", 0, e)} /></div>
            <div className="field" style={{ marginTop: 10 }}><label>件名</label><input className="input" value={subjectTemplate} onChange={(e) => setSubjectTemplate(e.target.value)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop("subject", 0, e)} /></div>
            <div className="formGrid" style={{ marginTop: 10 }}>
              <div className="field"><label>請求日テンプレート</label><input className="input" value={issueDateTemplate} onChange={(e) => setIssueDateTemplate(e.target.value)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop("issueDate", 0, e)} /></div>
              <div className="field"><label>支払期限テンプレート</label><input className="input" value={dueDateTemplate} onChange={(e) => setDueDateTemplate(e.target.value)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop("dueDate", 0, e)} /></div>
            </div>
            <div className="field" style={{ marginTop: 10 }}><label>請求書番号テンプレート</label><input className="input" value={invoiceNoTemplate} onChange={(e) => setInvoiceNoTemplate(e.target.value)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop("invoiceNo", 0, e)} /></div>
            <div className="field" style={{ marginTop: 10 }}><label>備考</label><textarea className="textarea" value={noteTemplate} onChange={(e) => setNoteTemplate(e.target.value)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop("note", 0, e)} /></div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>明細テンプレート（品番/品名/単位）</label>
              <div style={{ display: "grid", gap: 6 }}>
                {itemNameTemplates.map((v, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr 120px", gap: 6 }}>
                    <input className="input" value={itemCodeTemplates[i] ?? ""} onChange={(e) => setItemCodeTemplates((p) => { const n = p.slice(); n[i] = e.target.value; return n; })} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop("itemCode", i, e)} placeholder="品番" />
                    <input className="input" value={v} onChange={(e) => setItemNameTemplates((p) => { const n = p.slice(); n[i] = e.target.value; return n; })} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop("itemName", i, e)} placeholder="品名" />
                    <input className="input" value={itemUnitTemplates[i] ?? ""} onChange={(e) => setItemUnitTemplates((p) => { const n = p.slice(); n[i] = e.target.value; return n; })} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop("itemUnit", i, e)} placeholder="単位" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="cardHead">
            <h3>規則セル（発行日 × ブロック）</h3>
            <div className="topActions">
              <button className="miniBtn" onClick={addRow} type="button">＋行追加</button>
              <label className="hint2" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={compactMode} onChange={(e) => setCompactMode(e.target.checked)} />
                コンパクト表示
              </label>
            </div>
          </div>
          <div className="cardBody">
            <div className="btnRow" style={{ marginBottom: 8 }}>
              <div className="row">
                <div className="hint2">行生成 終了日:</div>
                <input className="input" style={{ width: 160 }} type="date" value={rangeEndDate} onChange={(e) => setRangeEndDate(e.target.value)} />
                <button className="miniBtn" onClick={generateRowsUntilDate} type="button">この日付まで行生成</button>
              </div>
              <div className="row">
                <div className="hint2">オートフィル:</div>
                <select className="input" style={{ width: 140 }} value={fillMode} onChange={(e) => setFillMode(e.target.value as any)}>
                  <option value="copy">同一コピー</option>
                  <option value="series">連番コピー</option>
                </select>
                <select className="input" style={{ width: 140 }} value={fillKey} onChange={(e) => setFillKey(e.target.value)}>
                  {blockKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <button className="miniBtn" onClick={applyFillSelectedKey} type="button">適用</button>
              </div>
            </div>

            <div className={`tableWrap ${compactMode ? "compactRuleGrid" : ""}`}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>自動作成日</th>
                    {blockKeys.map((k) => (
                      <th key={k}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className={blockClass(k)} style={{ cursor: "default" }}>{k}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {blockRows.map((r, idx) => (
                    <tr key={idx}>
                      <td><input className="input" type="date" value={r.runDate} onChange={(e) => setBlockRows((p) => { const n = p.slice(); n[idx] = { ...n[idx], runDate: e.target.value }; return n; })} /></td>
                      {blockKeys.map((k) => (
                        <td key={k}>
                          <input className={`input ${compactMode ? "compactInput" : ""}`} value={String(r.values?.[k] ?? "")} onChange={(e) => setBlockRows((p) => { const n = p.slice(); const row = n[idx]; n[idx] = { ...row, values: { ...(row.values || {}), [k]: e.target.value } }; return n; })} placeholder={`例: ${k === "BLOCK_1" ? "{{MONTH_LABEL}}" : ""}`} />
                          {!compactMode ? <div className="hint2" style={{ marginTop: 4 }}>例: {renderRuleTemplate(String(r.values?.[k] ?? ""), buildDateTokens(r.runDate || nextRunDate || nextMonth("", 0)))}</div> : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>セルでは {"{{MONTH_LABEL}}"}, {"{{YYYY}}"}, {"{{MM}}"} などが使えます。</div>
          </div>
        </section>

        <section className="card">
          <div className="cardHead"><h3>請求書プレビュー（PDF全体）</h3></div>
          <div className="cardBody">
            <div className="btnRow" style={{ marginBottom: 8 }}>
              <button className="btn" onClick={refreshPdfPreview} disabled={previewLoading} type="button">
                {previewLoading ? "PDF生成中…" : "PDF全体プレビュー更新"}
              </button>
            </div>
            <div className="hint">自動作成日: {preview.runDate} / 請求日: {preview.issueDate || "-"} / 支払期限: {preview.dueDate || "-"}</div>
            <div className="hint">請求書番号: {preview.invoiceNo || "-"} / DATEトークン例: {"{{MONTH_LABEL}}"} → {preview.tokenPreview}</div>
            <div style={{ marginTop: 12 }}>
              {previewPdfUrl ? (
                <iframe title="invoice-pdf-preview" src={previewPdfUrl} style={{ width: "100%", height: "980px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff" }} />
              ) : (
                <div className="hint">「PDF全体プレビュー更新」を押すと、実際の出力PDF全体が表示されます。</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
