import Alert from "@/components/ui/Alert";

/**
 * Remplace un formulaire public quand sa protection anti-robots n'est pas configurée
 * (`getTurnstileSiteKey` → `null`) : annoncer l'indisponibilité plutôt que laisser remplir un
 * formulaire qui sera refusé à l'envoi.
 */
export default function PublicFormUnavailable({ churchName }: { readonly churchName: string }) {
  return (
    <Alert tone="warning" title="Formulaire temporairement indisponible.">
      Ce formulaire ne peut pas être envoyé pour le moment. Merci de réessayer plus tard ou de
      contacter directement {churchName}.
    </Alert>
  );
}
