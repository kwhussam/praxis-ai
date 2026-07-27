import type { CreatePracticeInput } from "@/lib/backoffice/types";
import { validatePracticeInput } from "@/lib/backoffice/validation";

const validInput: CreatePracticeInput = {
  practiceKind: "health",
  legalName: "Praxis am Markt GmbH",
  displayName: "Praxis am Markt",
  contactFirstName: "Mina",
  contactLastName: "Muster",
  contactEmail: "mina@example.test",
  contactPhone: "+49 30 123456",
  street: "Markt 1",
  postalCode: "10115",
  city: "Berlin",
  countryCode: "DE",
  domain: "praxis.example"
};

describe("B3 practice form validation", () => {
  it("accepts complete professional master data", () => {
    expect(validatePracticeInput(validInput)).toBeNull();
  });

  it("rejects a missing required field", () => {
    expect(validatePracticeInput({ ...validInput, legalName: "" })).toBe("Bitte alle Pflichtfelder ausfüllen.");
  });

  it("rejects an invalid email address", () => {
    expect(validatePracticeInput({ ...validInput, contactEmail: "not-an-email" })).toBe(
      "Bitte eine gültige Kontakt-E-Mail eingeben."
    );
  });

  it("rejects a non-German postal code shape", () => {
    expect(validatePracticeInput({ ...validInput, postalCode: "1234" })).toBe(
      "Die Postleitzahl muss fünf Ziffern enthalten."
    );
  });

  it("allows an empty optional domain but rejects a URL", () => {
    expect(validatePracticeInput({ ...validInput, domain: "" })).toBeNull();
    expect(validatePracticeInput({ ...validInput, domain: "https://praxis.example" })).toBe(
      "Bitte eine gültige Domain ohne https:// eingeben."
    );
  });
});
