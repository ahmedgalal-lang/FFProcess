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
  /** The file's language (spec 032); English when not given. */
  locale?: Locale;
  t?: ReportMessages;
  /** Today, as printed in the header. */
  today?: string;
};

export function OrgChartPdfDocument({
  workspaceName,
  people,
  generatedFor,
  locale = "en",
  t = messagesFor(locale).report,
  today = new Date().toLocaleDateString(),
}: OrgChartPdfProps) {
  const dir = pdfDirection(locale);
  const f = t.files;
  return (
    <Document title={`${workspaceName} ${f.orgChart}`}>
      <Page size="A4" style={[styles.page, dir.page]}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, dir.text]}>{workspaceName}</Text>
          <Text style={[styles.title, dir.text]}>{f.orgChart}</Text>
          <Text style={[styles.meta, dir.text]}>
            {f.generatedFor(generatedFor, today)} · {f.people(people.length)}
          </Text>
        </View>

        {people.map((p) => (
          <View
            key={p.id}
            style={[styles.row, dir.row, dir.rtl ? { paddingRight: 4 + p.depth * 18 } : { paddingLeft: 4 + p.depth * 18 }]}
            wrap={false}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, dir.text]}>{p.name}</Text>
              {p.roleNames.length > 0 && <Text style={[styles.roles, dir.text]}>{p.roleNames.join(dir.rtl ? "، " : ", ")}</Text>}
            </View>
            <Text style={[styles.manager, dir.text]}>{p.managerName ? f.reportsTo(p.managerName) : f.noManager}</Text>
          </View>
        ))}

        <Text style={[styles.footer, dir.centred]} fixed>
          FFProcess · {workspaceName} · {f.orgChart} · {f.pngNote}
        </Text>
      </Page>
    </Document>
  );
}
