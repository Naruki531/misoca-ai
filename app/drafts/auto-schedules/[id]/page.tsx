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

function nextMonth(dateYmd: string, i: number) {
  const [y, m, d] = String(dateYmd || "").split("-").map((x) => Number(x));
  const base = Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) ? new Date(y, m - 1, d) : new Date();
  const dt = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AutoScheduleEditPage() {
  const router = useRouter();
  const params = useParams();
  const scheduleId = String((params as any)?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [draggingBlock, setDraggingBlock] = useState<string>("");

  const [scheduleName, setScheduleName] = useState("");
  const [nextRunDate, setNextRunDate] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [toEmail, setToEmail] = useState("");

  const [subjectTemplate, setSubjectTemplate] = useState("");
  const [noteTemplate, setNoteTemplate] = useState("");
  const [itemNameTemplates, setItemNameTemplates] = useState<string[]>([]);
  const [blockKeys, setBlockKeys] = useState<string[]>(["BLOCK_1", "BLOCK_2", "BLOCK_3"]);
  const [blockRows, setBlockRows] = useState<BlockRow[]>([]);
  const [compactMode, setCompactMode] = useState(true);
  const [rangeEndDate, setRangeEndDate] = useState("");
  const [fillMode, setFillMode] = useState<"copy" | "series">("copy");
  const [fillKey, setFillKey] = useState("BLOCK_1");

  function blockClass(key: string) {
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
      setScheduleName(String(s.name ?? ""));
      setNextRunDate(String(s.nextRunDate ?? ""));
      setAutoSend(!!s.autoSend);
      setToEmail(String(s.toEmail ?? ""));
      const ft = s.fieldTemplates || {};
      setSubjectTemplate(String(ft.subjectTemplate ?? ""));
      setNoteTemplate(String(ft.noteTemplate ?? ""));
      setItemNameTemplates(Array.isArray(ft.itemNameTemplates) ? ft.itemNameTemplates.map((x: any) => String(x ?? "")) : []);
      const keys = Array.isArray(s.blockKeys) && s.blockKeys.length > 0 ? s.blockKeys.map((x: any) => String(x)) : ["BLOCK_1", "BLOCK_2", "BLOCK_3"];
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

      if (!Array.isArray(ft.itemNameTemplates) || ft.itemNameTemplates.length === 0) {
        const dRes = await fetch(`/api/drafts/${String(s.templateDraftId ?? "")}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const dj = await dRes.json().catch(() => ({}));
        if (dRes.ok && dj?.ok) {
          const srcItems = Array.isArray(dj?.draft?.items) ? dj.draft.items : [];
          setItemNameTemplates(srcItems.map((it: any) => String(it?.name ?? "")));
          if (!subjectTemplate) setSubjectTemplate(String(dj?.draft?.subject ?? ""));
          if (!noteTemplate) setNoteTemplate(String(dj?.draft?.note ?? ""));
        }
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function insertToken(target: "subject" | "note" | "item", idxOrKey: number | string, blockKey: string) {
    const token = `{{${blockKey}}}`;
    if (target === "subject") {
      setSubjectTemplate((p) => `${p}${token}`);
      return;
    }
    if (target === "note") {
      setNoteTemplate((p) => `${p}${token}`);
      return;
    }
    const idx = Number(idxOrKey);
    setItemNameTemplates((prev) => {
      const next = prev.slice();
      next[idx] = `${next[idx] ?? ""}${token}`;
      return next;
    });
  }

  function onDrop(target: "subject" | "note" | "item", idxOrKey: number | string, e: any) {
    e.preventDefault();
    const key = e.dataTransfer.getData("text/plain") || draggingBlock;
    if (!key) return;
    insertToken(target, idxOrKey, key);
    setDraggingBlock("");
  }

  function addBlock() {
    const n = blockKeys.length + 1;
    setBlockKeys((prev) => [...prev, `BLOCK_${n}`]);
  }

  function addRow() {
    setBlockRows((prev) => [
      ...prev,
      {
        runDate: nextMonth(nextRunDate || prev[prev.length - 1]?.runDate || "", 1),
        values: {},
      },
    ]);
  }

  function generateRowsUntilDate() {
    const start = nextRunDate || blockRows[0]?.runDate;
    if (!start || !rangeEndDate) return;
    const list: string[] = [];
    const [sy, sm, sd] = start.split("-").map((x) => Number(x));
    const [ey, em, ed] = rangeEndDate.split("-").map((x) => Number(x));
    if (!sy || !sm || !sd || !ey || !em || !ed) return;
    let i = 0;
    while (i < 240) {
      const ymd = nextMonth(start, i);
      if (ymd > rangeEndDate) break;
      list.push(ymd);
      i++;
    }

    setBlockRows((prev) => {
      const map = new Map<string, BlockRow>();
      for (const r of prev) map.set(r.runDate, r);
      return list.map((d) => map.get(d) || { runDate: d, values: {} });
    });
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

  function applyFillSelectedKey() {
    setBlockRows((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.map((r) => ({ ...r, values: { ...(r.values || {}) } }));
      let seedIdx = next.findIndex((r) => String(r.values?.[fillKey] ?? "").trim() !== "");
      if (seedIdx < 0) seedIdx = 0;
      const seed = String(next[seedIdx].values?.[fillKey] ?? "");
      if (!seed) return prev;
      for (let i = seedIdx + 1; i < next.length; i++) {
        if (fillMode === "copy") {
          next[i].values[fillKey] = seed;
        } else {
          next[i].values[fillKey] = incrementFirstNumber(seed, i - seedIdx);
        }
      }
      return next;
    });
  }

  function autoFillDownByKey(key: string) {
    setBlockRows((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.map((r) => ({ ...r, values: { ...(r.values || {}) } }));
      for (let i = 1; i < next.length; i++) {
        if (!String(next[i].values?.[key] ?? "").trim()) {
          next[i].values[key] = String(next[i - 1].values?.[key] ?? "");
        }
      }
      return next;
    });
  }

  const preview = useMemo(() => {
    const row = blockRows[0];
    const runDate = row?.runDate || nextRunDate;
    const values = resolveBlockRowValues(
      runDate || nextMonth("", 0),
      blockKeys,
      row?.values || {},
      {}
    );
    const apply = (text: string) =>
      String(text ?? "").replace(/\{\{(BLOCK_[0-9]+)\}\}/g, (_, key: string) => values[key] ?? "");
    return {
      subject: apply(subjectTemplate),
      note: apply(noteTemplate),
      item0: apply(itemNameTemplates[0] || ""),
      tokenPreview: renderRuleTemplate("{{MONTH_LABEL}}", buildDateTokens(runDate || nextMonth("", 0))),
    };
  }, [blockRows, nextRunDate, subjectTemplate, noteTemplate, itemNameTemplates]);

  async function save() {
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/auto-schedules/${scheduleId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: scheduleName,
          nextRunDate,
          autoSend,
          toEmail,
          blockKeys,
          blockRows,
          fieldTemplates: {
            subjectTemplate,
            noteTemplate,
            itemNameTemplates,
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
    return (
      <div className="page">
        <div className="container"><div className="card"><div className="cardBody">読み込み中…</div></div></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <div className="topBar">
          <div>
            <h1>自動予約設定</h1>
            <div className="sub">ドラッグ&ドロップでブロックを差し込み、セルで次回以降の値を設定</div>
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
              <div className="field">
                <label>自動送信</label>
                <select className="input" value={autoSend ? "on" : "off"} onChange={(e) => setAutoSend(e.target.value === "on")}>
                  <option value="off">OFF</option>
                  <option value="on">ON</option>
                </select>
              </div>
              <div className="field"><label>送信先メール（自動送信ON時）</label><input className="input" value={toEmail} onChange={(e) => setToEmail(e.target.value)} /></div>
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
              {blockKeys.map((key) => (
                <button
                  key={key}
                  className={`${blockClass(key)}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", key);
                    setDraggingBlock(key);
                  }}
                  type="button"
                >
                  {key}
                </button>
              ))}
              <div className="hint">例: {"{{MONTH_LABEL}}"} をセル側で作って BLOCK_1 に入れると月次で変化</div>
              <div className="hint">
                {"関数: =MONTH_LABEL(), =YYYY(), =MM(), =TEXT(\"請求 {{MONTH_LABEL}}\"), =CONCAT(BLOCK_1,\" 費用\"), =COPYUP()"}
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="cardHead"><h3>請求書テンプレート（ブロック差し込み）</h3></div>
          <div className="cardBody">
            <div className="field">
              <label>件名</label>
              <input
                className="input"
                value={subjectTemplate}
                onChange={(e) => setSubjectTemplate(e.target.value)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop("subject", "subject", e)}
              />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>備考</label>
              <textarea
                className="textarea"
                value={noteTemplate}
                onChange={(e) => setNoteTemplate(e.target.value)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop("note", "note", e)}
              />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>明細 品名テンプレート</label>
              <div style={{ display: "grid", gap: 6 }}>
                {itemNameTemplates.map((v, i) => (
                  <input
                    key={i}
                    className="input"
                    value={v}
                    onChange={(e) =>
                      setItemNameTemplates((prev) => {
                        const next = prev.slice();
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDrop("item", i, e)}
                  />
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
                          <button className="miniBtn" onClick={() => autoFillDownByKey(k)} type="button">↓オートフィル</button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {blockRows.map((r, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          className="input"
                          type="date"
                          value={r.runDate}
                          onChange={(e) =>
                            setBlockRows((prev) => {
                              const next = prev.slice();
                              next[idx] = { ...next[idx], runDate: e.target.value };
                              return next;
                            })
                          }
                        />
                      </td>
                      {blockKeys.map((k) => (
                        <td key={k}>
                          <input
                            className={`input ${compactMode ? "compactInput" : ""}`}
                            value={String(r.values?.[k] ?? "")}
                            onChange={(e) =>
                              setBlockRows((prev) => {
                                const next = prev.slice();
                                const row = next[idx];
                                next[idx] = {
                                  ...row,
                                  values: {
                                    ...(row.values || {}),
                                    [k]: e.target.value,
                                  },
                                };
                                return next;
                              })
                            }
                            placeholder={`例: ${k === "BLOCK_1" ? "{{MONTH_LABEL}}" : ""}`}
                          />
                          {!compactMode ? (
                            <div className="hint2" style={{ marginTop: 4 }}>
                              例: {renderRuleTemplate(String(r.values?.[k] ?? ""), buildDateTokens(r.runDate || nextRunDate || nextMonth("", 0)))}
                            </div>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              セルでは {"{{MONTH_LABEL}}"}, {"{{YYYY}}"}, {"{{MM}}"}, {"{{PREV_MONTH_LABEL}}"} などが使えます。
            </div>
          </div>
        </section>

        <section className="card">
          <div className="cardHead"><h3>プレビュー（先頭行）</h3></div>
          <div className="cardBody">
            <div className="hint">DATEトークン例: {"{{MONTH_LABEL}}"} → {preview.tokenPreview}</div>
            <div style={{ marginTop: 8 }}><b>件名:</b> {preview.subject || "-"}</div>
            <div style={{ marginTop: 6 }}><b>明細1行目:</b> {preview.item0 || "-"}</div>
            <div style={{ marginTop: 6 }}><b>備考:</b> {preview.note || "-"}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
