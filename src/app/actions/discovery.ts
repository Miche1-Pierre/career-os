"use server";

import { USER } from "@/server/context";
import { runAction } from "@/server/action-utils";
import * as discovery from "@/server/services/discovery";

export async function createSearchAction(input: Record<string, unknown>) {
  return runAction(async () => ({ id: (await discovery.createSearch(input, USER)).id }));
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
