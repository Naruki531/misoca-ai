"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { getIdToken } from "@/lib/auth/client";
import { buildDateTokens, renderRuleTemplate } from "@/lib/automation/template";

export default function DraftsHomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [copyingId, setCopyingId] = useState("");
  const [runningScheduleId, setRunningScheduleId] = useState("");
  const [activeTab, setActiveTab] = useState<"invoices" | "auto">("invoices");
  const [query, setQuery] = useState("");
  const [err, setErr] = useState("");
  const [drafts, setDrafts] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [clientsById, setClientsById] = useState<Record<string, string>>({});

  async function loadData() {
    setLoading(true);
    setErr("");
    try {
      const token = await getIdToken();
      const [dRes, cRes, sRes] = await Promise.all([
        fetch("/api/drafts", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch("/api/clients", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch("/api/auto-schedules", {
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

      const sj = await sRes.json().catch(() => ({}));
      setSchedules(Array.isArray(sj?.schedules) ? sj.schedules : []);
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

  async function createScheduleFromDraft(d: any) {
    try {
      setErr("");
      const name = (window.prompt("予約名を入力", d?.subject ? `定期: ${d.subject}` : "月次自動請求") || "").trim();
      if (!name) return;
      const nextRunDate = (window.prompt("初回自動作成日 (YYYY-MM-DD)", d?.issueDate || "") || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextRunDate)) {
        setErr("初回自動作成日は YYYY-MM-DD 形式で入力してください");
        return;
      }
      const pattern = (window.prompt("置換する元文字列（例: 2025年12月分）", "") || "").trim();
      const template = pattern
        ? (window.prompt("置換テンプレート（例: {{MONTH_LABEL}}）", "{{MONTH_LABEL}}") || "").trim()
        : "";
      const toEmail = (window.prompt("自動送信先メールアドレス（任意）", "") || "").trim();

      const token = await getIdToken();
      const res = await fetch("/api/auto-schedules", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          templateDraftId: String(d.id),
          nextRunDate,
          autoSend: !!toEmail,
          toEmail,
          rules: pattern && template ? [{ pattern, template }] : [],
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `create schedule failed: ${res.status}`);
      await loadData();
      setActiveTab("auto");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function runScheduleNow(schedule: any) {
    try {
      setErr("");
      setRunningScheduleId(String(schedule.id));
      const runDate =
        (window.prompt("実行日 (YYYY-MM-DD)", String(schedule?.nextRunDate ?? "")) || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
        setErr("実行日は YYYY-MM-DD 形式で入力してください");
        return;
      }
      const token = await getIdToken();
      const res = await fetch(`/api/auto-schedules/${schedule.id}/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ runDate }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `run failed: ${res.status}`);
      await loadData();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setRunningScheduleId("");
    }
  }

  async function toggleSchedule(schedule: any) {
    try {
      setErr("");
      const token = await getIdToken();
      const res = await fetch(`/api/auto-schedules/${schedule.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active: !schedule.active }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `toggle failed: ${res.status}`);
      await loadData();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function removeSchedule(scheduleId: string) {
    try {
      if (!window.confirm("この予約を削除しますか？")) return;
      setErr("");
      const token = await getIdToken();
      const res = await fetch(`/api/auto-schedules/${scheduleId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `delete failed: ${res.status}`);
      await loadData();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
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

  const sortedSchedules = useMemo(
    () => schedules.slice().sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0)),
    [schedules]
  );

  return (
    <div className="listPage">
      <div className="listContainer">
        <div className="listNav">
          <button
            className={`listTab ${activeTab === "invoices" ? "listTabActive" : ""}`}
            onClick={() => setActiveTab("invoices")}
            type="button"
          >
            請求書
          </button>
          <button
            className={`listTab ${activeTab === "auto" ? "listTabActive" : ""}`}
            onClick={() => setActiveTab("auto")}
            type="button"
          >
            自動作成予約
          </button>
          <button className="listTab" type="button">一括作成/郵送</button>
          <div className="listNavRight">
            <button className="createBtn" onClick={() => router.push("/drafts/new")} type="button">
              請求書を新しく作る
            </button>
          </div>
        </div>

        <div className="listHead">
          <h1>{activeTab === "invoices" ? "請求書" : "自動作成予約"}</h1>
          <div className="searchRow">
            {activeTab === "invoices" ? (
              <>
                <input
                  className="searchInput"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="取引先名, 請求書番号, 件名, メモ"
                />
                <button className="searchBtn" type="button" onClick={() => void 0}>
                  検索
                </button>
              </>
            ) : (
              <div className="sub">月次請求の自動作成・自動送信ルール</div>
            )}
          </div>
        </div>

        {err ? <div className="toast err">{err}</div> : null}

        <div className="listInfoBar">
          <div>表示件数: {activeTab === "invoices" ? filtered.length : sortedSchedules.length}件</div>
          <button className="btnOutline" onClick={loadData} type="button">再読込</button>
        </div>

        {activeTab === "invoices" ? (
          <div className="listTableWrap">
            <table className="listTable">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>ステータス</th>
                  <th>文書</th>
                  <th style={{ width: 120 }}>請求日</th>
                  <th style={{ width: 120 }}>お支払い期限</th>
                  <th style={{ width: 120, textAlign: "right" }}>金額</th>
                  <th style={{ width: 300 }}></th>
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
                          {" "}
                          <button className="miniBtn" onClick={() => createScheduleFromDraft(d)} type="button">
                            自動予約
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="listTableWrap">
            <table className="listTable">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>予約名</th>
                  <th style={{ width: 120 }}>次回作成日</th>
                  <th style={{ width: 140 }}>メール送信</th>
                  <th>変換ルール</th>
                  <th style={{ width: 320 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="listEmpty">読み込み中…</td></tr>
                ) : sortedSchedules.length === 0 ? (
                  <tr><td colSpan={5} className="listEmpty">自動作成予約はまだありません（請求書タブの「自動予約」で作成）</td></tr>
                ) : (
                  sortedSchedules.map((s) => {
                    const preview = Array.isArray(s.rules) && s.rules[0]
                      ? renderRuleTemplate(String(s.rules[0].template), buildDateTokens(String(s.nextRunDate || "")))
                      : "-";
                    return (
                      <tr key={String(s.id)}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{String(s.name || "-")}</div>
                          <div className="docSub">テンプレート: {String(s.templateDraftId || "-")}</div>
                        </td>
                        <td>{String(s.nextRunDate || "-")}</td>
                        <td>
                          {s.autoSend ? (
                            <div>
                              <div>ON</div>
                              <div className="docSub">{String(s.toEmail || "-")}</div>
                            </div>
                          ) : "OFF"}
                        </td>
                        <td>
                          {Array.isArray(s.rules) && s.rules.length > 0 ? (
                            <div>
                              {s.rules.slice(0, 3).map((r: any, idx: number) => (
                                <div key={idx} className="docSub">
                                  {String(r.pattern)} → {String(r.template)} (次回: {preview})
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="docSub">ルール未設定</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            className="miniBtn"
                            onClick={() => runScheduleNow(s)}
                            disabled={runningScheduleId === String(s.id)}
                            type="button"
                          >
                            {runningScheduleId === String(s.id) ? "実行中…" : "今すぐ実行"}
                          </button>
                          {" "}
                          <button className="miniBtn" onClick={() => toggleSchedule(s)} type="button">
                            {s.active ? "停止" : "再開"}
                          </button>
                          {" "}
                          <button className="miniBtnDanger" onClick={() => removeSchedule(String(s.id))} type="button">
                            削除
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
