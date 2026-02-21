// app/drafts/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getIdToken } from "@/lib/auth/client";

type TaxRate = 0 | 8 | 10;

type InvoiceItem = {
  id: string;
  code: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxRate: TaxRate;
  amount: number; // qty * unitPrice
};

type Draft = {
  id: string;
  instructionText: string;

  clientId: string;
  issuerId: string;
  bankAccountIds: string[];

  subject: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  invoiceNo: string;

  items: InvoiceItem[];

  taxDefault: TaxRate;
  subTotal: number;
  taxTotal: number;
  grandTotal: number;

  note: string;

  updatedAt?: any;
  createdAt?: any;
};

type Client = { id: string; name: string; email?: string };
type Issuer = { id: string; name: string };
type BankAccount = {
  id: string;
  bankName: string;
  branchName: string;
  branchCode?: string;
  accountType: string;
  accountNumber: string;
  accountName: string;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function formatYen(v: number) {
  return `${Math.round(v).toLocaleString("ja-JP")}円`;
}

function calcAmount(qty: number, unitPrice: number) {
  return Math.round(n(qty) * n(unitPrice));
}

function calcTotals(items: InvoiceItem[]) {
  const sub = items.reduce((s, it) => s + n(it.amount), 0);
  const tax = items.reduce((s, it) => s + Math.round(n(it.amount) * (n(it.taxRate) / 100)), 0);
  const total = sub + tax;
  return { subTotal: sub, taxTotal: tax, grandTotal: total };
}

function ensureMinItems(items: InvoiceItem[], min = 3) {
  if (items.length >= min) return items;
  const add = Array.from({ length: min - items.length }).map(() => ({
    id: uid(),
    code: "",
    name: "",
    qty: 1,
    unit: "",
    unitPrice: 0,
    taxRate: 10 as TaxRate,
    amount: 0,
  }));
  return [...items, ...add];
}

export default function DraftDetailPage() {
  const router = useRouter();
  const params = useParams();

  // useParams の id は string | string[] | undefined になり得るので安全に文字列化
  const draftId = useMemo(() => {
    const raw = (params as any)?.id as string | string[] | undefined;
    return Array.isArray(raw) ? raw[0] : raw ?? "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");

  // masters
  const [clients, setClients] = useState<Client[]>([]);
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);

  // recipients
  const [mailTo, setMailTo] = useState("");
  const [recipients, setRecipients] = useState<Array<{ id: string; email: string; label?: string }>>(
    []
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [outMsg, setOutMsg] = useState<string>("");

  // draft form state（draftId が入ったら id を追随させる）
  const [draft, setDraft] = useState<Draft>({
    id: "",
    instructionText: "",

    clientId: "",
    issuerId: "",
    bankAccountIds: [],

    subject: "",
    issueDate: "",
    dueDate: "",
    invoiceNo: "",

    items: ensureMinItems([]),

    taxDefault: 10,
    subTotal: 0,
    taxTotal: 0,
    grandTotal: 0,

    note: "",
  });

  // draftId 反映（初期表示で id が空→入るケース対策）
  useEffect(() => {
    if (!draftId) return;
    setDraft((p) => (p.id === draftId ? p : { ...p, id: draftId }));
  }, [draftId]);

  // ========= Load =========
  useEffect(() => {
    if (!draftId) return;

    (async () => {
      setLoading(true);
      setErr("");
      setMsg("");

      try {
        const token = await getIdToken();

        const [dRes, cRes, iRes, bRes] = await Promise.all([
          fetch(`/api/drafts/${draftId}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
          fetch(`/api/clients`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
          fetch(`/api/issuers`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
          fetch(`/api/bank-accounts`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
        ]);

        const dj = await dRes.json();
        if (!dRes.ok || !dj?.ok) throw new Error(dj?.error || "failed to load draft");

        const cj = await cRes.json().catch(() => ({}));
        const ij = await iRes.json().catch(() => ({}));
        const bj = await bRes.json().catch(() => ({}));

        const loaded: Draft = {
          ...draft,
          ...dj.draft,
          id: draftId,
          items: ensureMinItems(
            (dj.draft?.items || []).map((it: any) => {
              const qty = n(it.qty ?? 1);
              const unitPrice = n(it.unitPrice ?? 0);
              return {
                id: String(it.id || uid()),
                code: String(it.code || ""),
                name: String(it.name || ""),
                qty,
                unit: String(it.unit || ""),
                unitPrice,
                taxRate: (n(it.taxRate ?? dj.draft?.taxDefault ?? 10) as TaxRate) || 10,
                amount: n(it.amount ?? calcAmount(qty, unitPrice)),
              };
            })
          ),
          taxDefault: (n(dj.draft?.taxDefault ?? 10) as TaxRate) || 10,
        };

        // totals re-calc
        const totals = calcTotals(loaded.items);
        loaded.subTotal = totals.subTotal;
        loaded.taxTotal = totals.taxTotal;
        loaded.grandTotal = totals.grandTotal;

        setDraft(loaded);

        const clientList: Client[] = (cj?.clients || []).map((x: any) => ({
          id: String(x.id),
          name: String(x.name || ""),
          email: x.email ? String(x.email) : undefined,
        }));
        const issuerList: Issuer[] = (ij?.issuers || []).map((x: any) => ({
          id: String(x.id),
          name: String(x.name || ""),
        }));
        const bankList: BankAccount[] = (bj?.bankAccounts || []).map((x: any) => ({
          id: String(x.id),
          bankName: String(x.bankName || ""),
          branchName: String(x.branchName || ""),
          branchCode: x.branchCode ? String(x.branchCode) : "",
          accountType: String(x.accountType || ""),
          accountNumber: String(x.accountNumber || ""),
          accountName: String(x.accountName || ""),
        }));

        setClients(clientList);
        setIssuers(issuerList);
        setBanks(bankList);

        // recipients
        const r = clientList
          .filter((c) => !!c.email)
          .map((c) => ({
            id: c.id,
            email: c.email!,
            label: c.name || c.email!,
          }));
        setRecipients(r);
        if (!mailTo && r[0]?.email) setMailTo(r[0].email);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // ========= Derived =========
  const selectedBankText = useMemo(() => {
    const ids = draft.bankAccountIds || [];
    if (!ids.length) return "";
    const b0 = banks.find((b) => b.id === ids[0]);
    if (!b0) return "";
    return `${b0.bankName} ${b0.branchName}${b0.branchCode ? `(${b0.branchCode})` : ""} ${b0.accountType} ${
      b0.accountNumber
    } ${b0.accountName}`;
  }, [draft.bankAccountIds, banks]);

  // ========= Handlers =========
  function updateItem(idx: number, patch: Partial<InvoiceItem>) {
    setDraft((prev) => {
      const items = prev.items.slice();
      const cur = items[idx];
      if (!cur) return prev;
      const next: InvoiceItem = { ...cur, ...patch };

      const qty = n(next.qty);
      const unitPrice = n(next.unitPrice);
      next.amount = calcAmount(qty, unitPrice);

      if (next.taxRate === (undefined as any) || next.taxRate === null) {
        next.taxRate = prev.taxDefault;
      }

      items[idx] = next;

      const totals = calcTotals(items);
      return { ...prev, items, ...totals };
    });
  }

  function addRow() {
    setDraft((prev) => {
      if (prev.items.length >= 80) return prev;
      const items = prev.items.concat({
        id: uid(),
        code: "",
        name: "",
        qty: 1,
        unit: "",
        unitPrice: 0,
        taxRate: prev.taxDefault,
        amount: 0,
      });
      const totals = calcTotals(items);
      return { ...prev, items, ...totals };
    });
  }

  function removeRow(idx: number) {
    setDraft((prev) => {
      const items = prev.items.slice();
      items.splice(idx, 1);
      const fixed = ensureMinItems(items);
      const totals = calcTotals(fixed);
      return { ...prev, items: fixed, ...totals };
    });
  }

  async function saveDraft() {
    if (!draftId) return;
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const token = await getIdToken();

      const res = await fetch(`/api/drafts/${draftId}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          instructionText: draft.instructionText,

          clientId: draft.clientId,
          issuerId: draft.issuerId,
          bankAccountIds: draft.bankAccountIds,

          subject: draft.subject,
          issueDate: draft.issueDate,
          dueDate: draft.dueDate,
          invoiceNo: draft.invoiceNo,

          items: draft.items,
          taxDefault: draft.taxDefault,
          subTotal: draft.subTotal,
          taxTotal: draft.taxTotal,
          grandTotal: draft.grandTotal,

          note: draft.note,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `save failed: ${res.status}`);

      setMsg(`保存した: ${draftId}`);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function applyAi(mode: "header" | "detail") {
    if (!draftId) return;
    setErr("");
    setMsg("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/ai/parse-invoice", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          instructionText: draft.instructionText,
          applyMode: mode,
          taxDefault: draft.taxDefault,
          masters: {
            clients: clients.map((c) => ({ id: c.id, name: c.name, email: c.email ?? "" })),
            issuers: issuers.map((i) => ({ id: i.id, name: i.name })),
            bankAccounts: banks.map((b) => ({
              id: b.id,
              label: `${b.bankName} ${b.branchName} ${b.accountType} ${b.accountNumber} ${b.accountName}`,
              bankName: b.bankName,
              branchName: b.branchName,
              accountType: b.accountType,
              accountNumber: b.accountNumber,
              accountName: b.accountName,
            })),
          },
          draft: {
            clientId: draft.clientId,
            issuerId: draft.issuerId,
            bankAccountIds: draft.bankAccountIds,
            subject: draft.subject,
            issueDate: draft.issueDate,
            dueDate: draft.dueDate,
            invoiceNo: draft.invoiceNo,
            note: draft.note,
          },
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `AI failed: ${res.status}`);

      const ai = j.data || {};
      const selected = ai.selected || {};
      const nextDraft = { ...draft };

      if (selected.clientId) nextDraft.clientId = String(selected.clientId);
      if (selected.issuerId) nextDraft.issuerId = String(selected.issuerId);
      if (Array.isArray(selected.bankAccountIds)) {
        nextDraft.bankAccountIds = selected.bankAccountIds.map((x: any) => String(x)).slice(0, 10);
      }
      if (selected.subject) nextDraft.subject = String(selected.subject).slice(0, 70);
      if (selected.issueDate) nextDraft.issueDate = String(selected.issueDate);
      if (selected.dueDate) nextDraft.dueDate = String(selected.dueDate);
      if (selected.invoiceNo) nextDraft.invoiceNo = String(selected.invoiceNo);
      if (selected.note) nextDraft.note = String(selected.note);

      const aiItemsRaw = Array.isArray(selected.items) ? selected.items : [];
      const aiItems: InvoiceItem[] = aiItemsRaw.map((it: any) => {
        const qty = n(it.qty ?? 1);
        const unitPrice = n(it.unitPrice ?? it.price ?? 0);
        const taxRate = (n(it.taxRate ?? nextDraft.taxDefault ?? 10) as TaxRate) || 10;
        const amount = calcAmount(qty, unitPrice);
        return {
          id: uid(),
          code: String(it.code ?? ""),
          name: String(it.name ?? it.title ?? ""),
          qty,
          unit: String(it.unit ?? ""),
          unitPrice,
          taxRate,
          amount,
        };
      });

      if (mode === "header") {
        nextDraft.items = ensureMinItems(aiItems);
      } else {
        const merged = nextDraft.items.slice();

        let aiIdx = 0;
        for (let i = 0; i < merged.length && aiIdx < aiItems.length; i++) {
          const r = merged[i];
          const isEmpty = !r.name && !r.code && n(r.unitPrice) === 0;
          if (isEmpty) {
            merged[i] = { ...aiItems[aiIdx], id: r.id };
            aiIdx++;
          }
        }

        while (aiIdx < aiItems.length && merged.length < 80) {
          merged.push(aiItems[aiIdx++]);
        }
        nextDraft.items = ensureMinItems(merged);
      }

      const totals = calcTotals(nextDraft.items);
      nextDraft.subTotal = totals.subTotal;
      nextDraft.taxTotal = totals.taxTotal;
      nextDraft.grandTotal = totals.grandTotal;

      setDraft(nextDraft);
      const warnings = Array.isArray(ai.warnings) ? ai.warnings : [];
      setMsg(warnings.length ? `AI反映OK / 注意: ${warnings.join(" | ")}` : "AI反映OK");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  function clearInstruction() {
    setDraft((p) => ({ ...p, instructionText: "" }));
  }

  async function handleDownloadPdf() {
    if (!draftId) return;
    try {
      setOutMsg("");
      setIsDownloading(true);
      const token = await getIdToken();

      const res = await fetch(`/api/drafts/${draftId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `download failed: ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice_${draft.invoiceNo || draftId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
      setOutMsg("PDFをダウンロードした");
    } catch (e: any) {
      setOutMsg(`ダウンロード失敗: ${e?.message ?? String(e)}`);
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleSendMail() {
    if (!draftId) return;
    try {
      setOutMsg("");
      if (!mailTo) {
        setOutMsg("送信先メールを選択して");
        return;
      }
      setIsSending(true);

      const token = await getIdToken();
      const res = await fetch(`/api/drafts/${draftId}/send`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ toEmail: mailTo }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || `send failed: ${res.status}`);
      }
      setOutMsg(`送信した: ${mailTo}`);
    } catch (e: any) {
      setOutMsg(`送信失敗: ${e?.message ?? String(e)}`);
    } finally {
      setIsSending(false);
    }
  }

  // ========= UI =========
  if (!draftId) {
    return (
      <div className="page">
        <div className="container">
          <div className="card">
            <div className="cardBody">URLのIDが取得できない（/drafts/[id] の id が空）</div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <div className="container">
          <div className="topBar">
            <div>
              <h1>請求書 下書き</h1>
              <div className="sub">下書きID: {draftId}</div>
            </div>
          </div>
          <div className="card">
            <div className="cardBody">読み込み中…</div>
          </div>
        </div>
      </div>
    );
  }

  const itemCountLabel = `${draft.items.filter((x) => x.name || x.code || x.unitPrice).length}/${draft.items.length}`;

  return (
    <div className="page">
      <div className="container">
        {/* header */}
        <div className="topBar">
          <div>
            <h1>請求書 下書き</h1>
            <div className="sub">下書きID: {draftId}</div>
          </div>

          <div className="topActions">
            <div className="pill">税区分デフォルト: {draft.taxDefault}%</div>
            <button className="btn" onClick={saveDraft} disabled={saving} type="button">
              {saving ? "保存中…" : "保存(API経由)"}
            </button>
          </div>
        </div>

        {msg ? <div className="toast ok">{msg}</div> : null}
        {err ? <div className="toast err">{err}</div> : null}

        {/* instruction */}
        <section className="card">
          <div className="cardHead">
            <div>
              <h3>指示文（AI自動記載用）</h3>
              <div className="sub2">
                貼り付け → 「AIで反映」→ フォームに埋める（明細デフォ税率{draft.taxDefault}%）
              </div>
            </div>
            <div className="rightBadge">準備OK</div>
          </div>

          <div className="cardBody">
            <textarea
              className="textarea"
              value={draft.instructionText}
              onChange={(e) => setDraft((p) => ({ ...p, instructionText: e.target.value }))}
              rows={6}
              placeholder="例：いつものマインド社です。請求書の発行お願いします！…"
            />

            <div className="btnRow">
              <button className="btn" onClick={() => applyAi("header")} type="button">
                AIで反映（上書き）
              </button>
              <button className="btnOutline" onClick={() => applyAi("detail")} type="button">
                AIで反映（明細追記）
              </button>
              <button className="btnDanger" onClick={clearInstruction} type="button">
                指示文クリア
              </button>
              <div className="hint">※取引先が未登録なら「＋登録」で追加して選択する</div>
            </div>
          </div>
        </section>

        {/* main grid */}
        <div className="grid">
          {/* left */}
          <div className="leftCol">
            {/* invoice info */}
            <section className="card">
              <div className="cardHead">
                <h3>請求情報</h3>
                <div className="rightBadge">必須あり</div>
              </div>

              <div className="cardBody">
                <div className="formGrid">
                  <div className="field">
                    <label>取引先（必須）</label>
                    <div className="row">
                      <select
                        className="input"
                        value={draft.clientId}
                        onChange={(e) => setDraft((p) => ({ ...p, clientId: e.target.value }))}
                      >
                        <option value="">選択</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button className="miniBtn" type="button" onClick={() => router.push("/drafts/new")}>
                        ＋登録
                      </button>
                    </div>
                  </div>

                  <div className="field">
                    <label>件名（最大70文字）</label>
                    <div className="row">
                      <input
                        className="input"
                        value={draft.subject}
                        onChange={(e) => setDraft((p) => ({ ...p, subject: e.target.value.slice(0, 70) }))}
                        placeholder="例）9〜11月分 業務委託費用 一式"
                      />
                      <div className="counter">{draft.subject.length}/70</div>
                    </div>
                  </div>

                  <div className="field">
                    <label>請求日（必須）</label>
                    <input
                      className="input"
                      type="date"
                      value={draft.issueDate}
                      onChange={(e) => setDraft((p) => ({ ...p, issueDate: e.target.value }))}
                    />
                  </div>

                  <div className="field">
                    <label>お支払い期限</label>
                    <input
                      className="input"
                      type="date"
                      value={draft.dueDate}
                      onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))}
                    />
                  </div>

                  <div className="field">
                    <label>請求書番号（必須）</label>
                    <div className="row">
                      <input
                        className="input"
                        value={draft.invoiceNo}
                        onChange={(e) => setDraft((p) => ({ ...p, invoiceNo: e.target.value }))}
                        placeholder="例）20260227-001"
                      />
                      <button
                        className="miniBtn"
                        type="button"
                        onClick={async () => {
                          setErr("");
                          setMsg("");
                          try {
                            const token = await getIdToken();
                            const res = await fetch("/api/invoices/next-number", {
                              method: "POST",
                              headers: {
                                "content-type": "application/json",
                                Authorization: `Bearer ${token}`,
                              },
                              body: JSON.stringify({ issueDate: draft.issueDate }),
                              cache: "no-store",
                            });
                            const j = await res.json().catch(() => ({}));
                            if (!res.ok || !j?.ok) throw new Error(j?.error || "採番失敗");
                            setDraft((p) => ({ ...p, invoiceNo: String(j.invoiceNo || "") }));
                            setMsg("採番した");
                          } catch (e: any) {
                            setErr(e?.message ?? String(e));
                          }
                        }}
                      >
                        採番
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* items */}
            <section className="card">
              <div className="cardHead">
                <h3>明細（最大80行 / 税率デフォ{draft.taxDefault}%）</h3>
                <div className="rightBadge">{itemCountLabel}</div>
              </div>

              <div className="cardBody">
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 110 }}>品番</th>
                        <th style={{ minWidth: 220 }}>品名</th>
                        <th style={{ width: 90 }}>数量</th>
                        <th style={{ width: 110 }}>単位</th>
                        <th style={{ width: 120 }}>単価</th>
                        <th style={{ width: 100 }}>税区分</th>
                        <th style={{ width: 130, textAlign: "right" }}>小計</th>
                        <th style={{ width: 70 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.items.map((it, idx) => (
                        <tr key={it.id}>
                          <td>
                            <input className="input" value={it.code} onChange={(e) => updateItem(idx, { code: e.target.value })} />
                          </td>
                          <td>
                            <input
                              className="input"
                              value={it.name}
                              onChange={(e) => updateItem(idx, { name: e.target.value })}
                              placeholder="例）業務委託費用 一式"
                            />
                          </td>
                          <td>
                            <input className="input" type="number" value={it.qty} min={0} step={1} onChange={(e) => updateItem(idx, { qty: n(e.target.value) })} />
                          </td>
                          <td>
                            <input className="input" value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                          </td>
                          <td>
                            <input className="input" type="number" value={it.unitPrice} min={0} step={1} onChange={(e) => updateItem(idx, { unitPrice: n(e.target.value) })} />
                          </td>
                          <td>
                            <select className="input" value={it.taxRate} onChange={(e) => updateItem(idx, { taxRate: n(e.target.value) as TaxRate })}>
                              <option value={10}>10%</option>
                              <option value={8}>8%</option>
                              <option value={0}>0%</option>
                            </select>
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatYen(it.amount)}</td>
                          <td style={{ textAlign: "right" }}>
                            <button className="miniBtnDanger" type="button" onClick={() => removeRow(idx)}>
                              削除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="btnRow">
                  <button className="btnOutline" onClick={addRow} type="button">
                    ＋ 行追加
                  </button>
                </div>
              </div>
            </section>

            {/* note */}
            <section className="card">
              <div className="cardHead">
                <h3>備考</h3>
                <div className="rightBadge">自由記載</div>
              </div>
              <div className="cardBody">
                <textarea
                  className="textarea"
                  rows={4}
                  value={draft.note}
                  onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
                  placeholder="例）お振込手数料はご負担ください。"
                />
              </div>
            </section>

            <div className="footHint">スマホは右側カードが下に回る（レスポンシブ対応）</div>
          </div>

          {/* right */}
          <div className="rightCol">
            {/* issuer */}
            <section className="card">
              <div className="cardHead">
                <h3>請求元情報</h3>
                <div className="rightBadge">必須</div>
              </div>

              <div className="cardBody">
                <div className="field">
                  <label>自社名（必須）</label>
                  <div className="row">
                    <select
                      className="input"
                      value={draft.issuerId}
                      onChange={(e) => setDraft((p) => ({ ...p, issuerId: e.target.value }))}
                    >
                      <option value="">選択</option>
                      {issuers.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                    <button className="miniBtn" type="button" onClick={() => router.push("/drafts/new")}>
                      ＋登録
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* totals */}
            <section className="card">
              <div className="cardHead">
                <h3>金額（自動計算）</h3>
                <div className="rightBadge">リアルタイム</div>
              </div>

              <div className="cardBody">
                <div className="totals">
                  <div className="totRow">
                    <div>小計</div>
                    <div className="money">{formatYen(draft.subTotal)}</div>
                  </div>
                  <div className="totRow">
                    <div>消費税</div>
                    <div className="money">{formatYen(draft.taxTotal)}</div>
                  </div>
                  <div className="totRow total">
                    <div>合計</div>
                    <div className="money">{formatYen(draft.grandTotal)}</div>
                  </div>
                </div>

                <div className="field" style={{ marginTop: 12 }}>
                  <label>税区分デフォルト</label>
                  <select
                    className="input"
                    value={draft.taxDefault}
                    onChange={(e) => {
                      const taxDefault = n(e.target.value) as TaxRate;
                      setDraft((p) => {
                        const items = p.items.map((it) => ({
                          ...it,
                          taxRate: (it.taxRate ?? taxDefault) as TaxRate,
                        }));
                        const totals = calcTotals(items);
                        return { ...p, taxDefault, items, ...totals };
                      });
                    }}
                  >
                    <option value={10}>10%</option>
                    <option value={8}>8%</option>
                    <option value={0}>0%</option>
                  </select>
                  <div className="hint2">デフォは10%。あとから行ごとに変更可</div>
                </div>
              </div>
            </section>

            {/* bank accounts */}
            <section className="card">
              <div className="cardHead">
                <h3>振込先（最大10件）</h3>
                <div className="rightBadge">{draft.bankAccountIds.length}/10</div>
              </div>

              <div className="cardBody">
                <div className="btnRow" style={{ marginBottom: 10 }}>
                  <button className="miniBtn" type="button" onClick={() => router.push("/drafts/new")}>
                    ＋登録
                  </button>
                </div>

                <div className="bankList">
                  {banks.length === 0 ? (
                    <div className="hint2">振込先が未登録</div>
                  ) : (
                    banks.map((b) => {
                      const checked = draft.bankAccountIds.includes(b.id);
                      const label = `${b.bankName} ${b.branchName} ${b.accountType} ${b.accountNumber} ${b.accountName}`;
                      return (
                        <label key={b.id} className="checkRow">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setDraft((p) => {
                                const ids = p.bankAccountIds.slice();
                                if (on) {
                                  if (ids.length >= 10) return p;
                                  if (!ids.includes(b.id)) ids.push(b.id);
                                } else {
                                  const i = ids.indexOf(b.id);
                                  if (i >= 0) ids.splice(i, 1);
                                }
                                return { ...p, bankAccountIds: ids };
                              });
                            }}
                          />
                          <span title={label}>{label}</span>
                        </label>
                      );
                    })
                  )}
                </div>

                {selectedBankText ? <div className="hint2">先頭の口座をPDFに表示：{selectedBankText}</div> : null}
              </div>
            </section>

            {/* output */}
            <section className="card">
              <div className="cardHead">
                <h3>出力（PDF）</h3>
              </div>

              <div className="cardBody" style={{ display: "grid", gap: 10 }}>
                <button className="btn" onClick={handleDownloadPdf} disabled={isDownloading} type="button">
                  {isDownloading ? "生成中…" : "PDFをダウンロード"}
                </button>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>メール送信</div>

                  <select value={mailTo} onChange={(e) => setMailTo(e.target.value)} className="input">
                    <option value="">送信先を選択</option>
                    {recipients.map((r) => (
                      <option key={r.id} value={r.email}>
                        {r.label ? `${r.label} <${r.email}>` : r.email}
                      </option>
                    ))}
                  </select>

                  <button className="btnOutline" onClick={handleSendMail} disabled={!mailTo || isSending} type="button">
                    {isSending ? "送信中…" : "この宛先へ送信"}
                  </button>

                  {outMsg ? (
                    <div style={{ fontSize: 12, color: outMsg.includes("失敗") ? "#b00020" : "#0a7f3f" }}>
                      {outMsg}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            {/* save */}
            <section className="card">
              <div className="cardBody">
                <button className="btn big" onClick={saveDraft} disabled={saving} type="button">
                  {saving ? "保存中…" : "保存(API経由)"}
                </button>
                <div className="hint2">自動保存：入力後 0.8秒で保存（※未実装なら後で追加）</div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
