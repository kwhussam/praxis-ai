import { QUESTIONNAIRE_SECTIONS } from "@/lib/security/questionnaire";

describe("questionnaire explanation metadata", () => {
  it("provides one stable introduction for every topic section", () => {
    for (const section of QUESTIONNAIRE_SECTIONS) {
      expect(section.intro.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses question help selectively instead of repeating a fallback hint", () => {
    const questions = QUESTIONNAIRE_SECTIONS.flatMap((section) => section.questions);
    const questionsWithHelp = questions.filter((question) => question.help);

    expect(questionsWithHelp.length).toBeGreaterThan(0);
    expect(questionsWithHelp.length).toBeLessThan(questions.length / 3);
    for (const question of questionsWithHelp) {
      expect(question.help?.trim().length).toBeGreaterThan(0);
    }
  });
});
