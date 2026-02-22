import { DateTokens, buildDateTokens, renderRuleTemplate } from "@/lib/automation/template";

type EvalContext = {
  tokens: DateTokens;
  currentValues: Record<string, string>;
  prevValues: Record<string, string>;
};

function stripQuotes(s: string) {
  const t = s.trim();
  if ((t.startsWith("\"") && t.endsWith("\"")) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function splitArgs(src: string) {
  const out: string[] = [];
  let cur = "";
  let quote: "" | "\"" | "'" = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if ((ch === "\"" || ch === "'") && !quote) {
      quote = ch as any;
      cur += ch;
      continue;
    }
    if (quote && ch === quote) {
      quote = "";
      cur += ch;
      continue;
    }
    if (!quote && ch === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function evalTokenRef(arg: string, ctx: EvalContext) {
  const key = arg.trim();
  if (ctx.currentValues[key] != null) return ctx.currentValues[key];
  if (ctx.prevValues[key] != null) return ctx.prevValues[key];
  const tokensMap = ctx.tokens as unknown as Record<string, string>;
  if (tokensMap[key] != null) return tokensMap[key];
  return key;
}

export function evaluateCellExpression(raw: string, ctx: EvalContext): string {
  const text = String(raw ?? "");
  if (!text.startsWith("=")) {
    return renderRuleTemplate(text, ctx.tokens);
  }

  const expr = text.slice(1).trim();

  const noArgFunc = expr.match(/^([A-Z_]+)\(\)$/);
  if (noArgFunc) {
    const fn = noArgFunc[1];
    if (fn === "COPYUP") return "";
    const tokensMap = ctx.tokens as unknown as Record<string, string>;
    if (tokensMap[fn] != null) return tokensMap[fn];
  }

  const concat = expr.match(/^CONCAT\((.*)\)$/);
  if (concat) {
    const args = splitArgs(concat[1]);
    return args
      .map((a) => {
        if (!a) return "";
        if (a.startsWith("\"") || a.startsWith("'")) return renderRuleTemplate(stripQuotes(a), ctx.tokens);
        return evalTokenRef(a, ctx);
      })
      .join("");
  }

  const textFn = expr.match(/^TEXT\((.*)\)$/);
  if (textFn) {
    const arg = textFn[1].trim();
    if (arg.startsWith("\"") || arg.startsWith("'")) return renderRuleTemplate(stripQuotes(arg), ctx.tokens);
    return evalTokenRef(arg, ctx);
  }

  const direct = evalTokenRef(expr, ctx);
  return renderRuleTemplate(direct, ctx.tokens);
}

export function resolveBlockRowValues(
  runDate: string,
  blockKeys: string[],
  rowValues: Record<string, string>,
  prevValues: Record<string, string>
) {
  const tokens = buildDateTokens(runDate);
  const resolved: Record<string, string> = {};
  for (const key of blockKeys) {
    const raw = String(rowValues?.[key] ?? "");
    if (!raw) {
      resolved[key] = "";
      continue;
    }
    const val = evaluateCellExpression(raw, { tokens, currentValues: resolved, prevValues });
    resolved[key] = val === "" && raw.trim().toUpperCase() === "=COPYUP()" ? String(prevValues[key] ?? "") : val;
  }
  return resolved;
}
