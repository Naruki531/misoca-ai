// app/api/issuers/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyBearer } from "@/lib/auth/server";

function now() {
  return Date.now();
}

export async function GET(req: Request) {
  try {
    const { uid } = await verifyBearer(req);
    const col = adminDb.collection("users").doc(uid).collection("issuers");
    const snap = await col.orderBy("name", "asc").limit(200).get();
    const issuers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, issuers });
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

    const contactName = (body?.contactName ?? "").toString().trim();
    const postal = (body?.postal ?? "").toString().trim();
    const address = (body?.address ?? "").toString().trim();
    const tel = (body?.tel ?? "").toString().trim();
    const regNo = (body?.regNo ?? "").toString().trim();
    if (!address) return NextResponse.json({ ok: false, error: "address is required" }, { status: 400 });
    if (!tel) return NextResponse.json({ ok: false, error: "tel is required" }, { status: 400 });

    const col = adminDb.collection("users").doc(uid).collection("issuers");
    const ref = await col.add({
      name,
      contactName,
      postal,
      address,
      tel,
      regNo,
      createdAt: now(),
      updatedAt: now(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 400 });
  }
}
