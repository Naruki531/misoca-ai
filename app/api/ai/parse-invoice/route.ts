// app/api/ai/parse-invoice/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyBearer } from "@/lib/auth/server";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const client = new OpenAI({ apiKey: mustEnv("OPENAI_API_KEY") });
const MODEL = process.env.OPENAI_MODEL || "gpt-5.2";

export async function POST(req: NextRequest) {
  try {
    await verifyBearer(req as unknown as Request);

    const body = await req.json();
    const instructionText = String(body?.instructionText ?? body?.text ?? "").trim();
    const applyMode = body?.applyMode === "detail" ? "detail" : "header";
    const masters = body?.masters ?? {};
    const draft = body?.draft ?? {};

    if (!instructionText) {
      return NextResponse.json(
        { ok: false, error: "instructionText is required" },
        { status: 400 }
      );
    }

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        selected: {
          type: "object",
          additionalProperties: false,
          properties: {
            clientId: { type: "string" },
            issuerId: { type: "string" },
            bankAccountIds: { type: "array", items: { type: "string" } },
            subject: { type: "string" },
            issueDate: { type: "string" },
            dueDate: { type: "string" },
            invoiceNo: { type: "string" },
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
                  unitPrice: { type: "number" },
                  taxRate: { type: "number" },
                },
                required: ["code", "name", "qty", "unit", "unitPrice", "taxRate"],
              },
            },
            note: { type: "string" },
          },
          required: [
            "clientId",
            "issuerId",
            "bankAccountIds",
            "subject",
            "issueDate",
            "dueDate",
            "invoiceNo",
            "items",
            "note",
          ],
        },
        candidates: {
          type: "object",
          additionalProperties: false,
          properties: {
            clientIds: { type: "array", items: { type: "string" } },
            issuerIds: { type: "array", items: { type: "string" } },
            bankAccountIds: { type: "array", items: { type: "string" } },
          },
          required: ["clientIds", "issuerIds", "bankAccountIds"],
        },
        warnings: { type: "array", items: { type: "string" } },
        confidence: { type: "number" },
      },
      required: ["selected", "candidates", "warnings", "confidence"],
    } as const;

    const system = `
あなたは日本の請求書作成アシスタント。
ユーザーの自由文から、請求書フォームに入力する情報を抽出して JSON で返す。

ルール:
- applyMode は固定せず、selected に反映可能な値を返す。
- 金額は税別。単価は unitPrice。
- 税率 taxRate は 0/8/10 だけ。既定は taxDefault。
- 日付は YYYY-MM-DD。
- 不明は空文字/0/空配列にする。
- 候補が複数あるときは selected を最有力1つ、候補は candidates 配列へ。
- 注意点は warnings に短文で入れる。
- confidence は 0..1。
`;

    const userPayload = {
      instructionText,
      applyMode,
      taxDefault: Number(body?.taxDefault ?? 10),
      masters,
      draft,
    };

    const r = await client.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
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
    const data = {
      applyMode,
      selected: parsed.selected ?? {},
      candidates: parsed.candidates ?? { clientIds: [], issuerIds: [], bankAccountIds: [] },
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      confidence: Number(parsed.confidence ?? 0),
    };

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
