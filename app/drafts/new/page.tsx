// app/drafts/new/page.tsx
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { getIdToken } from "@/lib/auth/client";

export default function DraftNewPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("下書きを作成中…");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }

      try {
        const token = await getIdToken();
        const res = await fetch("/api/drafts", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ rawInstruction: "" }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);

        router.replace(`/drafts/${json.id}`);
      } catch (e: any) {
        setMsg("作成失敗: " + (e.message ?? e));
      }
    });

    return () => unsub();
  }, [router]);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1>下書き/新着</h1>
      <p>{msg}</p>
    </div>
  );
}
