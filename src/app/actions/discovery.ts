"use server";

import { USER } from "@/server/context";
import { runAction } from "@/server/action-utils";
import * as discovery from "@/server/services/discovery";

export async function createSearchAction(input: Record<string, unknown>) {
  return runAction(async () => ({ id: (await discovery.createSearch(input, USER)).id }));
}

export async function detectCareersBoardAction(url: string) {
  return runAction(() => discovery.detectCareersBoard(url));
}

export async function updateSearchAction(id: string, patch: Record<string, unknown>) {
  return runAction(async () => {
    await discovery.updateSearch(id, patch, USER);
    return null;
  });
}

export async function deleteSearchAction(id: string) {
  return runAction(async () => discovery.deleteSearch(id, USER));
}

export async function runSearchAction(id: string) {
  return runAction(async () => {
    const run = await discovery.runSearch(id, USER, { trigger: "MANUAL" });
    return { status: run.status, resultsNew: run.resultsNew, resultsFound: run.resultsFound, error: run.error };
  });
}

/** What the search form needs when it is shown outside the Recherches page (in the chat). */
export async function getSearchFormDataAction() {
  return runAction(async () => {
    const { listMoves } = await import("@/server/services/moves");
    const moves = await listMoves();
    return {
      moves: moves.map((m) => ({ id: m.id, title: m.title, city: m.city, country: m.country, arrivalDate: m.arrivalDate, departureDate: m.departureDate, workAddress: m.workAddress, currency: m.currency })),
      adzunaReady: !!(process.env.ADZUNA_APP_ID?.trim() && process.env.ADZUNA_APP_KEY?.trim()),
    };
  });
}
