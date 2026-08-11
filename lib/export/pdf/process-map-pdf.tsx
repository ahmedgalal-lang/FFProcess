import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  header: { marginBottom: 16, borderBottom: 1, borderColor: "#cbd5e1", paddingBottom: 10 },
  eyebrow: { fontSize: 8, color: "#64748b", marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 },
  title: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  meta: { fontSize: 8, color: "#94a3b8", marginTop: 4 },
  step: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
  },
  index: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: "#eef2ff",
    color: "#4338ca",
    fontSize: 8,
    fontWeight: 700,
    textAlign: "center",
    paddingTop: 4,
  },
  stepBody: { flex: 1 },
  stepHead: { flexDirection: "row", gap: 6, alignItems: "center" },
  typeBadge: { fontSize: 6, fontWeight: 700, color: "#64748b", textTransform: "uppercase" },
  stepName: { fontSize: 10, fontWeight: 700, color: "#0f172a" },
  role: { fontSize: 8, color: "#64748b" },
  stepMeta: { fontSize: 8, color: "#94a3b8", marginTop: 2 },
  links: { fontSize: 8, color: "#4338ca", marginTop: 2 },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: "#94a3b8", textAlign: "center" },
});

export type ProcessMapPdfProps = {
  workspaceName: string;
  processCode: string;
  processName: string;
  steps: {
    id: string;
    type: string;
    label: string;
    roleName: string | null;
    predecessorLabel: string | null;
    links: { code: string; name: string }[];
  }[];
  generatedFor: string;
};

export function ProcessMapPdfDocument({
  workspaceName,
  processCode,
  processName,
  steps,
  generatedFor,
}: ProcessMapPdfProps) {
  return (
    <Document title={`${processCode} Process Map`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{workspaceName} · {processCode}</Text>
          <Text style={styles.title}>{processName} — Process Map</Text>
          <Text style={styles.meta}>
            Generated for {generatedFor} on {new Date().toLocaleDateString()} · {steps.length} step(s)
          </Text>
        </View>

        {steps.map((s, i) => (
          <View key={s.id} style={styles.step} wrap={false}>
            <Text style={styles.index}>{i + 1}</Text>
            <View style={styles.stepBody}>
              <View style={styles.stepHead}>
                <Text style={styles.typeBadge}>{s.type}</Text>
                <Text style={styles.stepName}>{s.label}</Text>
                {s.roleName && <Text style={styles.role}>· {s.roleName}</Text>}
              </View>
              <Text style={styles.stepMeta}>
                {s.predecessorLabel ? `Connects from: ${s.predecessorLabel}` : "Entry point"}
              </Text>
              {s.links.length > 0 && (
                <Text style={styles.links}>
                  🔗 {s.links.map((l) => `${l.code} — ${l.name}`).join("  ·  ")}
                </Text>
              )}
            </View>
          </View>
        ))}

        <Text style={styles.footer} fixed>
          FFProcess · {workspaceName} · {processCode} · Diagram export available as PNG from the app
        </Text>
      </Page>
    </Document>
  );
}
