import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  header: { marginBottom: 16, borderBottom: 1, borderColor: "#cbd5e1", paddingBottom: 10 },
  eyebrow: { fontSize: 8, color: "#64748b", marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 },
  title: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  meta: { fontSize: 8, color: "#94a3b8", marginTop: 4 },
  banner: {
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fbbf24",
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
  },
  bannerText: { fontSize: 9, color: "#92400e", fontWeight: 700 },
  table: { display: "flex", flexDirection: "column", borderWidth: 1, borderColor: "#e2e8f0" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#e2e8f0" },
  headerRow: { backgroundColor: "#f1f5f9" },
  taskCell: { width: "32%", padding: 6, fontWeight: 700, color: "#0f172a" },
  headerCell: {
    flex: 1,
    padding: 6,
    fontSize: 8,
    fontWeight: 700,
    color: "#475569",
    textAlign: "center",
    textTransform: "uppercase",
  },
  cell: { flex: 1, padding: 6, textAlign: "center", color: "#334155" },
  co: { fontSize: 7, color: "#64748b" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: "#94a3b8", textAlign: "center" },
});

export type AuthorityPdfRow = {
  id: string;
  label: string;
  unit: "MONEY" | "DAYS";
  threshold: number | null;
  approverLabel: string | null;
  coApprovalAboveThreshold: number | null;
  coApproverLabel: string | null;
};

export type AuthorityPdfProps = {
  workspaceName: string;
  processCode: string;
  processName: string;
  rows: AuthorityPdfRow[];
  issueCount: number;
  generatedFor: string;
};

function formatThreshold(unit: "MONEY" | "DAYS", value: number | null): string {
  if (value === null) return "—";
  return unit === "MONEY" ? `$${value.toLocaleString("en-US")}` : `${value} day${value === 1 ? "" : "s"}`;
}

export function AuthorityPdfDocument({
  workspaceName,
  processCode,
  processName,
  rows,
  issueCount,
  generatedFor,
}: AuthorityPdfProps) {
  return (
    <Document title={`${processCode} Authority Matrix`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>
            {workspaceName} · {processCode}
          </Text>
          <Text style={styles.title}>{processName} — Authority Matrix</Text>
          <Text style={styles.meta}>
            Generated for {generatedFor} on {new Date().toLocaleDateString()}
          </Text>
        </View>

        {issueCount > 0 && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>⚠ {issueCount} task(s) need an approver (or co-approver)</Text>
          </View>
        )}

        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            <Text style={styles.taskCell}>Task</Text>
            <Text style={styles.headerCell}>Threshold</Text>
            <Text style={styles.headerCell}>Approver</Text>
            <Text style={styles.headerCell}>Co-approval</Text>
          </View>
          {rows.map((r) => (
            <View key={r.id} style={styles.row}>
              <Text style={styles.taskCell}>{r.label}</Text>
              <Text style={styles.cell}>{formatThreshold(r.unit, r.threshold)}</Text>
              <Text style={styles.cell}>{r.approverLabel ?? "—"}</Text>
              <Text style={styles.cell}>
                {r.coApproverLabel
                  ? `${r.coApproverLabel} above ${formatThreshold(r.unit, r.coApprovalAboveThreshold)}`
                  : "—"}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer} fixed>
          FFProcess · {workspaceName} · {processCode}
        </Text>
      </Page>
    </Document>
  );
}
