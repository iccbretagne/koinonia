/**
 * Change le statut d'une annonce emploi (offre, demandeur, mission ou profil freelance) via
 * son endpoint PATCH, puis rafraîchit la page ; une erreur est signalée par une alerte.
 */
export async function changeJobStatus(
  endpoint: string,
  status: string,
  { setLoading, refresh }: { setLoading: (loading: boolean) => void; refresh: () => void }
) {
  setLoading(true);
  try {
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error || "Erreur");
      return;
    }
    refresh();
  } finally {
    setLoading(false);
  }
}
