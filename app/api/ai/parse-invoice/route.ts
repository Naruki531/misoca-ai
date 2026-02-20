// app/api/ai/parse-invoice/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const client = new OpenAI({ apiKey: mustEnv("OPENAI_API_KEY") });
const MODEL = process.env.OPENAI_MODEL || "gpt-5.2";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const instructionText = String(body?.instructionText ?? "").trim();
    if (!instructionText) {
      return NextResponse.json(
        { ok: false, error: "instructionText is required" },
        { status: 400 }
      );
    }

    // ✅ strict json_schema では、propertiesにあるキーは required に全部入れるのが安全
    // その代わり「空文字」「null」を許容して、推測させすぎない。
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        clientName: { type: "string" }, // 取引先名（未確定なら空文字）
        subject: { type: "string" }, // 件名（未確定なら空文字）
        issueDate: { type: "string" }, // YYYY-MM-DD（未確定なら空文字）
        dueDate: { type: ["string", "null"] }, // YYYY-MM-DD or null
        notes: { type: "string" }, // 備考（未確定なら空文字）
        items: {
          type: "array",
          maxItems: 80,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              code: { type: "string" }, // 品番（無ければ空文字）
              name: { type: "string" }, // 品名（必ず埋める努力）
              qty: { type: "number" }, // 数量（不明なら 1）
              unit: { type: "string" }, // 単位（無ければ空文字）
              unitPrice: { type: "number" }, // 税別単価（不明なら 0）
              taxRate: { type: "number" }, // 10/8/0（基本10）
            },
            // ✅ propertiesの全キーをrequiredに含める
            required: ["code", "name", "qty", "unit", "unitPrice", "taxRate"],
          },
        },
      },
      // ✅ top-levelも全キーをrequiredに含める（空文字/nullで逃がす）
      required: ["clientName", "subject", "issueDate", "dueDate", "notes", "items"],
    } as const;

    const system = `
あなたは日本の請求書作成アシスタント。
ユーザーの自由文から、請求書フォームに入力する情報を抽出して JSON で返す。

ルール:
- 金額は「税別」。単価は unitPrice に入れる。
- 税率 taxRate は基本 10。軽減税率など明確な場合だけ 8/0。
- 日付は YYYY-MM-DD に正規化する（例: 2026年1月30日(金) → 2026-01-30）。
- 推測しすぎない。不明なら空文字・0・nullで返す。
- items は最大80行。
- items[] は最低でも name/qty/unitPrice を埋める努力をする（qty不明なら1）。
`;

    const r = await client.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: instructionText },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "invoice_extract",
          strict: true,
          schema,
        },
      },
    });

    const jsonText = r.output_text;
    const parsed = JSON.parse(jsonText);

    return NextResponse.json({ ok: true, data: parsed });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}