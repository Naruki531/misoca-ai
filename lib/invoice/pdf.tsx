// lib/invoice/pdf.tsx
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export type PdfIssuer = {
  name: string;
  postal?: string;
  address?: string;
  tel?: string;
  regNo?: string;
};

export type PdfClient = {
  name: string;
};

export type PdfBank = {
  bankName: string;
  branchName: string;
  branchCode?: string;
  accountType: string;
  accountNumber: string;
  accountName: string;
};

export type PdfItem = {
  code?: string;
  name: string;
  qty: number;
  unit?: string;
  unitPrice: number;
  amount: number;
};

export type PdfData = {
  issueDateText: string;
  invoiceNo: string;
  issuer: PdfIssuer;
  client: PdfClient;
  subject: string;
  dueDateText?: string;
  currencyTotalText: string;
  items: PdfItem[];
  subTotal: number;
  taxRate: number;
  taxTotal: number;
  grandTotal: number;
  bankText?: string;
  bank?: PdfBank;
};

const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 28, paddingHorizontal: 32, fontSize: 10, color: "#111827" },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontWeight: 700, letterSpacing: 1.2 },
  issueMeta: { alignItems: "flex-end" },
  issueMetaText: { fontSize: 9, color: "#374151" },

  block: { marginTop: 14 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  colLeft: { width: "52%" },
  colRight: { width: "45%" },

  clientName: {
    fontSize: 14,
    fontWeight: 700,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#111827",
    marginBottom: 8,
  },
  leadText: { fontSize: 9, color: "#374151" },
  subjectWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 4,
    padding: 7,
  },
  subjectLabel: { fontSize: 8, color: "#6b7280", marginBottom: 3 },
  subjectValue: { fontSize: 11, fontWeight: 700 },
  amountBox: {
    marginTop: 10,
    borderWidth: 1.2,
    borderColor: "#111827",
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  amountLabel: { fontSize: 9, marginBottom: 3 },
  amountValue: { fontSize: 18, fontWeight: 700 },
  dueText: { marginTop: 6, fontSize: 9 },

  issuerBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 4,
    padding: 8,
  },
  issuerName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  issuerText: { fontSize: 9, color: "#1f2937" },

  tableWrap: { marginTop: 14, borderWidth: 1, borderColor: "#d1d5db" },
  trHead: { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottomWidth: 1, borderBottomColor: "#d1d5db" },
  th: { paddingVertical: 6, paddingHorizontal: 5, fontSize: 8.5, fontWeight: 700, textAlign: "center" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", minHeight: 25 },
  td: { paddingVertical: 5, paddingHorizontal: 5, fontSize: 9 },

  colCode: { width: "12%", textAlign: "center" },
  colName: { width: "38%" },
  colQty: { width: "12%", textAlign: "right" },
  colUnit: { width: "10%", textAlign: "center" },
  colUnitPrice: { width: "14%", textAlign: "right" },
  colAmount: { width: "14%", textAlign: "right" },

  totalsWrap: { marginTop: 10, marginLeft: "55%", borderWidth: 1, borderColor: "#d1d5db", borderRadius: 4 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, paddingHorizontal: 8 },
  totalsRowLine: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  totalsLabel: { fontSize: 9, color: "#374151" },
  totalsVal: { fontSize: 9, fontWeight: 700 },
  totalLabel: { fontSize: 10, fontWeight: 700 },
  totalVal: { fontSize: 11, fontWeight: 700 },

  bankBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 4,
    padding: 8,
  },
  bankTitle: { fontSize: 9, fontWeight: 700 },
  bankText: { fontSize: 9 },
  footer: { marginTop: 10, fontSize: 8, color: "#6b7280", textAlign: "right" },
});

const yen = (n: number) => n.toLocaleString("ja-JP");

// ✅ Routeからは「これ」を呼んで Document 要素を得る
export function buildInvoicePdf(data: PdfData) {
  const rows = data.items.slice(0, 80);
  while (rows.length < 12) {
    rows.push({ code: "", name: "", qty: 0, unit: "", unitPrice: 0, amount: 0 });
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>請求書</Text>
          <View style={styles.issueMeta}>
            <Text style={styles.issueMetaText}>発行日: {data.issueDateText || "-"}</Text>
            <Text style={styles.issueMetaText}>請求番号: {data.invoiceNo || "-"}</Text>
          </View>
        </View>

        <View style={styles.block}>
          <View style={styles.row}>
            <View style={styles.colLeft}>
              <Text style={styles.clientName}>{data.client.name || "お取引先"} 御中</Text>
              <Text style={styles.leadText}>平素より大変お世話になっております。</Text>
              <Text style={styles.leadText}>下記のとおりご請求申し上げます。</Text>

              <View style={styles.subjectWrap}>
                <Text style={styles.subjectLabel}>件名</Text>
                <Text style={styles.subjectValue}>{data.subject || "-"}</Text>
              </View>

              <View style={styles.amountBox}>
                <Text style={styles.amountLabel}>ご請求金額（税込）</Text>
                <Text style={styles.amountValue}>{data.currencyTotalText}</Text>
              </View>
              {!!data.dueDateText && <Text style={styles.dueText}>お支払期限: {data.dueDateText}</Text>}
            </View>

            <View style={styles.colRight}>
              <View style={styles.issuerBox}>
                <Text style={styles.issuerName}>{data.issuer.name || "-"}</Text>
                {!!data.issuer.postal && <Text style={styles.issuerText}>〒{data.issuer.postal}</Text>}
                {!!data.issuer.address && <Text style={styles.issuerText}>{data.issuer.address}</Text>}
                {!!data.issuer.tel && <Text style={styles.issuerText}>TEL: {data.issuer.tel}</Text>}
                {!!data.issuer.regNo && <Text style={styles.issuerText}>登録番号: {data.issuer.regNo}</Text>}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.tableWrap}>
          <View style={styles.trHead}>
            <Text style={[styles.th, styles.colCode]}>品番</Text>
            <Text style={[styles.th, styles.colName]}>品名</Text>
            <Text style={[styles.th, styles.colQty]}>数量</Text>
            <Text style={[styles.th, styles.colUnit]}>単位</Text>
            <Text style={[styles.th, styles.colUnitPrice]}>単価</Text>
            <Text style={[styles.th, styles.colAmount]}>金額</Text>
          </View>

          {rows.map((it, idx) => (
            <View key={idx} style={styles.tr}>
              <Text style={[styles.td, styles.colCode]}>{it.code || ""}</Text>
              <Text style={[styles.td, styles.colName]}>{it.name || ""}</Text>
              <Text style={[styles.td, styles.colQty]}>{it.qty ? String(it.qty) : ""}</Text>
              <Text style={[styles.td, styles.colUnit]}>{it.unit || ""}</Text>
              <Text style={[styles.td, styles.colUnitPrice]}>{it.unitPrice ? yen(it.unitPrice) : ""}</Text>
              <Text style={[styles.td, styles.colAmount]}>{it.amount ? yen(it.amount) : ""}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsWrap}>
          <View style={[styles.totalsRow, styles.totalsRowLine]}>
            <Text style={styles.totalsLabel}>小計</Text>
            <Text style={styles.totalsVal}>{yen(data.subTotal)}</Text>
          </View>
          <View style={[styles.totalsRow, styles.totalsRowLine]}>
            <Text style={styles.totalsLabel}>消費税 ({data.taxRate}%)</Text>
            <Text style={styles.totalsVal}>{yen(data.taxTotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalLabel}>合計</Text>
            <Text style={styles.totalVal}>{yen(data.grandTotal)}</Text>
          </View>
        </View>

        <View style={styles.bankBox}>
          <Text style={styles.bankTitle}>お振込先</Text>
          {!!data.bankText && <Text style={styles.bankText}>{data.bankText}</Text>}
          {!data.bankText && data.bank && (
            <Text style={styles.bankText}>
              {data.bank.bankName} {data.bank.branchName}
              {data.bank.branchCode ? `(${data.bank.branchCode})` : ""} ({data.bank.accountType})
              {data.bank.accountNumber} {data.bank.accountName}
            </Text>
          )}
          {!data.bankText && !data.bank && <Text style={styles.bankText}>-</Text>}
        </View>

        <Text style={styles.footer}>本請求書はシステムにより作成されています。</Text>
      </Page>
    </Document>
  );
}
