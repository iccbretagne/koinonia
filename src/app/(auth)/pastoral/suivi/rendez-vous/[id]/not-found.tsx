import ItemNotFound from "@/components/ItemNotFound";
import { paths } from "@/lib/paths";

export default function NotFound() {
  return <ItemNotFound backHref={paths.care()} backLabel="Retour au suivi pastoral" />;
}
