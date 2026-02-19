"use client";

import { useEffect, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { onAuthStateChanged } from "firebase/auth";

export default function DraftNewPage() {
  const [instructionText, setInstructionText] = useState("【内訳】※税別\n・テスト：1万\n【日付】2026/02/19\n");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) window.location.href = "/login";
    });
    return () => unsub();
  }, []);

  async function save() {
    setMsg("");
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("not logged in");
      const token = await user.getIdToken();

      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ instructionText }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error ?? "API error");
      setMsg(`saved draftId: ${json.draftId}`);
    } catch (e: any) {
      setMsg(e?.message ?? "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>/drafts/new</h1>
      <textarea
        rows={10}
        style={{ width: "100%", padding: 12, border: "1px solid #ddd", borderRadius: 8 }}
        value={instructionText}
        onChange={(e) => setInstructionText(e.target.value)}
      />
      <div style={{ marginTop: 12 }}>
        <button
          onClick={save}
          disabled={loading}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}
        >
          {loading ? "..." : "保存(API疎通)"}
        </button>
      </div>
      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
    </main>
  );
}
