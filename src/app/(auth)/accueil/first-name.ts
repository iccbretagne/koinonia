/**
 * Prénom à afficher dans la salutation. Le nom du compte peut être saisi « NOM Prénom » (usage
 * courant) : un mot entièrement en capitales est alors pris pour le nom de famille et écarté,
 * sauf s'il est le seul mot.
 */
export function pickFirstName(name: string | null | undefined): string | null {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length === 0) return null;
  const isSurname = (w: string) => w.length > 1 && w === w.toLocaleUpperCase("fr-FR") && w !== w.toLocaleLowerCase("fr-FR");
  return words.find((w) => !isSurname(w)) ?? words[0];
}
