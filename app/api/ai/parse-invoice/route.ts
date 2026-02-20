import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth/server";
import { AiInvoiceSchema } from "@/lib/invoice/schema";

// TODO: OpenAI呼び出し関数（あなたのSDK/モデルに合わせて実装）
async function callLLMToExtractJSON(input: {
  text: string;
  clientNames: string[];
  lastClientName?: string;
}) {
  // ここは仮実装：本番はOpenAIへ
  // return { ... } を AiInvoiceSchema に沿って返す
  throw new Error("callLLMToExtractJSON not implemented");
}

export async function POST(req: Request) {
  try {
    const { uid } = await verifyBearer(req);
    const body = await req.json();
    const text: string = body.text || "";

    // 取引先候補名（任意：精度UP）
    const clientNames: string[] = body.clientNames || [];
    const lastClientName: string | undefined = body.lastClientName;

    const raw = await callLLMToExtractJSON({ text, clientNames, lastClientName });
    const parsed = AiInvoiceSchema.parse(raw);

    return NextResponse.json({ ok: true, parsed });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 400 });
  }
}
