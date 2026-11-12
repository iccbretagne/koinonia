import { requireAuth } from "@/lib/auth";
import { OAuthError, UntrustedRedirectError, enabledChurchesFor, validateAuthorizationRequest } from "@/modules/mcp";
import { authorizeQuerySchema } from "@/app/api/mcp/oauth/authorize/contract";
import PageHeader from "@/components/ui/PageHeader";
import Alert from "@/components/ui/Alert";
import AuthorizeForm from "./AuthorizeForm";

/** Ce qu'un assistant connecté peut lire (spec 081) ; les actions sont une case à part (lot 2). */
const READS = [
  "votre planning, vos services et vos absences",
  "les événements à venir et ceux de vos équipes",
  "vos demandes et, si vous en traitez, les demandes à traiter",
  "les comptes rendus, la bibliothèque audio et le guide, selon votre rôle",
];

/**
 * Écran d'autorisation d'un assistant IA (spec 081, ADR-0029) : la personne connectée choisit
 * l'église et autorise ou refuse. Le formulaire revient à `POST /api/mcp/oauth/authorize`.
 */
export default async function AuthorizeAssistantPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const raw = Object.fromEntries(
    Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))
  );
  const parsed = authorizeQuerySchema.safeParse(raw);

  let problem: string | null = parsed.success ? null : "Demande de connexion incomplète. Relancez la connexion depuis votre assistant.";
  let clientName = "";
  let returnHost = "";
  if (parsed.success) {
    try {
      const req = await validateAuthorizationRequest({
        clientId: parsed.data.client_id,
        redirectUri: parsed.data.redirect_uri,
        responseType: parsed.data.response_type,
        codeChallenge: parsed.data.code_challenge,
        codeChallengeMethod: parsed.data.code_challenge_method,
        state: parsed.data.state,
        scope: parsed.data.scope,
        resource: parsed.data.resource,
      });
      clientName = req.client.name;
      returnHost = new URL(req.redirectUri).host;
    } catch (error) {
      if (error instanceof UntrustedRedirectError) problem = error.message;
      else if (error instanceof OAuthError) problem = `Demande refusée : ${error.description}.`;
      else throw error;
    }
  }

  const churches = [
    ...new Map(session.user.churchRoles.map((r) => [r.churchId, { id: r.churchId, name: r.church.name }])).values(),
  ];
  const available = problem ? [] : await enabledChurchesFor(churches);

  return (
    <div className="max-w-lg mx-auto space-y-5 pb-28 md:pb-0">
      <PageHeader title="Connecter un assistant IA" />
      {problem ? (
        <Alert tone="danger">{problem}</Alert>
      ) : available.length === 0 ? (
        <Alert tone="warning">
          La connexion des assistants IA n&apos;est activée dans aucune de vos églises. Elle s&apos;active par
          l&apos;administrateur de l&apos;église, dans les paramètres de l&apos;église.
        </Alert>
      ) : (
        <AuthorizeForm
          params={Object.fromEntries(
            Object.entries(parsed.success ? parsed.data : {}).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))
          )}
        >
          <p className="text-sm text-ink">
            <strong>{clientName}</strong> demande à lire vos informations dans Koinonia.
          </p>
          <p className="text-xs text-ink-subtle">
            Après votre choix, vous serez renvoyé vers <strong className="text-ink-muted">{returnHost}</strong>. Si ce
            n&apos;est pas l&apos;assistant que vous utilisez, refusez.
          </p>

          {available.length === 1 ? (
            <>
              <input type="hidden" name="church_id" value={available[0].id} />
              <p className="text-sm text-ink-muted">
                Église : <strong className="text-ink">{available[0].name}</strong>
              </p>
            </>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-ink mb-1">Pour quelle église ?</legend>
              {available.map((c, i) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-ink">
                  <input type="radio" name="church_id" value={c.id} defaultChecked={i === 0} />
                  {c.name}
                </label>
              ))}
            </fieldset>
          )}

          <div className="text-sm text-ink-muted space-y-1">
            <p>L&apos;assistant pourra lire, uniquement ce que vous voyez déjà dans Koinonia :</p>
            <ul className="list-disc pl-5">
              {READS.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p>
              Jamais de suivi pastoral, de coordonnées bancaires ni de coordonnées d&apos;autres personnes.
            </p>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm text-ink">
            <input type="checkbox" name="allow_write" className="mt-1" />
            <span>
              Autoriser aussi des actions, <strong>toujours confirmées par vous</strong>{" "}
              dans l&apos;assistant, selon vos droits dans Koinonia : déclarer une absence et répondre à une
              demande de disponibilité pour vous ; et, si vous êtes responsable, remplir ou recopier un planning,
              relancer les sans-réponse et publier des consignes.
              <span className="block text-xs text-ink-subtle mt-1">
                Sans cette case, l&apos;assistant ne peut rien modifier. Chaque action est journalisée
                « via l&apos;assistant IA ».
              </span>
            </span>
          </label>

          <div className="text-sm text-ink-muted space-y-1">
            <p>
              Ce qu&apos;il lit est envoyé au fournisseur de cet assistant IA. Vous pourrez retirer l&apos;accès à tout
              moment dans « Mon profil › Assistants connectés ».
            </p>
          </div>

        </AuthorizeForm>
      )}
    </div>
  );
}
