import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyBearer } from "@/lib/auth/server";

function now() {
  return Date.now();
}

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(req: NextRequest) {
  try {
    const { uid } = await verifyBearer(req as unknown as Request);
    const snap = await adminDb
      .collection(`users/${uid}/autoSchedules`)
      .orderBy("updatedAt", "desc")
      .limit(200)
      .get();
    const schedules = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    return NextResponse.json({ ok: true, schedules });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyBearer(req as unknown as Request);
    const body = await req.json().catch(() => ({}));

    const templateDraftId = String(body?.templateDraftId ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const nextRunDate = String(body?.nextRunDate ?? todayYmd()).trim();
    const autoSend = !!body?.autoSend;
    const toEmail = String(body?.toEmail ?? "").trim();
    const rules = Array.isArray(body?.rules)
      ? body.rules
          .map((r: any) => ({
            pattern: String(r?.pattern ?? "").trim(),
            template: String(r?.template ?? "").trim(),
          }))
          .filter((r: any) => r.pattern && r.template)
      : [];
    const fieldTemplates = body?.fieldTemplates && typeof body.fieldTemplates === "object"
      ? body.fieldTemplates
      : null;
    const blockRows = Array.isArray(body?.blockRows) ? body.blockRows : [];
    const blockKeys = Array.isArray(body?.blockKeys) ? body.blockKeys.map((x: any) => String(x)) : [];

    if (!templateDraftId) {
      return NextResponse.json({ ok: false, error: "templateDraftId is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    const template = await adminDb.doc(`users/${uid}/drafts/${templateDraftId}`).get();
    if (!template.exists) {
      return NextResponse.json({ ok: false, error: "template draft not found" }, { status: 404 });
    }

    const ref = await adminDb.collection(`users/${uid}/autoSchedules`).add({
      name,
      templateDraftId,
      nextRunDate,
      active: true,
      autoSend,
      toEmail,
      rules,
      fieldTemplates,
      blockRows,
      blockKeys,
      createdAt: now(),
      updatedAt: now(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 400 });
  }
}
