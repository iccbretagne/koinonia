import ItemNotFound from "@/components/ItemNotFound";
import { paths } from "@/lib/paths";

export default function NotFound() {
  return <ItemNotFound backHref={paths.integration.requests()} backLabel="Retour aux demandes d'intégration" />;
}
