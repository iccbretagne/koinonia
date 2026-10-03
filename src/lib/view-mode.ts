/**
 * Vue pastorale ou vue classique (admin/planning) dans l'église courante.
 *
 * Le cookie `koinonia-view-mode` est global au compte, alors que le profil pastoral et les rôles
 * sont propres à chaque église : il ne départage que le double rôle (profil pastoral + rôle
 * classique dans l'église courante). Sans rôle classique, la vue pastorale est la seule possible
 * et un cookie `admin` posé dans une autre église ne doit pas l'écarter.
 */
export function isPastoralView({
  isPastoral,
  hasClassicRole,
  viewModeCookie,
}: {
  readonly isPastoral: boolean;
  readonly hasClassicRole: boolean;
  readonly viewModeCookie: string | undefined;
}): boolean {
  if (!isPastoral) return false;
  return !hasClassicRole || viewModeCookie !== "admin";
}
