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
      return NextResponse.json({ ok: false, error: "instructionText is required" }, { status: 400 });
    }

    // 出力は「あなたのフォームに必要な最小構造」に固定
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        clientName: { type: "string" },             // 取引先名（文字列）
        subject: { type: "string" },                // 件名
        issueDate: { type: "string" },              // YYYY-MM-DD
        dueDate: { type: ["string", "null"] },      // YYYY-MM-DD or null
        notes: { type: "string" },                  // 備考に回したい文章があれば
        items: {
          type: "array",
          maxItems: 80,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              code: { type: "string" },
              name: { type: "string" },
              qty: { type: "number" },
              unit: { type: "string" },
              unitPrice: { type: "number" },        // 税別の単価
              taxRate: { type: "number" },          // 10/8/0 のいずれか（基本10）
            },
            required: ["name", "qty", "unitPrice"],
          },
        },
      },
      required: ["clientName", "subject", "issueDate", "items"],
    } as const;

    const system = `
あなたは日本の請求書作成アシスタント。
ユーザーの自由文から、請求書フォームに入力する情報を抽出して JSON で返す。
ルール:
- 金額は「税別」。単価は unitPrice に入れる。
- 税率は基本 10。軽減税率など明確な場合だけ 8/0。
- 日付は YYYY-MM-DD に正規化する（例: 2026年1月30日(金) → 2026-01-30）。
- 不明な項目は空文字 or null。推測しすぎない。
- items は最大80行。
`;

    const r = await client.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: instructionText },
      ],
      // Structured Outputs（JSON Schema準拠を強制）
      text: {
        format: {
          type: "json_schema",
          name: "invoice_extract",
          strict: true,
          schema,
        },
      },
    });

    // SDKは output_text に整形済み文字列が入る
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
