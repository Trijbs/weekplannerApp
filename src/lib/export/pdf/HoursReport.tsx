import { createElement, type ReactElement } from "react";
import { Document, Page, StyleSheet, Text, View, type DocumentProps } from "@react-pdf/renderer";
import type { HoursExportData } from "@/lib/export/hours";
import { formatHoursAsDuration } from "@/lib/time/tracking";

const MONTHS_NL = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

function formatDutchDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }
  return `${day} ${MONTHS_NL[month - 1]} ${year}`;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 56,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#475569",
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: "#0f172a",
    paddingBottom: 4,
    marginBottom: 2,
    fontFamily: "Helvetica-Bold",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 3,
  },
  dayTotalRow: {
    flexDirection: "row",
    paddingVertical: 3,
    backgroundColor: "#f1f5f9",
    fontFamily: "Helvetica-Bold",
  },
  colDate: { width: "16%" },
  colTask: { width: "38%" },
  colProject: { width: "22%" },
  colHours: { width: "12%", textAlign: "right" },
  colOrigin: { width: "12%", textAlign: "right" },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 6,
  },
  grandTotal: {
    flexDirection: "row",
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1.5,
    borderTopColor: "#0f172a",
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#94a3b8",
  },
});

type HoursReportProps = {
  data: HoursExportData;
  generatedAtIso: string;
};

export function buildHoursReport(props: HoursReportProps): ReactElement<DocumentProps> {
  return createElement(HoursReport, props) as unknown as ReactElement<DocumentProps>;
}

export function HoursReport({ data, generatedAtIso }: HoursReportProps) {
  const { filter } = data;
  const periodLabel =
    filter.startDate || filter.endDate
      ? `${filter.startDate ? formatDutchDate(filter.startDate) : "begin"} t/m ${
          filter.endDate ? formatDutchDate(filter.endDate) : "nu"
        }`
      : "alle registraties";
  const projectLabel = filter.projectName ? ` · project: ${filter.projectName}` : "";

  return (
    <Document title="Tijdregistratie" author="Weekplanner">
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Tijdregistratie</Text>
        <Text style={styles.subtitle}>
          Periode: {periodLabel}
          {projectLabel} · gegenereerd op {formatDutchDate(generatedAtIso.slice(0, 10))}
        </Text>

        <View style={styles.tableHeader} fixed>
          <Text style={styles.colDate}>Datum</Text>
          <Text style={styles.colTask}>Taak</Text>
          <Text style={styles.colProject}>Project</Text>
          <Text style={styles.colHours}>Duur</Text>
          <Text style={styles.colOrigin}>Bron</Text>
        </View>

        {data.perDayTotals.map((day) => (
          <View key={day.dayDate} wrap={false}>
            {data.rows
              .filter((row) => row.dayDate === day.dayDate)
              .map((row) => (
                <View key={row.id} style={styles.row}>
                  <Text style={styles.colDate}>{formatDutchDate(row.dayDate)}</Text>
                  <Text style={styles.colTask}>{row.title || "—"}</Text>
                  <Text style={styles.colProject}>{row.projectName}</Text>
                  <Text style={styles.colHours}>{formatHoursAsDuration(row.hoursDecimal)}</Text>
                  <Text style={styles.colOrigin}>{row.origin}</Text>
                </View>
              ))}
            <View style={styles.dayTotalRow}>
              <Text style={styles.colDate}>Subtotaal</Text>
              <Text style={styles.colTask} />
              <Text style={styles.colProject} />
              <Text style={styles.colHours}>{formatHoursAsDuration(day.totalHours)}</Text>
              <Text style={styles.colOrigin} />
            </View>
          </View>
        ))}

        <View style={styles.grandTotal}>
          <Text style={styles.colDate}>Totaal</Text>
          <Text style={styles.colTask} />
          <Text style={styles.colProject} />
          <Text style={styles.colHours}>{formatHoursAsDuration(data.totalHours)}</Text>
          <Text style={styles.colOrigin} />
        </View>

        <Text style={styles.sectionTitle}>Per project</Text>
        {data.perProjectTotals.map((project) => (
          <View key={project.projectName} style={styles.row}>
            <Text style={{ width: "60%" }}>{project.projectName}</Text>
            <Text style={{ width: "40%", textAlign: "right" }}>
              {formatHoursAsDuration(project.totalHours)}
            </Text>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>Weekplanner · Tijdregistratie</Text>
          <Text render={({ pageNumber, totalPages }) => `pagina ${pageNumber} van ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
