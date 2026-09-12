import { describe, it, expect } from "vitest";
import { RequestType } from "@/generated/prisma/client";
import {
  REQUEST_TYPE_FUNCTION,
  functionForRequestType,
  requestTypesForFunction,
  formatAssignedDepts,
  DEPT_FN,
  DEPT_FN_LABEL,
} from "../department-functions";

describe("REQUEST_TYPE_FUNCTION (spec 046)", () => {
  it("couvre exhaustivement toutes les valeurs de RequestType", () => {
    const allTypes = Object.values(RequestType);
    for (const type of allTypes) {
      expect(REQUEST_TYPE_FUNCTION[type]).toBeDefined();
    }
    expect(Object.keys(REQUEST_TYPE_FUNCTION).sort()).toEqual(allTypes.sort());
  });

  it("functionForRequestType est l'inverse de requestTypesForFunction", () => {
    for (const fn of Object.values(DEPT_FN)) {
      for (const type of requestTypesForFunction(fn)) {
        expect(functionForRequestType(type)).toBe(fn);
      }
    }
  });
});

describe("formatAssignedDepts (spec 046)", () => {
  it("affiche la fonction marquée non configurée quand 0 département", () => {
    expect(formatAssignedDepts(DEPT_FN.MSDP, [])).toBe(
      `${DEPT_FN_LABEL.MSDP} (non configuré)`
    );
  });

  it("affiche le nom du département quand il n'y en a qu'un", () => {
    expect(formatAssignedDepts(DEPT_FN.SECRETARIAT, [{ name: "Secrétariat général" }])).toBe(
      "Secrétariat général"
    );
  });

  it("affiche les noms triés séparés par une virgule quand il y en a plusieurs", () => {
    expect(
      formatAssignedDepts(DEPT_FN.INTEGRATION, [
        { name: "Intégration Jeunes" },
        { name: "Accueil" },
      ])
    ).toBe("Accueil, Intégration Jeunes");
  });
});
