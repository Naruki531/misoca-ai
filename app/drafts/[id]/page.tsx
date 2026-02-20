// app/drafts/[id]/page.tsx
"use client";

export const dynamic = "force-dynamic";

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
  taxRate: number; // 10 or 8 or 0 etc
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

  bankAccountIds: string[]; // up to 10

  rawInstruction: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function safeNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function calcTotals(items: DraftItem[]) {
  // taxRate: per line
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
    taxRate: 10, // ✅ デフォルト10%
    amount: 0,
  };
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

  // Autosave
  const saveTimer = useRef<any>(null);
  const isDirty = useRef(false);

  function markDirty(next: Draft) {
    isDirty.current = true;
    setDraft(next);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (isDirty.current) {
        void saveDraft(next, true);
      }
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
      ? d.items.map((it: any) => ({
          id: (it.id ?? crypto.randomUUID()).toString(),
          code: (it.code ?? "").toString(),
          name: (it.name ?? "").toString(),
          qty: safeNumber(it.qty) || 0,
          unit: (it.unit ?? "").toString(),
          unitPrice: safeNumber(it.unitPrice) || 0,
          taxRate: Number.isFinite(Number(it.taxRate)) ? Number(it.taxRate) : 10,
          amount: safeNumber(it.amount) || 0,
        }))
      : [];

    const totals = calcTotals(items);

    setDraft({
      clientId: d.clientId ?? null,
      issueDate: d.issueDate ?? todayYYYYMMDD(),
      dueDate: d.dueDate ?? null,
      invoiceNo: d.invoiceNo ?? "",
      subject: d.subject ?? "",
      issuerId: d.issuerId ?? null,
      items,
      subTotal: safeNumber(d.subTotal) || totals.subTotal,
      taxTotal: safeNumber(d.taxTotal) || totals.taxTotal,
      grandTotal: safeNumber(d.grandTotal) || totals.grandTotal,
      notes: d.notes ?? "",
      bankAccountIds: Array.isArray(d.bankAccountIds) ? d.bankAccountIds : [],
      rawInstruction: d.rawInstruction ?? "",
    });

    isDirty.current = false;
  }

  async function saveDraft(payload: Draft, silent = false) {
    try {
      const totals = calcTotals(payload.items);
      const body = {
        ...payload,
        ...totals,
        // ついでに items の amount を保証
        items: payload.items.map((it) => ({
          ...it,
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

  // 初期：ログイン確認→マスタ＆ドラフト読み込み
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

  // items変更時：合計を即時反映
  const totals = useMemo(() => calcTotals(draft.items), [draft.items]);

  // ====== マスタ追加（簡易：prompt） ======
  async function addClient() {
    const name = window.prompt("取引先名");
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

  // ====== items操作 ======
  function updateItem(idx: number, patch: Partial<DraftItem>) {
    const items = [...draft.items];
    const cur = items[idx];
    const next: DraftItem = { ...cur, ...patch };

    // 数量・単価のときは小計更新
    const qty = safeNumber(next.qty);
    const up = safeNumber(next.unitPrice);
    next.qty = qty;
    next.unitPrice = up;
    next.taxRate = safeNumber(next.taxRate) || 0;
    next.amount = Math.floor(qty * up);

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

  // ====== bank select ======
  function toggleBank(id: string) {
    const exists = draft.bankAccountIds.includes(id);
    let next = exists ? draft.bankAccountIds.filter((x) => x !== id) : [...draft.bankAccountIds, id];
    if (next.length > 10) {
      setMsg("振込先は最大10件まで");
      return;
    }
    markDirty({ ...draft, bankAccountIds: next });
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1000, margin: "30px auto", padding: 16 }}>
        <h1>請求書 下書き</h1>
        <p>読み込み中…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "20px auto", padding: 16 }}>
      <h1>請求書 下書き</h1>

      {msg && <p style={{ margin: "8px 0", color: "#b00" }}>{msg}</p>}

      {/* 請求情報 */}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <h2 style={{ marginTop: 0 }}>請求情報</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label>取引先（必須）</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={draft.clientId ?? ""}
                onChange={(e) => markDirty({ ...draft, clientId: e.target.value || null })}
                style={{ flex: 1 }}
              >
                <option value="">選択…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addClient}>
                +追加
              </button>
            </div>
          </div>

          <div>
            <label>件名（最大70文字）</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={draft.subject}
                maxLength={70}
                onChange={(e) => markDirty({ ...draft, subject: e.target.value })}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 12 }}>{draft.subject.length}/70</span>
            </div>
          </div>

          <div>
            <label>請求日（必須）</label>
            <input
              type="date"
              value={draft.issueDate}
              onChange={(e) => markDirty({ ...draft, issueDate: e.target.value })}
            />
          </div>

          <div>
            <label>お支払い期限</label>
            <input
              type="date"
              value={draft.dueDate ?? ""}
              onChange={(e) => markDirty({ ...draft, dueDate: e.target.value || null })}
            />
          </div>

          <div>
            <label>請求書番号（必須）</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={draft.invoiceNo}
                onChange={(e) => markDirty({ ...draft, invoiceNo: e.target.value })}
                style={{ flex: 1 }}
                placeholder="YYYYMMDD-001 など"
              />
              <button type="button" onClick={generateInvoiceNo}>
                採番
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 請求元 */}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <h2 style={{ marginTop: 0 }}>請求元情報</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label>自社名（必須）</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={draft.issuerId ?? ""}
                onChange={(e) => markDirty({ ...draft, issuerId: e.target.value || null })}
                style={{ flex: 1 }}
              >
                <option value="">選択…</option>
                {issuers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addIssuer}>
                +追加
              </button>
            </div>
          </div>

          <div style={{ fontSize: 12, color: "#555" }}>
            ※詳細（住所・連絡先など）はマスタに保持。請求書印字時に参照する。
          </div>
        </div>
      </section>

      {/* 明細 */}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <h2 style={{ marginTop: 0 }}>明細（最大80行 / 税率デフォ10%）</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["品番・品名", "数量", "単位", "単価", "税区分", "小計", ""].map((h) => (
                  <th key={h} style={{ borderBottom: "1px solid #ddd", textAlign: "left", padding: 6, whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.items.map((it, idx) => (
                <tr key={it.id}>
                  <td style={{ borderBottom: "1px solid #eee", padding: 6, minWidth: 320 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8 }}>
                      <input
                        placeholder="品番"
                        value={it.code}
                        onChange={(e) => updateItem(idx, { code: e.target.value })}
                      />
                      <input
                        placeholder="品名"
                        value={it.name}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                      />
                    </div>
                  </td>

                  <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>
                    <input
                      type="number"
                      value={it.qty}
                      onChange={(e) => updateItem(idx, { qty: safeNumber(e.target.value) })}
                      style={{ width: 90 }}
                    />
                  </td>

                  <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>
                    <input
                      value={it.unit}
                      onChange={(e) => updateItem(idx, { unit: e.target.value })}
                      style={{ width: 90 }}
                    />
                  </td>

                  <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>
                    <input
                      type="number"
                      value={it.unitPrice}
                      onChange={(e) => updateItem(idx, { unitPrice: safeNumber(e.target.value) })}
                      style={{ width: 120 }}
                    />
                  </td>

                  <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>
                    <select
                      value={it.taxRate}
                      onChange={(e) => updateItem(idx, { taxRate: safeNumber(e.target.value) })}
                    >
                      <option value={10}>10%</option>
                      <option value={8}>8%</option>
                      <option value={0}>0%</option>
                    </select>
                  </td>

                  <td style={{ borderBottom: "1px solid #eee", padding: 6, whiteSpace: "nowrap" }}>
                    {it.amount.toLocaleString()}円
                  </td>

                  <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>
                    <button type="button" onClick={() => removeItemRow(idx)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
              {draft.items.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 10, color: "#777" }}>
                    明細がありません。右下の「+行追加」から追加。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button type="button" onClick={addItemRow}>
            + 行追加
          </button>
          <span style={{ fontSize: 12, color: "#555" }}>
            {draft.items.length}/80
          </span>
        </div>
      </section>

      {/* 金額 */}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <h2 style={{ marginTop: 0 }}>金額（自動計算）</h2>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 6, maxWidth: 420 }}>
          <div>小計</div>
          <div>{totals.subTotal.toLocaleString()}円</div>
          <div>消費税</div>
          <div>{totals.taxTotal.toLocaleString()}円</div>
          <div>合計</div>
          <div><b>{totals.grandTotal.toLocaleString()}円</b></div>
        </div>
      </section>

      {/* 備考 */}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <h2 style={{ marginTop: 0 }}>備考</h2>
        <textarea
          value={draft.notes}
          onChange={(e) => markDirty({ ...draft, notes: e.target.value })}
          style={{ width: "100%", minHeight: 100 }}
          placeholder="自由記載"
        />
      </section>

      {/* 振込先 */}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <h2 style={{ marginTop: 0 }}>振込先情報（最大10件選択）</h2>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button type="button" onClick={addBank}>+ 振込先を追加</button>
          <span style={{ fontSize: 12, color: "#555" }}>
            選択中: {draft.bankAccountIds.length}/10
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {banks.map((b) => {
            const checked = draft.bankAccountIds.includes(b.id);
            const label = `${b.bankName} ${b.branchName} ${b.accountType} ${b.accountNumber} ${b.accountName}`;
            return (
              <label key={b.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleBank(b.id)}
                />
                <span style={{ fontSize: 13 }}>{label}</span>
              </label>
            );
          })}
          {banks.length === 0 && <div style={{ color: "#777" }}>振込先が未登録。上の「+」から追加。</div>}
        </div>
      </section>

      {/* 保存 */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" onClick={() => saveDraft({ ...draft, ...totals }, false)}>
          保存(API経由)
        </button>
        <span style={{ fontSize: 12, color: "#555" }}>
          下書きID: {draftId}
        </span>
      </div>
    </div>
  );
}
