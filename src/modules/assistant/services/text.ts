import { SYNONYM_PHRASES, SYNONYM_WORDS } from "../knowledge/synonyms";

/**
 * Traitement du texte de l'assistant (spec 075) : normalisation, mots utiles, tolérance aux
 * fautes, anonymisation. Aucune dépendance : utilisé par le moteur lexical comme par le repli.
 */

/** Mots trop courants pour aider à reconnaître une question. */
const STOPWORDS = new Set(
  (
    "a ai as au aux avec avez avoir avons c ca ce ces cet cette comment d dans de des du elle elles en est es et " +
    "etre faire fais fait il ils j je l la le les leur leurs lui m ma mais me mes moi mon n ne ni nos notre nous " +
    "on ont ou par pas peu peut peux plus pour qu quand que quel quelle quelles quels qui quoi s sa se ses si son " +
    "sont suis sur svp t ta te tes toi ton tu un une vos votre vous y est-ce estce veux voudrais dois doit faut " +
    "il-y ya bien bon alors donc car aussi tout tous toute toutes ici la-bas stp merci bonjour salut hello coucou"
  ).split(" ")
);

/** Minuscules, sans accents ni ponctuation, espaces simples. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Racine légère : retire le pluriel (« disponibilites » → « disponibilite »). */
export function stem(word: string): string {
  if (word.length > 4 && (word.endsWith("s") || word.endsWith("x"))) return word.slice(0, -1);
  return word;
}

/** Remplace les tournures familières par un mot de la base (« pas la » → « absent »). */
export function applySynonyms(normalized: string): string {
  let text = ` ${normalized} `;
  for (const [phrase, replacement] of SYNONYM_PHRASES) {
    text = text.split(` ${phrase} `).join(` ${replacement} `);
  }
  return text.trim();
}

/** Mots utiles d'un texte : normalisés, synonymes appliqués, sans mots vides, racinés. */
export function tokens(text: string): string[] {
  const words = applySynonyms(normalize(text)).split(" ");
  const out: string[] = [];
  for (const raw of words) {
    if (!raw || STOPWORDS.has(raw)) continue;
    const word = stem(SYNONYM_WORDS[raw] ?? raw);
    if (word.length < 2 || STOPWORDS.has(word)) continue;
    out.push(word);
  }
  return out;
}

/** Distance d'édition bornée : renvoie `max + 1` dès qu'elle dépasse `max`. */
export function boundedDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Proximité de deux mots (0–1) : identiques 1 ; une faute de frappe 0,85 ; même racine
 * (« declarer » / « declaration ») 0,75 ; sinon 0.
 */
export function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const shorter = Math.min(a.length, b.length);
  if (shorter >= 4) {
    const allowed = shorter >= 8 ? 2 : 1;
    if (boundedDistance(a, b, allowed) <= allowed) return 0.85;
  }
  const prefix = commonPrefix(a, b);
  if (prefix >= 5 || (prefix >= 4 && prefix === shorter)) return 0.75;
  return 0;
}

/**
 * Score lexical (0–1) entre deux listes de mots : couverture moyenne dans les deux sens, pour
 * qu'une question courte ne colle pas à une fiche longue sur un seul mot.
 */
export function lexicalSimilarity(query: readonly string[], candidate: readonly string[]): number {
  if (query.length === 0 || candidate.length === 0) return 0;
  const best = (word: string, pool: readonly string[]) =>
    pool.reduce((max, other) => Math.max(max, wordSimilarity(word, other)), 0);
  const forward = query.reduce((sum, w) => sum + best(w, candidate), 0);
  const backward = candidate.reduce((sum, w) => sum + best(w, query), 0);
  return (forward + backward) / (query.length + candidate.length);
}

// ─── Anonymisation ───────────────────────────────────────────────────────────

const MASK = "[…]";
const PATTERNS: RegExp[] = [
  /\b(?:https?:\/\/|www\.)\S+/gi,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b/gi,
  /(?:\+|00)?\d(?:[\s.-]?\d){7,}/g,
  /\d{4,}/g,
];

/** Avant tout enregistrement : liens, emails, IBAN, téléphones et nombres de 4 chiffres masqués. */
export function anonymize(text: string, maxLength = 300): string {
  let out = text;
  for (const pattern of PATTERNS) out = out.replace(pattern, MASK);
  return out.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
