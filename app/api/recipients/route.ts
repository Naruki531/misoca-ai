import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const snap = await adminDb.collection(`users/${uid}/recipients`).orderBy("email").get();
    const recipients = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    return NextResponse.json({ ok: true, recipients });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const label = String(body?.label ?? "").trim();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "valid email is required" }, { status: 400 });
    }

    const col = adminDb.collection(`users/${uid}/recipients`);
    const existing = await col.where("email", "==", email).limit(1).get();
    if (!existing.empty) {
      return NextResponse.json({ ok: true, id: existing.docs[0].id, duplicated: true });
    }

    const ref = await col.add({
      email,
      label,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 400 });
  }
}
