# Éditeur de billets V2

La V2 est disponible en recette dans la version `1.42.0-6736889` (commit `67368890`). GitHub a validé la compilation Turbopack, les tests, CodeQL et SonarCloud. Le déploiement de l’application et la démo locale n’ont entraîné aucune publication de modèle. Le parcours avec un billet de test, l’impression et le scan réel restent à valider.

[Spec 088](../specs/088-visuel-billet/spec.md) · [PR #775](https://github.com/iccbretagne/koinonia/pull/775) · [CI](https://github.com/iccbretagne/koinonia/actions/runs/45291342014) · [Déploiement recette](https://github.com/iccbretagne/koinonia/actions/runs/45291337522)

## Diagnostic du code initial

| Couche | Fichiers | Constats vérifiés |
| --- | --- | --- |
| Stockage | `prisma/schema.prisma`, modèle `TicketingEvent`, modèle `TicketingTicketImage` | Deux colonnes JSON nullables `ticketVisualDraft`/`ticketVisualPublished` ; images WebP binaires attachées à un événement. Pas de table de versions historiques. |
| Document | `src/modules/ticketing/ticket-visual-schemas.ts` | V1 : surface 1000 × 1500, fond obligatoire, QR carré, quatre zones fixes participant/date/lieu/adresse. Familles sans/serif/mono ; taille limitée à 100. |
| Éditeur | `src/app/(auth)/evenements/billetterie/[id]/_components/TicketVisualTab.tsx` | Formulaires de coordonnées, aperçu PNG serveur différé ; pas de composition libre ni d'alignements dans le document initial. |
| Services | `src/modules/ticketing/services/ticket-visual.ts` | Validation Zod, appartenance des images à l'événement, transactions/verrou SQL pour les références d'images, audit ; brouillon indépendant du publié. |
| Rendu | `src/modules/ticketing/services/ticket-render.ts` | Sharp compose fond, SVG texte et QR ; le PDF React PDF embarque ce même PNG sur une page 400 × 600 points. |
| Ressources | `src/modules/ticketing/services/site-assets.ts`, `ticket-visual.ts` | Traitement d'image existant réutilisé : réencodage WebP, suppression des métadonnées, limites de taille/dimensions. Pas de police externe téléchargée au rendu. |
| API | `src/app/api/ticketing/events/[id]/ticket-visual/` et ses sous-routes | Lecture, PUT explicite avec `publish=false` par défaut, retrait, images, aperçu GET/POST limité en fréquence. |
| Droits | `src/modules/ticketing/auth.ts` | L'église de l'événement fait foi. Hors périmètre : 404 ; mutation `configure` : organisateur ou gestionnaire autorisé. Les routes exécutent le contrôle serveur. |
| QR | `services/booking.ts`, `services/tokens.ts`, `services/snapshot.ts`, `services/sync.ts`, `src/lib/qr.ts` | URL du billet issue du jeton existant ; jetons dérivés HMAC par portée, empreintes SHA-256 en base ; contrôles et snapshots réutilisés, sans modification. Matrice QR niveau M. |
| MCP | `src/app/api/mcp/_actions/ticket-visual.ts`, `_actions/ticketing.ts` | Lecture, dépôt, édition et retrait ; mutations avec aperçu, jeton à usage unique, empreinte d'état et revérification des droits à la confirmation. |

La cause principale des textes minuscules est `textSvg` V1 : estimation de largeur à une em par caractère, retours conservateurs, réduction jusqu'à 14 px et ellipsis lorsque la hauteur manque. Ce n'est pas une mesure de la police réelle. La taille maximale ne compense donc pas une zone trop basse. Le modèle ne décrit aucun alignement, composition de variables, interligne réglable ni élément typographique supplémentaire.

## Décisions et évolution

- Conservation du schéma et du rendu V1. Sélection du schéma par `version` avec une union discriminée Zod ; les erreurs V2 portent sur la zone concernée.
- V2 : surface logique stable 1000 × 1500, fond image facultatif ou couleur unie, liste ordonnée d'éléments indépendants `text`, `image`, `shape`, `qrCode`. L'ordre du tableau définit les couches ; le QR est toujours composé en dernier.
- Pas de groupe imbriqué : les éléments indépendants répondent au besoin sans introduire transformations et coordonnées relatives supplémentaires.
- Les colonnes JSON existantes accueillent les deux versions : **aucune migration SQL**, aucune conversion massive et aucun changement de réservation ou de jeton.
- Conversion V1 explicite dans l'éditeur : géométries, images visibles, couleurs, fonds et bordures conservés ; les champs deviennent des variables. Un nom V1 masqué est rétabli en texte dynamique. Les éventuels chevauchements V1 avec le QR doivent être corrigés avant sauvegarde V2. La typographie V2, mieux mesurée, n'est pas pixel identique à V1.
- Publication toujours explicite ; le bouton V2 demande confirmation. Restaurer le publié remplace seulement le document en cours d'édition. Il n'existe pas de retour à une publication plus ancienne que celle encore stockée : cela nécessiterait une véritable table d'historique.

## Texte et données dynamiques

`services/ticket-text-layout.ts` mesure les pixels avec Sharp/Pango, puis rend chaque ligne avec les mêmes paramètres. Le placement tient compte de l'encombrement réel, des marges internes, des alignements horizontal/vertical, de l'interligne et de l'espacement des lettres. Les mots trop longs sont coupés entre graphèmes Unicode. Les sauts de ligne explicites sont conservés ; les espaces horizontaux sont normalisés en mode de retour automatique.

- `fixed` : taille imposée, sauts explicites seulement ; erreur si le contenu dépasse.
- `wrap` : taille imposée et retours automatiques ; erreur si la hauteur ou le nombre de lignes manque.
- `shrink` : retours automatiques, puis recherche dichotomique de la plus grande taille qui tient entre minimum et maximum.

**Aucune troncature V2.** Si même la taille minimale ne permet pas de lire le texte entier, le serveur renvoie 422 avec le nom de l'élément et demande d'agrandir la zone, de revoir la taille minimale ou le nombre de lignes. L'éditeur affiche l'erreur et bloque la publication depuis son aperçu. Le service de sauvegarde fait également un rendu du profil long, y compris pour les clients qui contournent le navigateur. Un futur participant plus long que les profils doit encore tenir dans les contraintes : sinon son téléchargement renvoie une erreur explicite. Il n'est jamais remplacé silencieusement par un nom incomplet.

Variables autorisées, sans expressions ni JavaScript :

```text
participant.firstName, participant.lastName, participant.name
ticket.category, ticket.reference
event.title, event.date, event.startTime, event.endTime, event.location, event.address
```

Exemples : `{participant.firstName} {participant.lastName}` ; `{event.date} · {event.startTime}`. Les valeurs sont échappées avant le markup Pango ; le QR n'est pas une variable éditable. Nom complet dynamique obligatoire, dans une zone ou en prénom/nom séparés. Formats `fr-FR`, fuseau `Europe/Paris`, conformément au modèle métier existant qui ne définit pas de fuseau par événement. Pas de données personnelles supplémentaires exposées. `ticket.reference` reprend la référence de réservation déjà affichée, et `ticket.category` le libellé existant de tranche d’âge : aucun nouveau concept métier.

Trois familles autorisées sont résolues vers DejaVu Sans, Serif et Sans Mono, en normal/gras. Installer `fonts-dejavu-core` sur les hôtes Linux ; ajouté à l'image de développement. La couverture des écritures dépend des polices installées. Aucun téléchargement de police, aucune nouvelle dépendance npm. La déclaration locale `src/types/sharp.d.ts` a été complétée pour le chargement de texte Pango, déjà disponible dans Sharp installé.

## Interface et contraintes serveur

`TicketVisualV2Tab.tsx` ajoute sélection/renommage, ordre des couches, position/dimensions, duplication/suppression, verrouillage de position, historique borné à 50 états, retour au publié, formulaires de typographie/variables et ajout d'images/décors. Déplacement/redimensionnement via Pointer Events natifs ; accrochage à 10 unités des bords et du centre. Un déplacement correspond à une seule opération d'historique. Les coordonnées restent modifiables au clavier via le panneau. Zoom et largeur adaptative, repères centraux et zone indicative d'impression à 30 unités des bords. Mise en page en colonne sur mobile.

Le navigateur affiche **le PNG serveur**, pas une imitation CSS : les pixels des textes et du QR sont ceux du téléchargement final. Pendant une modification, il garde l'aperçu précédent avec un indicateur de mise à jour. Le moteur reste soumis aux dimensions/contraintes définies côté serveur. Les images ne peuvent venir que de l'événement ; aucune URL graphique arbitraire dans le document.

Un QR unique, carré de 180 à 600 unités, est obligatoire. Fond blanc, contraste noir/blanc et silence de quatre modules imposés. Avertissement sous 240 unités. Les zones texte/image qui empiètent sur son rectangle sont refusées ; les décors passent derrière lui. Aucun autre élément ne peut remplacer sa valeur. Les jetons, scans en ligne/hors ligne, paiements et inscriptions restent inchangés. Le statut actif du billet est revérifié après le rendu.

Bornes V2 : 50 éléments, 2 000 caractères par élément et 10 000 caractères de modèles de texte par document, styles/polices/couleurs strictement validés, positions entières à l'intérieur de la surface.

Les API existantes et MCP acceptent V1/V2. L'aperçu HTTP propose `profile=0|1|2|3` (défaut 3) et `category=adult|child`. MCP conserve `preview` puis `confirm`, `publish=false` par défaut ; l'empreinte de confirmation inclut aussi le titre et l'heure de fin désormais affichables. OpenAPI est régénéré depuis les contrats.

## Démonstration Nuit de la Traversée

Consultation de recette uniquement le 24 novembre 2026, événement `cmwqp55hu0006axf2g6zypifo`. Son modèle V1 était déjà publié ; aucun changement distant n'a été effectué. Données vérifiées : début **31 décembre 2026 à 18 h**, fin **1er janvier 2027 à 5 h**, Auditorium de Pacé, 7 rue Charles Croizé, 35740 Pacé. « 2027 » dans le titre ne doit pas devenir une date de début inventée.

La bannière familiale HD déjà publique du site de cet événement a été copiée dans `docs/examples/ticket-v2/family.webp`. Source : `/api/ticketing/public/site-assets/cmws4b4gj000bujf26wowbbkr?w=1280` sur l'instance de recette. Elle sert uniquement de fixture locale, sans partage automatique des images entre site et billet.

```bash
npx tsx scripts/demo-ticket-v2.ts
node scripts/test-ticket-v2-browser.mjs
```

Le générateur crée `/tmp/koinonia-ticket-v2/document.json` et `profile-0` à `profile-3` en PNG/PDF. Surface bordeaux, panneau olive, texte doré, bannière familiale, titre, date/heure, lieu/adresse, QR centré de 300 unités et nom complet adaptatif. Profils : Jean Koné, Marie-Claire Ouattara, Jean-Baptiste Kouamé N'Guessan et nom très long ; adulte/enfant alternés. Variables conservées dans le document, données fictives substituées seulement au rendu. `demo-family` est un identifiant local : pour utiliser ce document sur une instance, déposer l'image du billet puis remplacer cet identifiant par celui retourné pour l'événement. Aucun fichier produit n'est un billet valable, aucun email ni publication.

## Vérifications et limites

Les tests automatisés couvrent V1/V2, conversion, validation géométrique/variables, longues chaînes et accents, alignements, retours explicites, erreurs de débordement, pixels communs aperçu/final, décodage QR via jsQR, PDF embarquant le PNG, brouillon indépendant du publié, images hors événement, permissions API/MCP et confirmation sans publication implicite. Un ancien lien secret peut rendre V2 sans régénérer de réservation ; une annulation pendant le rendu bloque le téléchargement.

Le script Chrome exécute le composant React avec navigation/API simulées, sans serveur métier : aperçu chargé, ajout, déplacement, redimensionnement, duplication, annuler/rétablir et sauvegarde V2 avec `publish=false`. Il ne remplace pas une recette sur une instance déployée avec MariaDB ni un essai sur imprimante/scanner physique. Les tests de services/routes vérifient séparément droits et persistance avec la base simulée du dépôt.

Le PDF demeure une image 1000 × 1500 sur 400 × 600 points, soit 180 ppp : texte et QR ne sont pas vectoriels. Les glyphes sont rasterisés dans le PNG, sans dépendance aux polices du lecteur PDF. Une sortie 300 ppp/vectorielle serait une évolution distincte. Pas de rotation, groupes, polices personnelles, graisses intermédiaires ou déplacement multisélection. Les recouvrements entre éléments décoratifs et textes restent un choix de composition ; le QR est protégé. La zone de sécurité est un repère, sans fond perdu ou calibrage physique d'imprimante. Le glisser-déposer mobile n'est pas qualifié ; les formulaires et la consultation restent adaptatifs.

## Fichiers livrés et commandes

| Ensemble | Fichiers modifiés ou ajoutés |
| --- | --- |
| Schémas et conversion | `src/modules/ticketing/ticket-visual-schemas.ts` |
| Moteur et persistance | `src/modules/ticketing/services/ticket-render.ts`, `ticket-render-v2.ts`, `ticket-text-layout.ts`, `ticket-visual.ts` |
| Interface | `src/app/(auth)/evenements/billetterie/[id]/_components/TicketVisualTab.tsx`, `TicketVisualV2Tab.tsx` |
| Contrats et intégration | `src/app/api/ticketing/events/[id]/ticket-visual/preview/contract.ts`, `preview/route.ts`, `src/app/api/mcp/_actions/ticket-visual.ts`, `docs/openapi.json` |
| Tests | `src/modules/ticketing/__tests__/ticket-visual.test.ts`, `src/app/api/ticketing/__tests__/ticket-visual-routes.test.ts`, `src/app/api/mcp/__tests__/ticket-visual-actions.test.ts` |
| Démonstration | `scripts/demo-ticket-v2.ts`, `scripts/test-ticket-v2-browser.mjs`, `docs/examples/ticket-v2/document.json`, `family.webp` |
| Correction de build préexistante | `src/app/page.tsx`, `src/app/__tests__/login-stale-cookies.test.ts` : retrait de l’argument par défaut du composant page, incompatible avec les types générés Next ; tests appelant désormais le composant avec un objet de propriétés. Aucun changement de logique de connexion. |
| Environnement | `src/types/sharp.d.ts`, `docker/Dockerfile.dev` |

Validations exécutées :

| Commande | Résultat |
| --- | --- |
| `npm test` | 447 fichiers, 5 524 tests réussis. |
| `npm run typecheck` | Réussi. |
| `npm run lint` | Réussi ; avertissement interne existant de `jsx-ast-utils` sur `AwaitExpression`. |
| `npm run lint:boundaries` | Aucune violation. |
| `npm run lint:prisma-boundary` | Réussi, seuil existant de 141 routes inchangé. |
| `npm run openapi` | Contrats régénérés ; test de fraîcheur réussi. |
| `npx tsx scripts/demo-ticket-v2.ts` | Quatre PNG, quatre PDF et document JSON créés localement ; profil le plus long inspecté visuellement. |
| `node scripts/test-ticket-v2-browser.mjs` | Interactions Chrome et sauvegarde sans publication réussies ; API simulée. |
| `npm run build:worker` | Réussi. |
| `npx next build --webpack` | Réussi : compilation, typage, 270 pages statiques et artefact standalone. Avertissements préexistants : option middleware dépréciée et import de version dans la route health. |
| `npm run build` | Turbopack bloqué par l'environnement : `creating new process / binding to a port / Operation not permitted`, pendant le traitement CSS préexistant du lecteur audio. |

La suite complète comporte des tests d'erreurs volontairement journalisées (S3, cron, Turnstile) : leur présence dans les logs ne correspond pas à des envois ou à des mutations réelles. Le répertoire `security/` préexistant dans l'espace de travail a été laissé intact.
