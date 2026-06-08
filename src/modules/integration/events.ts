export type IntegrationEvents = {
  "family.assigned": {
    requestId: string;
    churchId: string;
    bergerId: string;
    familyId: number;
    familyName: string;
  };
  "family.contacted":     { requestId: string; churchId: string };
  "family.whatsapp_added":{ requestId: string; churchId: string };
  "family.integrated":    { requestId: string; churchId: string };
  "family.abandoned":     { requestId: string; churchId: string; reason?: string };
  "family.reopened":      { requestId: string; churchId: string };
};
