import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { pdfDirection } from "./fonts";
import type { Locale } from "@/lib/i18n/locale";
import { messagesFor } from "@/lib/i18n/messages";
import type { ReportMessages } from "@/lib/i18n/messages/report.en";
import type { RaciCode } from "@/lib/domain/raci-validation";

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
  activityCell: { width: "34%", padding: 6, fontWeight: 700, color: "#0f172a" },
  headerCell: {
    flex: 1,
    padding: 6,
    fontSize: 8,
    fontWeight: 700,
    color: "#475569",
    textAlign: "center",
    textTransform: "uppercase",
  },
  codeCell: { flex: 1, padding: 6, textAlign: "center" },
  legend: { flexDirection: "row", gap: 16, marginTop: 14 },
  legendItem: { fontSize: 8, color: "#64748b" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: "#94a3b8", textAlign: "center" },
});

const CODE_LETTER: Record<RaciCode, string> = {
  RESPONSIBLE: "R",
  ACCOUNTABLE: "A",
  CONSULTED: "C",
  INFORMED: "I",
};

export type RaciPdfProps = {
  workspaceName: string;
  processCode: string;
  processName: string;
  roles: { id: string; name: string }[];
  activities: { id: string; name: string; assignments: Record<string, RaciCode | undefined> }[];
  status: "DRAFT" | "FINAL";
  issueCount: number;
  generatedFor: string;
  /** The file's language (spec 032); English when not given. */
  locale?: Locale;
  t?: ReportMessages;
  /** Today, as printed in the header. */
  today?: string;
};

export function RaciPdfDocument({
  workspaceName,
  processCode,
  processName,
  roles,
  activities,
  status,
  issueCount,
  generatedFor,
  locale = "en",
  t = messagesFor(locale).report,
  today = new Date().toLocaleDateString(),
}: RaciPdfProps) {
  const dir = pdfDirection(locale);
  const f = t.files;
  return (
    <Document title={`${processCode} ${f.raciTitle}`}>
      <Page size="A4" orientation="landscape" style={[styles.page, dir.page]}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, dir.text]}>{workspaceName} · {processCode}</Text>
          <Text style={[styles.title, dir.text]}>{processName} — {f.raciTitle}</Text>
          <Text style={[styles.meta, dir.text]}>
            {f.generatedFor(generatedFor, today)} · {f.status(f.statuses[status] ?? status)}
          </Text>
        </View>

        {status === "DRAFT" && (
          <View style={styles.banner}>
            <Text style={[styles.bannerText, dir.text]}>{f.draftBanner(issueCount)}</Text>
          </View>
        )}

        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow, dir.row]}>
            <Text style={[styles.activityCell, dir.text]}>{f.activity}</Text>
            {roles.map((r) => (
              <Text key={r.id} style={[styles.headerCell, dir.centred]}>
                {r.name}
              </Text>
            ))}
          </View>
          {activities.map((a) => (
            <View key={a.id} style={[styles.row, dir.row]}>
              <Text style={[styles.activityCell, dir.text]}>{a.name}</Text>
              {roles.map((r) => (
                <Text key={r.id} style={styles.codeCell}>
                  {a.assignments[r.id] ? CODE_LETTER[a.assignments[r.id]!] : ""}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={[styles.legend, dir.row]}>
          {f.legend.map((item) => (
            <Text key={item} style={[styles.legendItem, dir.centred]}>
              {item}
            </Text>
          ))}
        </View>

        <Text style={[styles.footer, dir.centred]} fixed>
          FFProcess · {workspaceName} · {processCode}
        </Text>
      </Page>
    </Document>
  );
}
