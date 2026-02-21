"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { getIdToken } from "@/lib/auth/client";

type DraftListItem = {
  id: string;
  invoiceNo?: string;
  subject?: string;
  issueDate?: string;
  grandTotal?: number;
  updatedAt?: number;
};

function formatDate(v?: number | string) {
  if (!v) return "-";
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ja-JP");
}

function formatMoney(v?: number) {
  const n = Number(v ?? 0);
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}

export default function DraftHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [copyingId, setCopyingId] = useState("");
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [err, setErr] = useState("");

  async function loadDrafts() {
    setLoading(true);
    setErr("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/drafts", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `load failed: ${res.status}`);
      setDrafts(Array.isArray(j.drafts) ? j.drafts : []);
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
      await loadDrafts();
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

  const sortedDrafts = useMemo(
    () => drafts.slice().sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0)),
    [drafts]
  );

  return (
    <div className="page">
      <div className="container">
        <div className="topBar">
          <div>
            <h1>作成分請求書</h1>
            <div className="sub">保存済み請求書の閲覧・複製</div>
          </div>
          <div className="topActions">
            <button className="btnOutline" onClick={() => router.push("/drafts")} type="button">
              メニューへ戻る
            </button>
            <button className="btn" onClick={() => router.push("/drafts/new")} type="button">
              新規作成
            </button>
          </div>
        </div>

        {err ? <div className="toast err">{err}</div> : null}

        <section className="card">
          <div className="cardBody">
            {loading ? (
              <div>読み込み中…</div>
            ) : sortedDrafts.length === 0 ? (
              <div>保存済み請求書はまだありません。</div>
            ) : (
              <div className="tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>更新日時</th>
                      <th>請求書番号</th>
                      <th>件名</th>
                      <th style={{ textAlign: "right" }}>合計</th>
                      <th>請求日</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDrafts.map((d) => (
                      <tr key={d.id}>
                        <td>{formatDate(d.updatedAt)}</td>
                        <td>{d.invoiceNo || "-"}</td>
                        <td>{d.subject || "-"}</td>
                        <td style={{ textAlign: "right" }}>{formatMoney(d.grandTotal)}</td>
                        <td>{d.issueDate || "-"}</td>
                        <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                          <button className="miniBtn" onClick={() => router.push(`/drafts/${d.id}`)} type="button">
                            閲覧/編集
                          </button>
                          {" "}
                          <button
                            className="miniBtn"
                            onClick={() => duplicateDraft(d.id)}
                            disabled={copyingId === d.id}
                            type="button"
                          >
                            {copyingId === d.id ? "複製中…" : "複製して新規作成"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
