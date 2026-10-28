import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

type Fiche = Record<string, any>;

// Couleurs : remplace ACCENT par la couleur de l'Église (voir plus bas)
const ACCENT = "#5B3A8C";
const ACCENT_SOFT = "#F3EFF8";
const INK = "#1F1B2D";
const MUTED = "#6B6880";
const LINE = "#E4E0EC";

const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 56, fontSize: 10, fontFamily: "Helvetica", color: INK },

  // En-tête
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottom: `2pt solid ${ACCENT}`,
    marginBottom: 16,
  },
  brand: { flexDirection: "row", alignItems: "center" },
  logo: { width: 40, height: 40, marginRight: 12, objectFit: "contain" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  received: { fontSize: 8.5, color: MUTED, textAlign: "right" },

  // Carte d'identité
  idCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: ACCENT_SOFT,
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
  },
  idInfo: { flex: 1, paddingRight: 16, justifyContent: "center" },
  idName: { fontSize: 20, fontFamily: "Helvetica-Bold", color: ACCENT },
  idJob: { fontSize: 11, color: MUTED, marginTop: 3, marginBottom: 14 },
  photo: {
    width: 104,
    height: 138,
    objectFit: "cover",
    borderRadius: 8,
    border: `2pt solid #FFFFFF`,
  },

  // Sections
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
  label: {
    fontSize: 7.5,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: MUTED,
    marginBottom: 2,
  },
  value: { fontSize: 10, lineHeight: 1.4 },

  // Pied de page
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

const statutLabels: Record<string, string> = {
  CELIBATAIRE: "Célibataire",
  MARIE: "Marié(e)",
  DIVORCE: "Divorcé(e)",
  VEUF: "Veuf / Veuve",
};

// Un champ vide renvoie null et n'est pas affiché
const txt = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);
const yesNo = (v: unknown): string | null => (v === true ? "Oui" : v === false ? "Non" : null);
const date = (v: unknown): string | null =>
  v ? new Date(v as any).toLocaleDateString("fr-FR") : null;

type Item = { label: string; value?: string | null; full?: boolean };

function Section({ title, items }: { title: string; items: Item[] }) {
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

export function FichePDF({
  fiche,
  photo,
  logo,
}: {
  fiche: Fiche;
  photo: Buffer;
  logo: Buffer | null;
}) {
  const adresse =
    [
      fiche.rue,
      [fiche.codePostal, fiche.ville].filter(Boolean).join(" "),
      fiche.pays,
    ]
      .filter(Boolean)
      .join(", ") || null;

  const received = date(fiche.createdAt ?? new Date());

  return (
    <Document title={`Fiche d'identité - ${fiche.prenom} ${fiche.nom}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brand}>
            {logo && <Image style={styles.logo} src={{ data: logo, format: "png" }} />}
            <View>
              <Text style={styles.title}>Fiche d&apos;identité</Text>
              <Text style={styles.subtitle}>Candidature au service</Text>
            </View>
          </View>
          <Text style={styles.received}>Reçue le {received}</Text>
        </View>

        <View style={styles.idCard} wrap={false}>
          <View style={styles.idInfo}>
            <Text style={styles.idName}>
              {fiche.prenom} {fiche.nom}
            </Text>
           {/*<Text style={styles.idJob}>{txt(fiche.profession) ?? " "}</Text>*/}
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {[
                { label: "Profession", value: txt(fiche.profession) ?? " " },
                { label: "Date de naissance", value: date(fiche.dateNaissance) },
                { label: "Statut familial", value: statutLabels[fiche.statutFamilial] ?? null },
                { label: "Enfants", value: txt(fiche.enfants) },
              ]
                .filter((i) => i.value)
                .map((i) => (
                  <View key={i.label} style={{ width: "50%", marginBottom: 8 }}>
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
            { label: "Adresse", value: adresse, full: true },
            { label: "Téléphone", value: txt(fiche.telephone) },
            { label: "E-mail", value: txt(fiche.email) },
          ]}
        />

        <Section
          title="Parcours spirituel"
          items={[
            { label: "Baptisé(e)", value: yesNo(fiche.baptise) },
            { label: "Date de baptême", value: date(fiche.dateBapteme) },
            { label: "Lieu de baptême", value: txt(fiche.lieuBapteme) },
            { label: "Ancienne Église", value: yesNo(fiche.ancienneEglise) },
            { label: "Église précédente", value: txt(fiche.nomEgliseAncienne) },
            { label: "Ville et pays de l'église", value: txt(fiche.villePaysEgliseAncienne) },
            { label: "Formations PCNC", value: txt(fiche.formationPCNC), full: true },
          ]}
        />

        <Section
          title="Service"
          items={[
            { label: "Déjà servi pour Dieu", value: yesNo(fiche.dejaServi) },
            { label: "Département", value: txt(fiche.departementService) },
            { label: "Service dans le ministère", value: txt(fiche.serviceMinistere), full: true },
            { label: "Service communautaire", value: txt(fiche.serviceCommunautaire), full: true },
            { label: "Autres rôles", value: txt(fiche.autresRoles), full: true },
            { label: "Disponible pour servir", value: yesNo(fiche.disponiblePourServir) },
            { label: "Domaines d'intérêt", value: txt(fiche.domainesInteret) },
            { label: "Observations", value: txt(fiche.observations), full: true },
          ]}
        />

        <Section
          title="Pour mieux la connaître"
          items={[
            { label: "Informations sur le parcours", value: txt(fiche.infosSupplementaires), full: true },
            { label: "Objectifs spirituels", value: txt(fiche.objectifsSpirituels), full: true },
            { label: "Détails spécifiques", value: txt(fiche.detailsSpecifiques), full: true },
          ]}
        />

        <View style={styles.footer} fixed>
          <Text>Document confidentiel - usage interne par le PVS</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}