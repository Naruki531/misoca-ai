"use client";

export const dynamic = "force-dynamic";


import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, doc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { getIdToken } from "@/lib/auth/client";
import { clientsCol, issuersCol, banksCol, draftsCol, userDoc } from "@/lib/firestore/refs";
import { InvoiceDraft } from "@/lib/invoice/types";
import { applyAiToDraft } from "@/lib/invoice/applyAi";
import { calculateTotals } from "@/lib/invoice/calc";

function emptyDraft(): InvoiceDraft {
  const now = Date.now();
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return {
    clientId: null,
    issueDate: `${yyyy}-${mm}-${dd}`,
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
    createdAt: now,
    updatedAt: now,
  };
}

export default function Page() {
  const [uid, setUid] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft>(emptyDraft());

  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [issuers, setIssuers] = useState<{ id: string; name: string }[]>([]);
  const [banks, setBanks] = useState<{ id: string; label: string }[]>([]);

  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        location.href = "/login";
        return;
      }
      setUid(u.uid);
    });
    return () => unsub();
  }, []);

  // load masters
  useEffect(() => {
    if (!uid) return;
    (async () => {
      const cs = await getDocs(query(clientsCol(uid), orderBy("name"), limit(200)));
      setClients(cs.docs.map(d => ({ id: d.id, name: d.data().name })));

      const is = await getDocs(query(issuersCol(uid), orderBy("name"), limit(200)));
      setIssuers(is.docs.map(d => ({ id: d.id, name: d.data().name })));

      const bs = await getDocs(query(banksCol(uid), orderBy("createdAt", "desc"), limit(10)));
      setBanks(bs.docs.map(d => ({ id: d.id, label: d.data().label || d.data().bankName })));
    })();
  }, [uid]);

  // create draft doc once
  useEffect(() => {
    if (!uid || draftId) return;
    (async () => {
      const ref = await addDoc(draftsCol(uid), {
        ...draft,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setDraftId(ref.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, draftId]);

  // recalc totals whenever items change
  useEffect(() => {
    const totals = calculateTotals(draft.items);
    setDraft((d) => ({
      ...d,
      subTotal: totals.subTotal,
      taxTotal: totals.taxTotal,
      grandTotal: totals.grandTotal,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(draft.items)]);

  // autosave (debounce簡易)
  useEffect(() => {
    if (!uid || !draftId) return;
    const t = setTimeout(async () => {
      try {
        await setDoc(doc(db, "users", uid, "drafts", draftId), { ...draft, updatedAt: Date.now() }, { merge: true });
        setMsg("保存済み");
      } catch (e: any) {
        setMsg("保存エラー: " + (e.message ?? e));
      }
    }, 800);
    return () => clearTimeout(t);
  }, [uid, draftId, draft]);

  async function applyAI() {
    if (!uid) return;
    setBusy(true);
    setMsg("");
    try {
      const token = await getIdToken();

      // lastClientId → name を拾う（あれば）
      // ここは簡略：本番は users/{uid}.lastClientId を読む
      const lastClientName = undefined;

      const res = await fetch("/api/ai/parse-invoice", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text: instruction,
          clientNames: clients.map(c => c.name),
          lastClientName,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      const ai = json.parsed;

      // AI結果をドラフトに適用（clientIdは後で解決）
      setDraft((prev) => ({
        ...applyAiToDraft(prev, ai),
        rawInstruction: instruction,
      }));

      // 取引先の名前ヒントを使って候補自動選択（1件一致ならセット）
      const hint = ai.client?.hint?.trim();
      if (hint) {
        const hit = clients.filter(c => c.name.includes(hint) || hint.includes(c.name));
        if (hit.length === 1) setDraft(d => ({ ...d, clientId: hit[0].id }));
        else if (hit.length === 0) setMsg(`取引先「${hint}」が未登録。登録するか選択して。`);
        else setMsg(`取引先候補が複数：${hit.map(h => h.name).join(", ")}`);
      }

      setMsg((m) => m || "AI反映OK");
    } catch (e: any) {
      setMsg("AIエラー: " + (e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function generateInvoiceNo() {
    if (!uid) return;
    setBusy(true);
    setMsg("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/invoices/next-number", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ issueDate: draft.issueDate }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setDraft(d => ({ ...d, invoiceNo: json.invoiceNo }));
      setMsg("請求書番号を採番した");
    } catch (e: any) {
      setMsg("採番エラー: " + (e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24, display: "grid", gridTemplateColumns: "1fr 420px", gap: 16 }}>
      {/* 左：フォーム */}
      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>請求情報</h2>

        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, alignItems: "center" }}>
          <div>取引先（必須）</div>
          <select value={draft.clientId ?? ""} onChange={(e) => setDraft(d => ({ ...d, clientId: e.target.value || null }))}>
            <option value="">選択…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <div>請求日（必須）</div>
          <input type="date" value={draft.issueDate} onChange={(e) => setDraft(d => ({ ...d, issueDate: e.target.value }))} />

          <div>お支払い期限</div>
          <input type="date" value={draft.dueDate ?? ""} onChange={(e) => setDraft(d => ({ ...d, dueDate: e.target.value || null }))} />

          <div>請求書番号（必須）</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={draft.invoiceNo} onChange={(e) => setDraft(d => ({ ...d, invoiceNo: e.target.value }))} placeholder="未採番なら右のボタン" />
            <button onClick={generateInvoiceNo} disabled={busy}>採番</button>
          </div>

          <div>件名（最大70）</div>
          <div>
            <input
              value={draft.subject}
              maxLength={70}
              onChange={(e) => setDraft(d => ({ ...d, subject: e.target.value }))}
              style={{ width: "100%" }}
            />
            <div style={{ fontSize: 12, color: "#666" }}>{draft.subject.length}/70</div>
          </div>
        </div>

        <hr style={{ margin: "16px 0" }} />

        <h2>請求元情報</h2>
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, alignItems: "center" }}>
          <div>自社名（必須）</div>
          <select value={draft.issuerId ?? ""} onChange={(e) => setDraft(d => ({ ...d, issuerId: e.target.value || null }))}>
            <option value="">選択…</option>
            {issuers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          {/* issuer詳細/住所/連絡先は issuerマスタ画面（モーダル）で管理推奨 */}
        </div>

        <hr style={{ margin: "16px 0" }} />

        <h2>明細（最大80行）</h2>
        <button
          onClick={() => setDraft(d => ({
            ...d,
            items: d.items.length >= 80 ? d.items : [...d.items, { id: crypto.randomUUID(), name: "", qty: 1, unit: "式", unitPrice: 0, taxRate: 10, amount: 0 }]
          }))}
        >
          行追加
        </button>

        <div style={{ marginTop: 8, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>品番・品名</th><th>数量</th><th>単位</th><th>単価</th><th>税</th><th>金額</th><th></th>
              </tr>
            </thead>
            <tbody>
              {draft.items.map((it, idx) => (
                <tr key={it.id}>
                  <td>
                    <input
                      value={it.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setDraft(d => ({
                          ...d,
                          items: d.items.map(x => x.id === it.id ? { ...x, name } : x)
                        }));
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={it.qty}
                      onChange={(e) => {
                        const qty = Number(e.target.value);
                        setDraft(d => ({
                          ...d,
                          items: d.items.map(x => x.id === it.id ? { ...x, qty, amount: Math.round(qty * x.unitPrice) } : x)
                        }));
                      }}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <input
                      value={it.unit}
                      onChange={(e) => {
                        const unit = e.target.value;
                        setDraft(d => ({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, unit } : x) }));
                      }}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={it.unitPrice}
                      onChange={(e) => {
                        const unitPrice = Number(e.target.value);
                        setDraft(d => ({
                          ...d,
                          items: d.items.map(x => x.id === it.id ? { ...x, unitPrice, amount: Math.round(x.qty * unitPrice) } : x)
                        }));
                      }}
                      style={{ width: 120 }}
                    />
                  </td>
                  <td>
                    <select
                      value={it.taxRate}
                      onChange={(e) => {
                        const taxRate = Number(e.target.value) as 0 | 8 | 10;
                        setDraft(d => ({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, taxRate } : x) }));
                      }}
                    >
                      <option value={10}>10%</option>
                      <option value={8}>8%</option>
                      <option value={0}>非課税</option>
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>{it.amount.toLocaleString()}</td>
                  <td>
                    <button onClick={() => setDraft(d => ({ ...d, items: d.items.filter(x => x.id !== it.id) }))}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <hr style={{ margin: "16px 0" }} />

        <h2>金額</h2>
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8 }}>
          <div>小計</div><div>¥{draft.subTotal.toLocaleString()}</div>
          <div>消費税</div><div>¥{draft.taxTotal.toLocaleString()}</div>
          <div>合計金額</div><div><b>¥{draft.grandTotal.toLocaleString()}</b></div>
        </div>

        <hr style={{ margin: "16px 0" }} />

        <h2>備考</h2>
        <textarea value={draft.notes} onChange={(e) => setDraft(d => ({ ...d, notes: e.target.value }))} style={{ width: "100%", minHeight: 100 }} />

        <hr style={{ margin: "16px 0" }} />

        <h2>振込先（最大10件選択）</h2>
        <div style={{ display: "grid", gap: 6 }}>
          {banks.map(b => {
            const checked = draft.bankAccountIds.includes(b.id);
            return (
              <label key={b.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setDraft(d => {
                      const next = e.target.checked
                        ? [...d.bankAccountIds, b.id]
                        : d.bankAccountIds.filter(id => id !== b.id);
                      if (next.length > 10) return d; // 超過禁止
                      return { ...d, bankAccountIds: next };
                    });
                  }}
                />
                {b.label}
              </label>
            );
          })}
        </div>

        <div style={{ marginTop: 12, color: "#666", fontSize: 12 }}>{msg}</div>
      </div>

      {/* 右：AI指示文 */}
      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>指示文（AI自動入力）</h2>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          style={{ width: "100%", minHeight: 260 }}
          placeholder={`例：\nいつものマインド社です\n請求書の発行お願いします！\n【タイトル】...\n【内訳】...\n【日付】...\n【支払い日】...`}
        />
        <button onClick={applyAI} disabled={busy} style={{ marginTop: 8, width: "100%" }}>
          AIでフォームに反映
        </button>
        <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
          ※ 税区分は指定がなければ10%で自動入力。行ごとに後から変更できる。
        </div>
      </div>
    </div>
  );
}
