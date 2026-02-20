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