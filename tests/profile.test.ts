import { describe, expect, it } from "vitest";
import { flattenSkillGroups, groupSkills, guessSkillCategory, OTHER_GROUP } from "@/lib/skills";
import { profileSchema } from "@/lib/schemas";

describe("skill categories", () => {
  it("guesses a category from whole words, the longest keyword winning", () => {
    expect(guessSkillCategory("Python")).toBe("Ingénierie logicielle");
    expect(guessSkillCategory("Next.js")).toBe("Ingénierie logicielle");
    expect(guessSkillCategory("PostgreSQL")).toBe("Ingénierie logicielle");
    expect(guessSkillCategory("Domain-driven design")).toBe("Ingénierie logicielle");
    expect(guessSkillCategory("Orchestration multi-agents")).toBe("IA & systèmes d'IA");
    expect(guessSkillCategory("Claude Code")).toBe("Qualité & outils");
    expect(guessSkillCategory("Claude")).toBe("IA & systèmes d'IA");
    expect(guessSkillCategory("Keycloak")).toBe("Sécurité & infrastructure"); // "ia" is not a word of Keycloak
    expect(guessSkillCategory("Automatisation de workflows")).toBe("Product engineering"); // plural tolerated
    expect(guessSkillCategory("Conception d'API")).toBe("Product engineering");
    expect(guessSkillCategory("21 CFR Part 11")).toBe("Réglementaire");
    expect(guessSkillCategory("Négociation")).toBeNull();
  });

  it("keeps the user's layout, drops removed skills and files new ones by category", () => {
    const groups = groupSkills(
      ["Python", "TDD", "Docker", "MCP", "Négociation"],
      [
        { name: "Mes langages", skills: ["python", "Rust"] }, // Rust was removed from the list
        { name: "Vide", skills: [] },
      ],
    );
    expect(groups).toEqual([
      { name: "Mes langages", skills: ["Python"] }, // spelling of the flat list wins
      { name: "Qualité & outils", skills: ["TDD"] },
      { name: "Sécurité & infrastructure", skills: ["Docker"] },
      { name: "IA & systèmes d'IA", skills: ["MCP"] },
      { name: OTHER_GROUP, skills: ["Négociation"] },
    ]);
  });

  it("flattens a layout without duplicates", () => {
    expect(flattenSkillGroups([{ name: "A", skills: ["React", " Docker "] }, { name: "B", skills: ["react", "Git"] }])).toEqual(["React", "Docker", "Git"]);
  });

  it("accepts profiles saved before skill groups existed", () => {
    expect(profileSchema.parse({ skills: ["Python"] }).skillGroups).toEqual([]);
  });
});
