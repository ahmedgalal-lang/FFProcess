import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  header: { marginBottom: 16, borderBottom: 1, borderColor: "#cbd5e1", paddingBottom: 10 },
  eyebrow: { fontSize: 8, color: "#64748b", marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 },
  title: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  meta: { fontSize: 8, color: "#94a3b8", marginTop: 4 },
  banner: {
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
  },
  bannerText: { fontSize: 9, color: "#991b1b", fontWeight: 700 },
  rule: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
  },
  approver: { fontSize: 10, fontWeight: 700, color: "#0f172a" },
  coApproval: { fontSize: 8, color: "#64748b", marginTop: 2 },
  threshold: { fontSize: 10, fontWeight: 700, color: "#334155" },
  gapRow: { backgroundColor: "#fef2f2" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: "#94a3b8", textAlign: "center" },
});

export type AuthorityPdfProps = {
  workspaceName: string;
  decisionTypeName: string;
  rules: {
    id: string;
    approverLabel: string;
    maxThreshold: number;
    coApprovalAboveThreshold: number | null;
    coApproverLabel: string | null;
  }[];
  conflictCount: number;
  generatedFor: string;
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export function AuthorityPdfDocument({
  workspaceName,
  decisionTypeName,
  rules,
  conflictCount,
  generatedFor,
}: AuthorityPdfProps) {
  const sorted = [...rules].sort((a, b) => a.maxThreshold - b.maxThreshold);
  const highest = sorted.at(-1)?.maxThreshold ?? 0;

  return (
    <Document title={`${decisionTypeName} Authority Matrix`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{workspaceName} · Authority Matrix</Text>
          <Text style={styles.title}>{decisionTypeName}</Text>
          <Text style={styles.meta}>
            Generated for {generatedFor} on {new Date().toLocaleDateString()}
          </Text>
        </View>

        {conflictCount > 0 && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>⚠ {conflictCount} conflicting rule pair(s) — thresholds are ambiguous</Text>
          </View>
        )}

        <View>
          {sorted.map((r) => (
            <View key={r.id} style={styles.rule}>
              <View>
                <Text style={styles.approver}>{r.approverLabel}</Text>
                {r.coApproverLabel && (
                  <Text style={styles.coApproval}>
                    Co-approval from {r.coApproverLabel} above {money(r.coApprovalAboveThreshold ?? 0)}
                  </Text>
                )}
              </View>
              <Text style={styles.threshold}>up to {money(r.maxThreshold)}</Text>
            </View>
          ))}
          <View style={[styles.rule, styles.gapRow]}>
            <Text style={[styles.approver, { color: "#991b1b" }]}>No rule defined</Text>
            <Text style={[styles.threshold, { color: "#991b1b" }]}>&gt; {money(highest)}</Text>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          FFProcess · {workspaceName} · {decisionTypeName}
        </Text>
      </Page>
    </Document>
  );
}
