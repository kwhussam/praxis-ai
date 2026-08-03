export type PracticeKind = "general" | "health";
export type OnboardingStatus = "draft" | "invited" | "active" | "suspended" | "archived";

export type BackofficePracticeSummary = {
  id: string;
  display_name: string;
  legal_name: string;
  onboarding_status: OnboardingStatus;
  contact_email: string;
  domain: string | null;
  city: string;
  created_at: string;
};

export type BackofficePracticeDetail = BackofficePracticeSummary & {
  practice_kind: PracticeKind;
  contact_first_name: string;
  contact_last_name: string;
  contact_phone: string;
  street: string;
  postal_code: string;
  country_code: string;
  owner_id: string | null;
  updated_at: string;
};

export type BackofficePracticePage = {
  practices: BackofficePracticeSummary[];
  page: {
    offset: number;
    limit: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  permissions: { canCreate: boolean };
};

export type BackofficePracticeDetailResponse = {
  practice: BackofficePracticeDetail;
  permissions: { canManage: boolean; canManageAssignments: boolean };
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

export type UpdatePracticeInput = Omit<CreatePracticeInput, "practiceKind">;

export type PracticeMemberRole = "practice_owner" | "practice_manager" | "assessor" | "viewer";
export type BackofficeInvitation = {
  id: string;
  target_email: string;
  intended_role: PracticeMemberRole;
  delivery_channel: "in_person_code" | "email_link";
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
  created_at: string;
};
export type BackofficeMembership = {
  id: string;
  user_id: string;
  role: PracticeMemberRole;
  status: "active" | "revoked";
  granted_at: string;
  revoked_at: string | null;
};
export type CreateInvitationResult = {
  ok: true;
  invitation_id: string;
  expires_at: string;
  code: string;
};

// Wie der Admin die Identität der Person vor dem Reset geprüft hat. Muss vom
// Backend (B5b) akzeptiert werden; wird als Pflichtattestierung mitgeschickt.
export type PasswordResetIdentityVerification = "in_person" | "phone_verified";

// Antwort des B5b-Endpoints: der Einmalcode wird ausschließlich hier einmalig
// zurückgegeben und darf clientseitig weder persistiert noch geloggt werden.
export type BackofficePasswordResetResult = {
  resetRequestId: string;
  code: string;
  expiresAt: string;
};

export type BackofficeAuditEvent = {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  practice_id: string | null;
  result: string;
  request_id: string | null;
  created_at: string;
};
export type BackofficeConsultant = { user_id: string; email: string; status: "active" | "suspended" };
export type BackofficeConsultantAssignment = {
  id: string; staff_user_id: string; email: string; assignment_purpose: string | null;
  status: "active" | "revoked"; assigned_at: string; revoked_at: string | null;
};
