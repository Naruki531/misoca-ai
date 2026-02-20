// app/drafts/[id]/page.tsx
"use client";

export const dynamic = "force-dynamic";

import "./drafts.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { getIdToken } from "@/lib/auth/client";

type Client = { id: string; name: string };
type Issuer = { id: string; name: string; detail?: string; address?: string; contact?: string };
type BankAccount = {
  id: string;
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountName: string;
};

type DraftItem = {
  id: string;
  code: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxRate: number; // 10 / 8 / 0
  amount: number; // qty * unitPrice
};

type Draft = {
  clientId: string | null;
  issueDate: string; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
  invoiceNo: string;
  subject: string;

  issuerId: string | null;

  items: DraftItem[];

  subTotal: number;
  taxTotal: number;
  grandTotal: number;

  notes: string;

  bankAccountIds: string[];
  rawInstruction: string;
};

type AiParsed = {
  clientName: string;
  subject: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string | null;
  notes?: string;
  items: Array<{
    code?: string;
    name: string;
    qty: number;
    unit?: string;
    unitPrice: number;
    taxRate?: number;
  }>;
};

function safeNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function calcTotals(items: DraftItem[]) {
  let subTotal = 0;
  let taxTotal = 0;

  for (const it of items) {
    const amount = safeNumber(it.amount);
    subTotal += amount;

    const rate = safeNumber(it.taxRate);
    taxTotal += Math.floor(amount * (rate / 100));
  }

  const grandTotal = subTotal + taxTotal;
  return { subTotal, taxTotal, grandTotal };
}

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function newItem(): DraftItem {
  return {
    id: crypto.randomUUID(),
    code: "",
    name: "",
    qty: 1,
    unit: "",
    unitPrice: 0,
    taxRate: 10, // デフォ10%
    amount: 0,
  };
}

function normalizeName(s: string) {
  return (s ?? "")
    .toString()
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

export default function DraftEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const draftId = params.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [clients, setClients] = useState<Client[]>([]);
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);

  const [draft, setDraft] = useState<Draft>({
    clientId: null,
    issueDate: todayYYYYMMDD(),
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
  });

  const totals = useMemo(() => calcTotals(draft.items), [draft.items]);

  const saveTimer = useRef<any>(null);
  const isDirty = useRef(false);

  const [aiLoading, setAiLoading] = useState(false);

  function markDirty(next: Draft) {
    isDirty.current = true;
    setDraft(next);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (isDirty.current) void saveDraft(next, true);
    }, 800);
  }

  async function apiFetch(path: string, init?: RequestInit) {
    const token = await getIdToken();
    const headers: any = { ...(init?.headers ?? {}) };
    headers.authorization = `Bearer ${token}`;
    return await fetch(path, { ...init, headers });
  }

  async function loadMasters() {
    const [c, i, b] = await Promise.all([
      apiFetch("/api/clients").then((r) => r.json()),
      apiFetch("/api/issuers").then((r) => r.json()),
      apiFetch("/api/bank-accounts").then((r) => r.json()),
    ]);
    if (c?.ok) setClients(c.clients ?? []);
    if (i?.ok) setIssuers(i.issuers ?? []);
    if (b?.ok) setBanks(b.bankAccounts ?? []);
  }

  async function loadDraft() {
    const res = await apiFetch(`/api/drafts/${draftId}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);

    const d = json.draft ?? {};

    const items: DraftItem[] = Array.isArray(d.items)
      ? d.items.map((it: any) => {
          const qty = safeNumber(it.qty);
          const unitPrice = safeNumber(it.unitPrice);
          const amount = Math.floor(qty * unitPrice);
          return {
            id: (it.id ?? crypto.randomUUID()).toString(),
            code: (it.code ?? "").toString(),
            name: (it.name ?? "").toString(),
            qty,
            unit: (it.unit ?? "").toString(),
            unitPrice,
            taxRate: Number.isFinite(Number(it.taxRate)) ? Number(it.taxRate) : 10,
            amount,
          };
        })
      : [];

    const t = calcTotals(items);

    setDraft({
      clientId: d.clientId ?? null,
      issueDate: d.issueDate ?? todayYYYYMMDD(),
      dueDate: d.dueDate ?? null,
      invoiceNo: d.invoiceNo ?? "",
      subject: d.subject ?? "",
      issuerId: d.issuerId ?? null,
      items,
      subTotal: safeNumber(d.subTotal) || t.subTotal,
      taxTotal: safeNumber(d.taxTotal) || t.taxTotal,
      grandTotal: safeNumber(d.grandTotal) || t.grandTotal,
      notes: d.notes ?? "",
      bankAccountIds: Array.isArray(d.bankAccountIds) ? d.bankAccountIds : [],
      rawInstruction: d.rawInstruction ?? "",
    });

    isDirty.current = false;
  }

  async function saveDraft(payload: Draft, silent = false) {
    try {
      const computed = calcTotals(payload.items);
      const body = {
        ...payload,
        ...computed,
        items: payload.items.map((it) => ({
          ...it,
          qty: safeNumber(it.qty),
          unitPrice: safeNumber(it.unitPrice),
          taxRate: safeNumber(it.taxRate),
          amount: Math.floor(safeNumber(it.qty) * safeNumber(it.unitPrice)),
        })),
      };

      const res = await apiFetch(`/api/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      isDirty.current = false;
      if (!silent) setMsg(`保存した: ${draftId}`);
    } catch (e: any) {
      if (!silent) setMsg("保存失敗: " + (e.message ?? e));
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      try {
        setLoading(true);
        setMsg("");
        await loadMasters();
        await loadDraft();
      } catch (e: any) {
        setMsg("読み込み失敗: " + (e.message ?? e));
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  async function addClient() {
    const name = window.prompt("取引先名（必須）");
    if (!name) return;
    const res = await apiFetch("/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (!json.ok) return setMsg("取引先追加失敗: " + json.error);
    await loadMasters();
    markDirty({ ...draft, clientId: json.id });
  }

  async function addIssuer() {
    const name = window.prompt("自社名（1行目必須）");
    if (!name) return;
    const detail = window.prompt("請求元詳細（任意）") ?? "";
    const address = window.prompt("住所（任意）") ?? "";
    const contact = window.prompt("連絡先（任意）") ?? "";

    const res = await apiFetch("/api/issuers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, detail, address, contact }),
    });
    const json = await res.json();
    if (!json.ok) return setMsg("請求元追加失敗: " + json.error);
    await loadMasters();
    markDirty({ ...draft, issuerId: json.id });
  }

  async function addBank() {
    const bankName = window.prompt("銀行名");
    if (!bankName) return;
    const branchName = window.prompt("支店名");
    if (!branchName) return;
    const accountType = window.prompt("口座種別（例：普通）");
    if (!accountType) return;
    const accountNumber = window.prompt("口座番号");
    if (!accountNumber) return;
    const accountName = window.prompt("口座名義");
    if (!accountName) return;

    const res = await apiFetch("/api/bank-accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bankName, branchName, accountType, accountNumber, accountName }),
    });
    const json = await res.json();
    if (!json.ok) return setMsg("振込先追加失敗: " + json.error);
    await loadMasters();
  }

  async function generateInvoiceNo() {
    try {
      const res = await apiFetch("/api/invoices/next-number", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ issueDate: draft.issueDate }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      markDirty({ ...draft, invoiceNo: json.invoiceNo });
    } catch (e: any) {
      setMsg("採番失敗: " + (e.message ?? e));
    }
  }

  function updateItem(idx: number, patch: Partial<DraftItem>) {
    const items = [...draft.items];
    const cur = items[idx];
    const next: DraftItem = { ...cur, ...patch };
    const qty = safeNumber(next.qty);
    const unitPrice = safeNumber(next.unitPrice);
    next.qty = qty;
    next.unitPrice = unitPrice;
    next.taxRate = safeNumber(next.taxRate) || 0;
    next.amount = Math.floor(qty * unitPrice);
    items[idx] = next;
    markDirty({ ...draft, items });
  }

  function addItemRow() {
    if (draft.items.length >= 80) return setMsg("明細は最大80行まで");
    markDirty({ ...draft, items: [...draft.items, newItem()] });
  }

  function removeItemRow(idx: number) {
    const items = draft.items.filter((_, i) => i !== idx);
    markDirty({ ...draft, items });
  }

  function toggleBank(id: string) {
    const exists = draft.bankAccountIds.includes(id);
    let next = exists ? draft.bankAccountIds.filter((x) => x !== id) : [...draft.bankAccountIds, id];
    if (next.length > 10) return setMsg("振込先は最大10件まで");
    markDirty({ ...draft, bankAccountIds: next });
  }

  // ✅ AI解析→フォーム反映
  async function applyAiToForm(mode: "replace" | "append") {
    try {
      const text = (draft.rawInstruction ?? "").trim();
      if (!text) return setMsg("指示文が空");

      setAiLoading(true);
      setMsg("");

      const res = await apiFetch("/api/ai/parse-invoice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instructionText: text }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      const ai: AiParsed = json.data;

      // 取引先名 -> clients から突合（完全一致寄り）
      let nextClientId: string | null = draft.clientId;
      const aiClientKey = normalizeName(ai.clientName);
      if (aiClientKey) {
        const hit = clients.find((c) => normalizeName(c.name) === aiClientKey);
        if (hit) nextClientId = hit.id;
        // 見つからない場合は「未選択のまま」(後で自動登録も可能)
      }

      // items 反映
      const aiItems: DraftItem[] = (ai.items ?? []).slice(0, 80).map((it) => {
        const qty = safeNumber(it.qty) || 1;
        const unitPrice = safeNumber(it.unitPrice);
        const taxRate = [10, 8, 0].includes(Number(it.taxRate)) ? Number(it.taxRate) : 10; // デフォ10%
        const amount = Math.floor(qty * unitPrice);
        return {
          id: crypto.randomUUID(),
          code: String(it.code ?? ""),
          name: String(it.name ?? ""),
          qty,
          unit: String(it.unit ?? ""),
          unitPrice,
          taxRate,
          amount,
        };
      });

      const mergedItems =
        mode === "append" ? [...draft.items, ...aiItems].slice(0, 80) : aiItems;

      const nextDraft: Draft = {
        ...draft,
        clientId: nextClientId,
        subject: String(ai.subject ?? draft.subject).slice(0, 70),
        issueDate: String(ai.issueDate ?? draft.issueDate),
        dueDate: ai.dueDate ?? draft.dueDate,
        notes: ai.notes ? [draft.notes, ai.notes].filter(Boolean).join("\n") : draft.notes,
        items: mergedItems,
      };

      // 合計再計算して stateへ → 即保存
      const t = calcTotals(nextDraft.items);
      const finalDraft = { ...nextDraft, ...t };
      setDraft(finalDraft);
      await saveDraft(finalDraft, false);

      // 取引先が見つからなかった場合の注意
      if (aiClientKey && !nextClientId) {
        setMsg(`AIが取引先「${ai.clientName}」を抽出したが、マスタに未登録。右上の取引先から選択 or +登録してくれ。`);
      } else {
        setMsg("AI反映→保存 完了");
      }
    } catch (e: any) {
      setMsg("AI反映失敗: " + (e.message ?? e));
    } finally {
      setAiLoading(false);
    }
  }

  // UI style（そのまま）
  const S = {
    page: { background: "#f5f7fb", minHeight: "100vh", padding: "18px 12px", color: "#0f172a" } as const,
    container: { maxWidth: 1180, margin: "0 auto" } as const,
    topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 } as const,
    title: { fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: 0.2 } as const,
    sub: { fontSize: 12, color: "#64748b", marginTop: 2 } as const,
    msg: { margin: "10px 0", padding: "10px 12px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontSize: 13 } as const,
    card: { background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 1px 0 rgba(15, 23, 42, 0.04)", overflow: "hidden" } as const,
    cardHead: (accent: string) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid #e2e8f0", borderLeft: `4px solid ${accent}` } as const),
    cardTitle: { fontSize: 14, fontWeight: 800, margin: 0 } as const,
    cardBody: { padding: 12 } as const,
    pill: { fontSize: 12, padding: "4px 8px", borderRadius: 999, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#334155" } as const,
    label: { display: "block", fontSize: 12, color: "#475569", marginBottom: 6, fontWeight: 700 } as const,
    input: { width: "100%", height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid #cbd5e1", outline: "none", background: "#fff" } as const,
    textarea: { width: "100%", minHeight: 140, padding: 10, borderRadius: 12, border: "1px solid #cbd5e1", outline: "none", background: "#fff", lineHeight: 1.45 } as const,
    row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } as const,
    row3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 } as const,
    btn: (kind: "primary" | "ghost" | "danger") =>
      ({
        height: 36,
        padding: "0 12px",
        borderRadius: 10,
        border:
          kind === "primary"
            ? "1px solid #0f766e"
            : kind === "danger"
            ? "1px solid #dc2626"
            : "1px solid #cbd5e1",
        background:
          kind === "primary"
            ? "#0f766e"
            : kind === "danger"
            ? "#dc2626"
            : "#fff",
        color: kind === "primary" || kind === "danger" ? "#fff" : "#0f172a",
        fontWeight: 800,
        cursor: "pointer",
        whiteSpace: "nowrap",
        opacity: aiLoading && (kind === "primary" || kind === "danger") ? 0.6 : 1,
      } as const),
    tableWrap: { overflowX: "auto" as const, border: "1px solid #e2e8f0", borderRadius: 12 },
    table: { width: "100%", borderCollapse: "collapse" as const, background: "#fff", minWidth: 900 } as const,
    th: { textAlign: "left" as const, fontSize: 12, color: "#334155", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "10px 8px", whiteSpace: "nowrap" as const } as const,
    td: { borderBottom: "1px solid #eef2f7", padding: "8px", verticalAlign: "top" as const } as const,
    mini: { height: 32, borderRadius: 10, border: "1px solid #cbd5e1", padding: "0 8px", outline: "none", width: "100%" } as const,
    rightTotals: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "center", fontSize: 13 } as const,
    bigTotal: { fontSize: 18, fontWeight: 900 } as const,
    hint: { fontSize: 12, color: "#64748b", marginTop: 6 } as const,
  };

  if (loading) {
    return (
      <div className="pagePad" style={S.page}>
        <div style={S.container}>
          <h1 style={S.title}>請求書 下書き</h1>
          <p style={S.sub}>読み込み中…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pagePad" style={S.page}>
      <div style={S.container}>
        <div style={S.topBar}>
          <div>
            <h1 style={S.title}>請求書 下書き</h1>
            <div style={S.sub}>下書きID: {draftId}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={S.pill}>税区分デフォルト: 10%</span>
            <button type="button" style={S.btn("primary")} onClick={() => saveDraft({ ...draft, ...totals }, false)}>
              保存(API経由)
            </button>
          </div>
        </div>

        {msg && <div style={S.msg}>{msg}</div>}

        {/* 指示文（AI） */}
        <div style={{ ...S.card, marginBottom: 12 }}>
          <div style={S.cardHead("#2563eb")}>
            <div>
              <p style={S.cardTitle}>指示文（AI自動記載用）</p>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                貼り付け → 「AIで反映」 → フォームに埋める（明細デフォ税率10%）
              </div>
            </div>
            <span style={S.pill}>{aiLoading ? "解析中…" : "準備OK"}</span>
          </div>

          <div style={S.cardBody}>
            <textarea
              style={S.textarea}
              value={draft.rawInstruction}
              onChange={(e) => markDirty({ ...draft, rawInstruction: e.target.value })}
              placeholder="例：いつものマインド社です…（タイトル/内訳/日付/支払い日 など）"
            />

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                style={S.btn("primary")}
                disabled={aiLoading}
                onClick={() => applyAiToForm("replace")}
              >
                AIで反映（上書き）
              </button>

              <button
                type="button"
                style={S.btn("ghost")}
                disabled={aiLoading}
                onClick={() => applyAiToForm("append")}
              >
                AIで反映（明細追記）
              </button>

              <button
                type="button"
                style={S.btn("danger")}
                disabled={aiLoading}
                onClick={() => {
                  if (!confirm("指示文をクリアする？")) return;
                  markDirty({ ...draft, rawInstruction: "" });
                }}
              >
                指示文クリア
              </button>

              <span style={{ ...S.hint, alignSelf: "center" }}>
                ※取引先が未登録なら「+登録」で追加して選択する
              </span>
            </div>
          </div>
        </div>

        {/* レスポンシブ対応グリッド */}
        <div className="invoiceGrid" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 12 }}>
          {/* 左 */}
          <div className="leftCol" style={{ display: "grid", gap: 12 }}>
            {/* 請求情報 */}
            <div style={S.card}>
              <div style={S.cardHead("#0f766e")}>
                <p style={S.cardTitle}>請求情報</p>
                <span style={S.pill}>必須あり</span>
              </div>
              <div style={S.cardBody}>
                <div style={S.row2}>
                  <div>
                    <label style={S.label}>取引先（必須）</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select
                        style={S.input}
                        value={draft.clientId ?? ""}
                        onChange={(e) => markDirty({ ...draft, clientId: e.target.value || null })}
                      >
                        <option value="">選択…</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button type="button" style={S.btn("ghost")} onClick={addClient}>
                        +登録
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={S.label}>件名（最大70文字）</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        style={S.input}
                        value={draft.subject}
                        maxLength={70}
                        onChange={(e) => markDirty({ ...draft, subject: e.target.value })}
                      />
                      <span style={S.pill}>{draft.subject.length}/70</span>
                    </div>
                  </div>
                </div>

                <div style={{ height: 10 }} />

                <div style={S.row3}>
                  <div>
                    <label style={S.label}>請求日（必須）</label>
                    <input
                      style={S.input}
                      type="date"
                      value={draft.issueDate}
                      onChange={(e) => markDirty({ ...draft, issueDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={S.label}>お支払い期限</label>
                    <input
                      style={S.input}
                      type="date"
                      value={draft.dueDate ?? ""}
                      onChange={(e) => markDirty({ ...draft, dueDate: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <label style={S.label}>請求書番号（必須）</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        style={S.input}
                        value={draft.invoiceNo}
                        onChange={(e) => markDirty({ ...draft, invoiceNo: e.target.value })}
                      />
                      <button type="button" style={S.btn("ghost")} onClick={generateInvoiceNo}>
                        採番
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 明細 */}
            <div style={S.card}>
              <div style={S.cardHead("#0ea5a4")}>
                <p style={S.cardTitle}>明細（最大80行 / 税率デフォ10%）</p>
                <span style={S.pill}>{draft.items.length}/80</span>
              </div>
              <div style={S.cardBody}>
                <div style={S.tableWrap}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>品番</th>
                        <th style={S.th}>品名</th>
                        <th style={S.th}>数量</th>
                        <th style={S.th}>単位</th>
                        <th style={S.th}>単価</th>
                        <th style={S.th}>税区分</th>
                        <th style={S.th}>小計</th>
                        <th style={S.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.items.map((it, idx) => (
                        <tr key={it.id}>
                          <td style={S.td}>
                            <input style={S.mini} value={it.code} onChange={(e) => updateItem(idx, { code: e.target.value })} />
                          </td>
                          <td style={S.td}>
                            <input style={S.mini} value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value })} />
                          </td>
                          <td style={S.td}>
                            <input style={S.mini} type="number" value={it.qty} onChange={(e) => updateItem(idx, { qty: safeNumber(e.target.value) })} />
                          </td>
                          <td style={S.td}>
                            <input style={S.mini} value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                          </td>
                          <td style={S.td}>
                            <input style={S.mini} type="number" value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: safeNumber(e.target.value) })} />
                          </td>
                          <td style={S.td}>
                            <select style={S.mini} value={it.taxRate} onChange={(e) => updateItem(idx, { taxRate: safeNumber(e.target.value) })}>
                              <option value={10}>10%</option>
                              <option value={8}>8%</option>
                              <option value={0}>0%</option>
                            </select>
                          </td>
                          <td style={{ ...S.td, whiteSpace: "nowrap" }}><b>{it.amount.toLocaleString()}円</b></td>
                          <td style={S.td}>
                            <button type="button" style={S.btn("ghost")} onClick={() => removeItemRow(idx)}>
                              削除
                            </button>
                          </td>
                        </tr>
                      ))}
                      {draft.items.length === 0 && (
                        <tr>
                          <td colSpan={8} style={{ padding: 12, color: "#64748b" }}>
                            明細がありません。「+ 行追加」で追加。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                  <button type="button" style={S.btn("primary")} onClick={addItemRow}>
                    + 行追加
                  </button>
                </div>
              </div>
            </div>

            {/* 備考 */}
            <div style={S.card}>
              <div style={S.cardHead("#f59e0b")}>
                <p style={S.cardTitle}>備考</p>
                <span style={S.pill}>自由記載</span>
              </div>
              <div style={S.cardBody}>
                <textarea style={{ ...S.textarea, minHeight: 100 }} value={draft.notes} onChange={(e) => markDirty({ ...draft, notes: e.target.value })} />
              </div>
            </div>
          </div>

          {/* 右（スマホは下へ） */}
          <div className="rightCol" style={{ display: "grid", gap: 12, alignSelf: "start" }}>
            <div style={S.card}>
              <div style={S.cardHead("#6366f1")}>
                <p style={S.cardTitle}>請求元情報</p>
                <span style={S.pill}>必須</span>
              </div>
              <div style={S.cardBody}>
                <label style={S.label}>自社名（必須）</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <select style={S.input} value={draft.issuerId ?? ""} onChange={(e) => markDirty({ ...draft, issuerId: e.target.value || null })}>
                    <option value="">選択…</option>
                    {issuers.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" style={S.btn("ghost")} onClick={addIssuer}>
                    +登録
                  </button>
                </div>
              </div>
            </div>

            <div style={S.card}>
              <div style={S.cardHead("#0f766e")}>
                <p style={S.cardTitle}>金額（自動計算）</p>
                <span style={S.pill}>リアルタイム</span>
              </div>
              <div style={S.cardBody}>
                <div style={S.rightTotals}>
                  <div style={{ color: "#64748b" }}>小計</div>
                  <div style={{ fontWeight: 800 }}>{totals.subTotal.toLocaleString()}円</div>
                  <div style={{ color: "#64748b" }}>消費税</div>
                  <div style={{ fontWeight: 800 }}>{totals.taxTotal.toLocaleString()}円</div>
                  <div style={{ color: "#64748b" }}>合計</div>
                  <div style={S.bigTotal}>{totals.grandTotal.toLocaleString()}円</div>
                </div>
              </div>
            </div>

            <div style={S.card}>
              <div style={S.cardHead("#0ea5a4")}>
                <p style={S.cardTitle}>振込先（最大10件）</p>
                <span style={S.pill}>{draft.bankAccountIds.length}/10</span>
              </div>
              <div style={S.cardBody}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <button type="button" style={S.btn("ghost")} onClick={addBank}>
                    +登録
                  </button>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {banks.map((b) => {
                    const checked = draft.bankAccountIds.includes(b.id);
                    const label = `${b.bankName} ${b.branchName} ${b.accountType} ${b.accountNumber} ${b.accountName}`;
                    return (
                      <label
                        key={b.id}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                          padding: "8px 10px",
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          background: checked ? "#f0fdfa" : "#fff",
                          cursor: "pointer",
                        }}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleBank(b.id)} />
                        <div style={{ fontSize: 12, color: "#0f172a", lineHeight: 1.35 }}>{label}</div>
                      </label>
                    );
                  })}
                  {banks.length === 0 && <div style={{ color: "#64748b", fontSize: 12 }}>未登録。上の「+登録」で追加。</div>}
                </div>
              </div>
            </div>

            <div style={S.card}>
              <div style={S.cardBody}>
                <button type="button" style={{ ...S.btn("primary"), width: "100%" }} onClick={() => saveDraft({ ...draft, ...totals }, false)}>
                  保存(API経由)
                </button>
                <div style={{ ...S.hint, marginTop: 8 }}>自動保存：入力後 0.8秒で保存</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 18 }} />
        <div style={{ fontSize: 12, color: "#64748b" }}>スマホは右側カードが下に回る（レスポンシブ対応）</div>
      </div>
    </div>
  );
}
