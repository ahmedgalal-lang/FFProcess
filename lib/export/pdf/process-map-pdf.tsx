import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { pdfDirection } from "./fonts";
import type { Locale } from "@/lib/i18n/locale";
import { messagesFor } from "@/lib/i18n/messages";
import type { ReportMessages } from "@/lib/i18n/messages/report.en";

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
  /** The file's language (spec 032); English when not given. */
  locale?: Locale;
  t?: ReportMessages;
  /** Today, as printed in the header. */
  today?: string;
};

export function ProcessMapPdfDocument({
  workspaceName,
  processCode,
  processName,
  steps,
  generatedFor,
  locale = "en",
  t = messagesFor(locale).report,
  today = new Date().toLocaleDateString(),
}: ProcessMapPdfProps) {
  const dir = pdfDirection(locale);
  const f = t.files;
  return (
    <Document title={`${processCode} ${f.processMap}`}>
      <Page size="A4" style={[styles.page, dir.page]}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, dir.text]}>{workspaceName} · {processCode}</Text>
          <Text style={[styles.title, dir.text]}>{processName} — {f.processMap}</Text>
          <Text style={[styles.meta, dir.text]}>
            {f.generatedFor(generatedFor, today)} · {f.steps(steps.length)}
          </Text>
        </View>

        {steps.map((s, i) => (
          <View key={s.id} style={[styles.step, dir.row]} wrap={false}>
            <Text style={styles.index}>{i + 1}</Text>
            <View style={styles.stepBody}>
              <View style={[styles.stepHead, dir.row]}>
                <Text style={styles.typeBadge}>{f.stepTypes[s.type] ?? s.type}</Text>
                <Text style={[styles.stepName, dir.text]}>{s.label}</Text>
                {s.roleName && <Text style={[styles.role, dir.text]}>· {s.roleName}</Text>}
              </View>
              <Text style={[styles.stepMeta, dir.text]}>
                {s.predecessorLabel ? f.connectsFrom(s.predecessorLabel) : f.entryPoint}
              </Text>
              {s.links.length > 0 && (
                <Text style={[styles.links, dir.text]}>
                  🔗 {s.links.map((l) => `${l.code} — ${l.name}`).join("  ·  ")}
                </Text>
              )}
            </View>
          </View>
        ))}

        <Text style={[styles.footer, dir.centred]} fixed>
          FFProcess · {workspaceName} · {processCode} · {f.pngNote}
        </Text>
      </Page>
    </Document>
  );
}
