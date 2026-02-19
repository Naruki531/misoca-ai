import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(token);
    const userId = decoded.uid;

    const body = await req.json();
    const instructionText = String(body?.instructionText ?? "").trim();
    if (!instructionText) {
      return NextResponse.json({ ok: false, error: "instructionText is required" }, { status: 400 });
    }

    // まず疎通用のダミー。次にOpenAI抽出をここへ差し替える
    const invoice = {
      partner_name: "",
      issue_date_raw: "",
      due_date_raw: "",
      subject: "",
      tax_mode: "exclusive",
      lines: [],
      currency: "JPY",
    };

    const ref = await adminDb().collection("drafts").add({
      userId,
      instructionText,
      aiJson: {},
      editedJson: invoice,
      status: "draft",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, draftId: ref.id, invoice });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}
