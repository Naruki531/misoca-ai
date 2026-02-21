export type DateTokens = {
  YYYY: string;
  YY: string;
  MM: string;
  M: string;
  DD: string;
  D: string;
  MONTH_LABEL: string;
  PREV_YYYY: string;
  PREV_MM: string;
  PREV_M: string;
  PREV_MONTH_LABEL: string;
  NEXT_YYYY: string;
  NEXT_MM: string;
  NEXT_M: string;
  NEXT_MONTH_LABEL: string;
};

function pad2(v: number) {
  return String(v).padStart(2, "0");
}

function addMonths(d: Date, diff: number) {
  const y = d.getFullYear();
  const m = d.getMonth() + diff;
  const day = d.getDate();
  const base = new Date(y, m, 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  return new Date(base.getFullYear(), base.getMonth(), Math.min(day, end));
}

function monthLabel(d: Date) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月分`;
}

export function buildDateTokens(ymd: string): DateTokens {
  const [yy, mm, dd] = String(ymd).split("-").map((x) => Number(x));
  const base = Number.isFinite(yy) && Number.isFinite(mm) && Number.isFinite(dd)
    ? new Date(yy, mm - 1, dd)
    : new Date();
  const prev = addMonths(base, -1);
  const next = addMonths(base, 1);

  return {
    YYYY: String(base.getFullYear()),
    YY: String(base.getFullYear()).slice(-2),
    MM: pad2(base.getMonth() + 1),
    M: String(base.getMonth() + 1),
    DD: pad2(base.getDate()),
    D: String(base.getDate()),
    MONTH_LABEL: monthLabel(base),
    PREV_YYYY: String(prev.getFullYear()),
    PREV_MM: pad2(prev.getMonth() + 1),
    PREV_M: String(prev.getMonth() + 1),
    PREV_MONTH_LABEL: monthLabel(prev),
    NEXT_YYYY: String(next.getFullYear()),
    NEXT_MM: pad2(next.getMonth() + 1),
    NEXT_M: String(next.getMonth() + 1),
    NEXT_MONTH_LABEL: monthLabel(next),
  };
}

export function renderRuleTemplate(template: string, tokens: DateTokens): string {
  return String(template ?? "").replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => {
    return (tokens as Record<string, string>)[key] ?? "";
  });
}

export function applyTextRules(
  text: string,
  rules: Array<{ pattern: string; template: string }>,
  runDate: string
) {
  let out = String(text ?? "");
  const tokens = buildDateTokens(runDate);
  for (const r of rules) {
    const pattern = String(r?.pattern ?? "");
    if (!pattern) continue;
    const replacement = renderRuleTemplate(String(r?.template ?? ""), tokens);
    out = out.split(pattern).join(replacement);
  }
  return out;
}

export function nextMonthYmd(ymd: string) {
  const [y, m, d] = String(ymd).split("-").map((x) => Number(x));
  const base = Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
    ? new Date(y, m - 1, d)
    : new Date();
  const next = addMonths(base, 1);
  const yyyy = next.getFullYear();
  const mm = pad2(next.getMonth() + 1);
  const dd = pad2(next.getDate());
  return `${yyyy}-${mm}-${dd}`;
}
