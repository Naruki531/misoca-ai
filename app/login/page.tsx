"use client";

import { useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setErr("");
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "/drafts/new";
    } catch (e: any) {
      setErr(e?.message ?? "login failed");
    } finally {
      setLoading(false);
    }
  }

  async function signUp() {
    setErr("");
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      await createUserWithEmailAndPassword(auth, email, password);
      window.location.href = "/drafts/new";
    } catch (e: any) {
      setErr(e?.message ?? "signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>ログイン</h1>

      <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>Email</label>
      <input
        style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <label style={{ display: "block", fontSize: 12, marginTop: 12, marginBottom: 6 }}>
        Password
      </label>
      <input
        type="password"
        style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {err ? <p style={{ color: "crimson", marginTop: 10 }}>{err}</p> : null}

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          onClick={signIn}
          disabled={loading}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}
        >
          {loading ? "…" : "ログイン"}
        </button>
        <button
          onClick={signUp}
          disabled={loading}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111" }}
        >
          {loading ? "…" : "新規登録"}
        </button>
      </div>
    </main>
  );
}
