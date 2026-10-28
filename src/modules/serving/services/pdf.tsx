/* eslint-disable jsx-a11y/alt-text -- <Image> de react-pdf n'est pas une balise HTML : pas d'attribut alt dans un PDF */
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { MARITAL_STATUS_LABEL } from "../schemas";

/**
 * Fiche de candidature en PDF (spec 073), reprise de la mise en page proposée par Jenny
 * (`FichePDF`). Générée à la demande depuis la plateforme, jamais envoyée en pièce jointe.
 */

// Couleurs d'impression (le PDF ne suit pas le thème de l'interface)
const ACCENT = "#5B3A8C";
const ACCENT_SOFT = "#F3EFF8";
const INK = "#1F1B2D";
const MUTED = "#6B6880";
const LINE = "#E4E0EC";

const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 56, fontSize: 10, fontFamily: "Helvetica", color: INK },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottom: `2pt solid ${ACCENT}`,
    marginBottom: 16,
  },
  brand: { flexDirection: "row", alignItems: "center" },
  logo: { height: 36, maxWidth: 120, marginRight: 12, objectFit: "contain" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  received: { fontSize: 8.5, color: MUTED, textAlign: "right" },
  idCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: ACCENT_SOFT,
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
  },
  idInfo: { flex: 1, paddingRight: 16, justifyContent: "center" },
  idName: { fontSize: 20, fontFamily: "Helvetica-Bold", color: ACCENT, marginBottom: 12 },
  idItem: { width: "50%", marginBottom: 8 },
  photo: { width: 104, height: 138, objectFit: "cover", borderRadius: 8, border: "2pt solid #FFFFFF" },
  section: { marginBottom: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  sectionBar: { width: 4, height: 14, backgroundColor: ACCENT, borderRadius: 2, marginRight: 8 },
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: ACCENT,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", borderTop: `0.5pt solid ${LINE}` },
  cell: { width: "50%", paddingVertical: 6, paddingRight: 10, borderBottom: `0.5pt solid ${LINE}` },
  cellFull: { width: "100%", paddingVertical: 6, borderBottom: `0.5pt solid ${LINE}` },
  label: { fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.6, color: MUTED, marginBottom: 2 },
  value: { fontSize: 10, lineHeight: 1.4 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: MUTED,
    borderTop: `0.5pt solid ${LINE}`,
    paddingTop: 6,
  },
});

/** Données de la fiche nécessaires au PDF. */
export type PdfApplication = {
  firstName: string;
  lastName: string;
  birthDate: Date;
  profession: string | null;
  maritalStatus: keyof typeof MARITAL_STATUS_LABEL | null;
  childrenCount: number | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  baptized: boolean | null;
  baptismDate: Date | null;
  baptismPlace: string | null;
  previousChurch: boolean | null;
  previousChurchName: string | null;
  previousChurchLocation: string | null;
  pcncTrainings: readonly string[];
  hasServed: boolean | null;
  servedDepartment: string | null;
  ministryService: string | null;
  communityService: string | null;
  otherRoles: string | null;
  availableToServe: boolean | null;
  interests: string | null;
  observations: string | null;
  journeyDetails: string | null;
  spiritualGoals: string | null;
  specificDetails: string | null;
  createdAt: Date;
};

export type PdfChurch = { name: string; logo: Buffer | null };

const NOT_ANSWERED = "Non renseigné";

/** Question Oui/Non : sans réponse → « Non renseigné », jamais « Non ». */
export function yesNoLabel(v: boolean | null): string {
  if (v === true) return "Oui";
  if (v === false) return "Non";
  return NOT_ANSWERED;
}

const day = (d: Date | null) => (d ? d.toLocaleDateString("fr-FR", { timeZone: "UTC" }) : null);

type Item = { label: string; value: string | null; full?: boolean };

function Section({ title, items }: Readonly<{ title: string; items: Item[] }>) {
  const visible = items.filter((i) => i.value);
  if (visible.length === 0) return null;
  return (
    <View style={styles.section} wrap={false}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionBar} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.grid}>
        {visible.map((i) => (
          <View key={i.label} style={i.full ? styles.cellFull : styles.cell}>
            <Text style={styles.label}>{i.label}</Text>
            <Text style={styles.value}>{i.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ApplicationPdf({ app, photo, church }: Readonly<{ app: PdfApplication; photo: Buffer; church: PdfChurch }>) {
  const address =
    [app.street, [app.postalCode, app.city].filter(Boolean).join(" "), app.country].filter(Boolean).join(", ") ||
    null;
  const identity: Item[] = [
    { label: "Profession", value: app.profession },
    { label: "Date de naissance", value: day(app.birthDate) },
    { label: "Statut familial", value: app.maritalStatus ? MARITAL_STATUS_LABEL[app.maritalStatus] : null },
    { label: "Enfants", value: app.childrenCount === null ? null : String(app.childrenCount) },
  ];

  return (
    <Document title={`Fiche de candidature - ${app.firstName} ${app.lastName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brand}>
            {church.logo && <Image style={styles.logo} src={{ data: church.logo, format: "png" }} />}
            <View>
              <Text style={styles.title}>Fiche de candidature</Text>
              <Text style={styles.subtitle}>Candidature au service — {church.name}</Text>
            </View>
          </View>
          <Text style={styles.received}>Reçue le {day(app.createdAt)}</Text>
        </View>

        <View style={styles.idCard} wrap={false}>
          <View style={styles.idInfo}>
            <Text style={styles.idName}>
              {app.firstName} {app.lastName}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {identity
                .filter((i) => i.value)
                .map((i) => (
                  <View key={i.label} style={styles.idItem}>
                    <Text style={styles.label}>{i.label}</Text>
                    <Text style={styles.value}>{i.value}</Text>
                  </View>
                ))}
            </View>
          </View>
          <Image style={styles.photo} src={{ data: photo, format: "jpg" }} />
        </View>

        <Section
          title="Coordonnées"
          items={[
            { label: "Adresse", value: address, full: true },
            { label: "Téléphone", value: app.phone },
            { label: "E-mail", value: app.email },
          ]}
        />

        <Section
          title="Parcours spirituel"
          items={[
            { label: "Baptisé(e)", value: yesNoLabel(app.baptized) },
            { label: "Date de baptême", value: day(app.baptismDate) },
            { label: "Lieu de baptême", value: app.baptismPlace },
            { label: "Église précédente", value: yesNoLabel(app.previousChurch) },
            { label: "Nom de l'église précédente", value: app.previousChurchName },
            { label: "Ville et pays de l'église", value: app.previousChurchLocation },
            { label: "Formations PCNC", value: app.pcncTrainings.join(", ") || NOT_ANSWERED, full: true },
          ]}
        />

        <Section
          title="Service"
          items={[
            { label: "A déjà servi", value: yesNoLabel(app.hasServed) },
            { label: "Département", value: app.servedDepartment },
            { label: "Service dans le ministère", value: app.ministryService, full: true },
            { label: "Service communautaire", value: app.communityService, full: true },
            { label: "Autres rôles", value: app.otherRoles, full: true },
            { label: "Disponible pour servir", value: yesNoLabel(app.availableToServe) },
            { label: "Domaines d'intérêt", value: app.interests },
            { label: "Observations", value: app.observations, full: true },
          ]}
        />

        <Section
          title="Pour mieux la connaître"
          items={[
            { label: "Informations sur le parcours", value: app.journeyDetails, full: true },
            { label: "Objectifs spirituels", value: app.spiritualGoals, full: true },
            { label: "Détails spécifiques", value: app.specificDetails, full: true },
          ]}
        />

        <View style={styles.footer} fixed>
          <Text>Document confidentiel — {church.name}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderApplicationPdf(app: PdfApplication, photo: Buffer, church: PdfChurch): Promise<Buffer> {
  return renderToBuffer(<ApplicationPdf app={app} photo={photo} church={church} />);
}
