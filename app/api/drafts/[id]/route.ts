// app/api/drafts/[id]/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyBearer } from "@/lib/auth/server";

function now() {
  return Date.now();
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  try {
    const { uid } = await verifyBearer(req);
    const id = ctx.params.id;

    const ref = adminDb.collection("users").doc(uid).collection("drafts").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, draft: { id: snap.id, ...snap.data() } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 401 });
  }
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const { uid } = await verifyBearer(req);
    const id = ctx.params.id;

    const body = await req.json();
    if (!body || typeof body !== "object") throw new Error("Invalid body");

    const ref = adminDb.collection("users").doc(uid).collection("drafts").doc(id);

    await ref.set(
      {
        ...body,
        updatedAt: now(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 400 });
  }
}
