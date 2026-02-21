import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth/server";
import { runAutoSchedule } from "@/lib/automation/runSchedule";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { uid } = await verifyBearer(req as unknown as Request);
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const runDate = String(body?.runDate ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
      return NextResponse.json({ ok: false, error: "runDate (YYYY-MM-DD) is required" }, { status: 400 });
    }
    const result = await runAutoSchedule(uid, id, runDate);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
