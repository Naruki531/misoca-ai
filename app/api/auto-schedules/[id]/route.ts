import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { uid } = await verifyBearer(req as unknown as Request);
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const patch: any = {
      updatedAt: Date.now(),
    };
    if (typeof body?.name === "string") patch.name = body.name.trim();
    if (typeof body?.nextRunDate === "string") patch.nextRunDate = body.nextRunDate.trim();
    if (typeof body?.active === "boolean") patch.active = body.active;
    if (typeof body?.autoSend === "boolean") patch.autoSend = body.autoSend;
    if (typeof body?.toEmail === "string") patch.toEmail = body.toEmail.trim();
    if (Array.isArray(body?.rules)) {
      patch.rules = body.rules
        .map((r: any) => ({
          pattern: String(r?.pattern ?? "").trim(),
          template: String(r?.template ?? "").trim(),
        }))
        .filter((r: any) => r.pattern && r.template);
    }

    await adminDb.doc(`users/${uid}/autoSchedules/${id}`).set(patch, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { uid } = await verifyBearer(req as unknown as Request);
    const { id } = await ctx.params;
    await adminDb.doc(`users/${uid}/autoSchedules/${id}`).delete();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 400 });
  }
}
