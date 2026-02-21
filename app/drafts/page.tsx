"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";

export default function DraftsHomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setReady(true);
    });
    return () => unsub();
  }, [router]);

  if (!ready) {
    return (
      <div className="page">
        <div className="container">
          <div className="card">
            <div className="cardBody">読み込み中…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <div className="topBar">
          <div>
            <h1>請求書メニュー</h1>
            <div className="sub">新規作成または過去の請求書を選択</div>
          </div>
        </div>

        <div className="menuGrid">
          <Link className="menuCard" href="/drafts/new">
            <div className="menuTitle">新規作成</div>
            <div className="menuDesc">空の下書きを作成して編集画面へ進む</div>
          </Link>

          <Link className="menuCard" href="/drafts/history">
            <div className="menuTitle">作成分請求書</div>
            <div className="menuDesc">過去の請求書を一覧表示、閲覧、複製して新規作成</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
