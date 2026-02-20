// app/api/clients/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyBearer } from "@/lib/auth/server";

function now() {
  return Date.now();
}

export async function GET(req: Request) {
  try {
    const { uid } = await verifyBearer(req);
    const col = adminDb.collection("users").doc(uid).collection("clients");
    const snap = await col.orderBy("name", "asc").limit(200).get();
    const clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, clients });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const { uid } = await verifyBearer(req);
    const body = await req.json();
    const name = (body?.name ?? "").toString().trim();
    if (!name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });

    const col = adminDb.collection("users").doc(uid).collection("clients");
    const ref = await col.add({
      name,
      createdAt: now(),
      updatedAt: now(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 400 });
  }
}
