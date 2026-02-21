"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { getIdToken } from "@/lib/auth/client";

export default function DraftsHomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [copyingId, setCopyingId] = useState("");
  const [query, setQuery] = useState("");
  const [err, setErr] = useState("");
  const [drafts, setDrafts] = useState<any[]>([]);
  const [clientsById, setClientsById] = useState<Record<string, string>>({});

  async function loadData() {
    setLoading(true);
    setErr("");
    try {
      const token = await getIdToken();
      const [dRes, cRes] = await Promise.all([
        fetch("/api/drafts", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch("/api/clients", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);

      const dj = await dRes.json().catch(() => ({}));
      if (!dRes.ok || !dj?.ok) throw new Error(dj?.error || `load failed: ${dRes.status}`);
      setDrafts(Array.isArray(dj.drafts) ? dj.drafts : []);

      const cj = await cRes.json().catch(() => ({}));
      const map: Record<string, string> = {};
      for (const c of Array.isArray(cj?.clients) ? cj.clients : []) {
        map[String(c.id)] = String(c.name ?? "");
      }
      setClientsById(map);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      await loadData();
    });
    return () => unsub();
  }, [router]);

  async function duplicateDraft(sourceId: string) {
    setErr("");
    setCopyingId(sourceId);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/drafts/${sourceId}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `duplicate failed: ${res.status}`);
      router.push(`/drafts/${j.id}`);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setCopyingId("");
    }
  }

  function ymd(v?: string) {
    if (!v) return "-";
    const [y, m, d] = String(v).split("-");
    if (!y || !m || !d) return v;
    return `${y}/${m}/${d}`;
  }

  function money(v?: number) {
    return `${Math.round(Number(v ?? 0)).toLocaleString("ja-JP")}円`;
  }

  function isOverdue(dueDate?: string) {
    if (!dueDate) return false;
    const t = new Date(`${dueDate}T23:59:59+09:00`).getTime();
    return Number.isFinite(t) && Date.now() > t;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = drafts.slice().sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
    if (!q) return list;

    return list.filter((d) => {
      const clientName = clientsById[String(d.clientId ?? "")] ?? "";
      const fields = [
        String(d.invoiceNo ?? ""),
        String(d.subject ?? ""),
        String(d.note ?? ""),
        String(clientName),
      ].join(" ").toLowerCase();
      return fields.includes(q);
    });
  }, [drafts, query, clientsById]);

  return (
    <div className="listPage">
      <div className="listContainer">
        <div className="listNav">
          <button className="listTab listTabActive" type="button">請求書</button>
          <button className="listTab" type="button">自動作成予約</button>
          <button className="listTab" type="button">一括作成/郵送</button>
          <div className="listNavRight">
            <button className="createBtn" onClick={() => router.push("/drafts/new")} type="button">
              請求書を新しく作る
            </button>
          </div>
        </div>

        <div className="listHead">
          <h1>請求書</h1>
          <div className="searchRow">
            <input
              className="searchInput"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="取引先名, 請求書番号, 件名, メモ"
            />
            <button className="searchBtn" type="button" onClick={() => void 0}>
              検索
            </button>
          </div>
        </div>

        {err ? <div className="toast err">{err}</div> : null}

        <div className="listInfoBar">
          <div>表示件数: {filtered.length}件</div>
          <button className="btnOutline" onClick={loadData} type="button">再読込</button>
        </div>

        <div className="listTableWrap">
          <table className="listTable">
            <thead>
              <tr>
                <th style={{ width: 120 }}>ステータス</th>
                <th>文書</th>
                <th style={{ width: 120 }}>請求日</th>
                <th style={{ width: 120 }}>お支払い期限</th>
                <th style={{ width: 120, textAlign: "right" }}>金額</th>
                <th style={{ width: 220 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="listEmpty">読み込み中…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="listEmpty">作成済み請求書がありません</td>
                </tr>
              ) : (
                filtered.map((d) => {
                  const clientName = clientsById[String(d.clientId ?? "")] || "取引先未設定";
                  const overdue = isOverdue(d.dueDate);
                  return (
                    <tr key={String(d.id)}>
                      <td>
                        <span className="statusPill">未処理</span>
                      </td>
                      <td>
                        <div className="docClient">{clientName} 様</div>
                        <div className="docSub">{d.invoiceNo || "-"} / {d.subject || "件名なし"}</div>
                      </td>
                      <td>{ymd(d.issueDate)}</td>
                      <td className={overdue ? "dueOver" : ""}>{ymd(d.dueDate)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{money(d.grandTotal)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="miniBtn" onClick={() => router.push(`/drafts/${d.id}`)} type="button">
                          閲覧
                        </button>
                        {" "}
                        <button
                          className="miniBtn"
                          onClick={() => duplicateDraft(String(d.id))}
                          disabled={copyingId === String(d.id)}
                          type="button"
                        >
                          {copyingId === String(d.id) ? "複製中…" : "複製して新規作成"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
