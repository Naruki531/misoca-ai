import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { runAutoSchedule } from "@/lib/automation/runSchedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayYmdJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function authOk(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h = req.headers.get("authorization") || "";
  return h === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  try {
    if (!authOk(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const runDate = todayYmdJst();
    const due = await adminDb
      .collectionGroup("autoSchedules")
      .where("active", "==", true)
      .where("nextRunDate", "<=", runDate)
      .get();

    const results: Array<{ scheduleId: string; uid: string; ok: boolean; draftId?: string; error?: string }> = [];

    for (const doc of due.docs) {
      const uid = doc.ref.parent.parent?.id;
      if (!uid) continue;
      try {
        const r = await runAutoSchedule(uid, doc.id, runDate);
        results.push({ scheduleId: doc.id, uid, ok: true, draftId: r.createdDraftId });
      } catch (e: any) {
        await doc.ref.set(
          {
            lastRunAt: Date.now(),
            lastRunStatus: "error",
            lastError: e?.message ?? String(e),
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        results.push({ scheduleId: doc.id, uid, ok: false, error: e?.message ?? String(e) });
      }
    }

    return NextResponse.json({ ok: true, runDate, count: results.length, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
