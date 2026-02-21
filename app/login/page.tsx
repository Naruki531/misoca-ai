"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase/client";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "/drafts";
    } catch (e: any) {
      setError(e.message ?? "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup() {
    setLoading(true);
    setError("");
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      window.location.href = "/drafts";
    } catch (e: any) {
      setError(e.message ?? "アカウント作成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 400,
        margin: "100px auto",
        padding: 24,
        border: "1px solid #ddd",
        borderRadius: 8,
      }}
    >
      <h1 style={{ marginBottom: 20 }}>ログイン</h1>

      <div style={{ display: "grid", gap: 12 }}>
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 8 }}
        />

        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 8 }}
        />

        <button onClick={handleLogin} disabled={loading}>
          {loading ? "処理中..." : "ログイン"}
        </button>

        <button onClick={handleSignup} disabled={loading}>
          {loading ? "処理中..." : "新規登録"}
        </button>

        {error && (
          <div style={{ color: "red", fontSize: 14 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
