export type PracticeKind = "general" | "health";
export type OnboardingStatus = "draft" | "invited" | "active" | "suspended" | "archived";

export type BackofficePracticeSummary = {
  id: string;
  display_name: string;
  legal_name: string;
  onboarding_status: OnboardingStatus;
  contact_email: string;
  domain: string | null;
  created_at: string;
};

export type CreatePracticeInput = {
  practiceKind: PracticeKind;
  legalName: string;
  displayName: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string;
  street: string;
  postalCode: string;
  city: string;
  countryCode: string;
  domain?: string;
};

export type CreatePracticeResult = {
  ok: true;
  practice_id: string;
  onboarding_status: OnboardingStatus;
};

