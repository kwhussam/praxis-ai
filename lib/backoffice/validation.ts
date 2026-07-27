import type { CreatePracticeInput } from "@/lib/backoffice/types";

export function validatePracticeInput(input: CreatePracticeInput) {
  const required = [
    input.legalName,
    input.displayName,
    input.contactFirstName,
    input.contactLastName,
    input.contactPhone,
    input.street,
    input.postalCode,
    input.city,
    input.countryCode
  ];
  if (required.some((value) => value.trim().length === 0)) return "Bitte alle Pflichtfelder ausfüllen.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail.trim())) {
    return "Bitte eine gültige Kontakt-E-Mail eingeben.";
  }
  if (!/^\d{5}$/.test(input.postalCode.trim())) return "Die Postleitzahl muss fünf Ziffern enthalten.";
  if (input.domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(input.domain.trim())) {
    return "Bitte eine gültige Domain ohne https:// eingeben.";
  }
  return null;
}
