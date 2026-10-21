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
export { setGivingLogo, getGivingLogoStream, getPublicGivingLogoStream, LOGO_MAX_BYTES } from "./services/logo";
export type { GivingPageContent, GivingPageInput, PublicGivingPage } from "./schemas";

export { givingModule } from "./manifest";
