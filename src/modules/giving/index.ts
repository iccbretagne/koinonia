export {
  getGivingSettings,
  getPublicGivingPage,
  updateGivingPage,
  givingPublicUrl,
  diffGivingContent,
} from "./services/giving-page";
export type { GivingSettings } from "./services/giving-page";
export { formatIban, ibanError, isValidIban, isValidBic, normalizeIban } from "./services/iban";
export { defaultGivingContent } from "./services/defaults";
export type { GivingPageContent, GivingPageInput, PublicGivingPage } from "./schemas";

export { givingModule } from "./manifest";
