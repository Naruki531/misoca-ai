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
  page: { padding: 36, fontSize: 10, color: "#111" },
  row: { flexDirection: "row" },
  spaceBetween: { flexDirection: "row", justifyContent: "space-between" },
  h1: { fontSize: 18, fontWeight: 700, textAlign: "center", marginTop: 8, marginBottom: 12 },
  small: { fontSize: 9, color: "#444" },
  block: { marginBottom: 10 },
  line: { borderBottomWidth: 1, borderBottomColor: "#ddd", marginVertical: 10 },
  leftCol: { width: "55%" },
  rightCol: { width: "45%", alignItems: "flex-end" },
  issuerName: { fontSize: 12, fontWeight: 700, marginBottom: 2 },
  clientName: { fontSize: 12, fontWeight: 700, marginBottom: 6 },
  amountBox: { marginTop: 8, padding: 8, borderWidth: 1, borderColor: "#ddd", width: "100%" },
  amountLabel: { fontSize: 10, marginBottom: 4 },
  amountValue: { fontSize: 14, fontWeight: 700 },

  table: { borderWidth: 1, borderColor: "#ddd" },
  trHead: { flexDirection: "row", backgroundColor: "#f6f6f6", borderBottomWidth: 1, borderBottomColor: "#ddd" },
  th: { padding: 6, fontSize: 9, fontWeight: 700 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eee" },
  td: { padding: 6, fontSize: 9 },

  colName: { width: "55%" },
  colQty: { width: "15%", textAlign: "right" },
  colUnitPrice: { width: "15%", textAlign: "right" },
  colAmount: { width: "15%", textAlign: "right" },

  totalsWrap: { marginTop: 10, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: "45%", justifyContent: "space-between", marginBottom: 4 },
  totalsLabel: { fontSize: 9, color: "#333" },
  totalsVal: { fontSize: 9, fontWeight: 700 },

  bank: { marginTop: 10, fontSize: 9 },
});

const yen = (n: number) => n.toLocaleString("ja-JP");

// ✅ Routeからは「これ」を呼んで Document 要素を得る
export function buildInvoicePdf(data: PdfData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.spaceBetween}>
          <View style={styles.leftCol}>
            <Text>{data.issueDateText}</Text>
          </View>
          <View style={styles.rightCol}>
            <Text>請求番号: {data.invoiceNo}</Text>
          </View>
        </View>

        <View style={[styles.row, { marginTop: 8 }]}>
          <View style={styles.leftCol}>
            <Text style={styles.issuerName}>{data.issuer.name}</Text>
            {!!data.issuer.postal && <Text>〒{data.issuer.postal}</Text>}
            {!!data.issuer.address && <Text>{data.issuer.address}</Text>}
            {!!data.issuer.tel && <Text>TEL: {data.issuer.tel}</Text>}
            {!!data.issuer.regNo && <Text>登録番号: {data.issuer.regNo}</Text>}
          </View>

          <View style={styles.rightCol}>
            <Text style={styles.clientName}>{data.client.name} 様</Text>
            <Text>件名 : {data.subject}</Text>
            <Text style={{ marginTop: 6 }}>下記のとおりご請求申し上げます。</Text>

            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>ご請求金額</Text>
              <Text style={styles.amountValue}>{data.currencyTotalText}</Text>
              {!!data.dueDateText && <Text style={{ marginTop: 4 }}>お支払い期限 : {data.dueDateText}</Text>}
            </View>
          </View>
        </View>

        <Text style={styles.h1}>請求書</Text>

        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={[styles.th, styles.colName]}>品番・品名</Text>
            <Text style={[styles.th, styles.colQty]}>数量</Text>
            <Text style={[styles.th, styles.colUnitPrice]}>単価</Text>
            <Text style={[styles.th, styles.colAmount]}>金額</Text>
          </View>

          {data.items.map((it, idx) => (
            <View key={idx} style={styles.tr}>
              <Text style={[styles.td, styles.colName]}>
                {(it.code ? `${it.code} ` : "") + it.name}
              </Text>
              <Text style={[styles.td, styles.colQty]}>{it.qty}</Text>
              <Text style={[styles.td, styles.colUnitPrice]}>{yen(it.unitPrice)}</Text>
              <Text style={[styles.td, styles.colAmount]}>{yen(it.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsWrap}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>小計</Text>
            <Text style={styles.totalsVal}>{yen(data.subTotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>消費税 ({data.taxRate}%)</Text>
            <Text style={styles.totalsVal}>{yen(data.taxTotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={[styles.totalsLabel, { fontWeight: 700 }]}>合計</Text>
            <Text style={[styles.totalsVal, { fontSize: 10 }]}>{yen(data.grandTotal)}</Text>
          </View>
        </View>

        <View style={styles.bank}>
          <Text>お振込先：</Text>
          {!!data.bankText && <Text>{data.bankText}</Text>}
          {!data.bankText && data.bank && (
            <Text>
              {data.bank.bankName} {data.bank.branchName}
              {data.bank.branchCode ? `(${data.bank.branchCode})` : ""} ({data.bank.accountType})
              {data.bank.accountNumber} {data.bank.accountName}
            </Text>
          )}
        </View>

        <Text style={{ marginTop: 10, fontSize: 8, color: "#666" }}>- 請求書作成サービス</Text>
      </Page>
    </Document>
  );
}