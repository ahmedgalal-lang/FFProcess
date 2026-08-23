import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  header: { marginBottom: 16, borderBottom: 1, borderColor: "#cbd5e1", paddingBottom: 10 },
  eyebrow: { fontSize: 8, color: "#64748b", marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 },
  title: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  meta: { fontSize: 8, color: "#94a3b8", marginTop: 4 },
  row: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  name: { fontSize: 10, fontWeight: 700, color: "#0f172a" },
  roles: { fontSize: 8, color: "#4338ca", marginTop: 1 },
  manager: { fontSize: 8, color: "#94a3b8" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: "#94a3b8", textAlign: "center" },
});

export type OrgChartPdfProps = {
  workspaceName: string;
  people: {
    id: string;
    name: string;
    depth: number;
    roleNames: string[];
    managerName: string | null;
  }[];
  generatedFor: string;
};

export function OrgChartPdfDocument({ workspaceName, people, generatedFor }: OrgChartPdfProps) {
  return (
    <Document title={`${workspaceName} Org Chart`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{workspaceName}</Text>
          <Text style={styles.title}>Org Chart</Text>
          <Text style={styles.meta}>
            Generated for {generatedFor} on {new Date().toLocaleDateString()} · {people.length} people
          </Text>
        </View>

        {people.map((p) => (
          <View key={p.id} style={[styles.row, { paddingLeft: 4 + p.depth * 18 }]} wrap={false}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.name}</Text>
              {p.roleNames.length > 0 && <Text style={styles.roles}>{p.roleNames.join(", ")}</Text>}
            </View>
            <Text style={styles.manager}>{p.managerName ? `Reports to ${p.managerName}` : "No manager"}</Text>
          </View>
        ))}

        <Text style={styles.footer} fixed>
          FFProcess · {workspaceName} · Org Chart · Diagram export available as PNG from the app
        </Text>
      </Page>
    </Document>
  );
}
