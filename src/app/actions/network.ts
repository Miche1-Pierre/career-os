"use server";

import { USER } from "@/server/context";
import { runAction } from "@/server/action-utils";
import type { ContactInput, OrganizationInput } from "@/lib/schemas";
import * as orgs from "@/server/services/organizations";
import * as people from "@/server/services/contacts";

export async function createOrganizationAction(input: OrganizationInput) {
  return runAction(async () => ({ id: (await orgs.createOrganization(input, USER)).id }));
}

export async function updateOrganizationAction(id: string, patch: Partial<OrganizationInput>) {
  return runAction(async () => ({ id: (await orgs.updateOrganization(id, patch, USER)).id }));
}

export async function archiveOrganizationAction(id: string, archived: boolean) {
  return runAction(async () => {
    await orgs.setOrganizationArchived(id, archived, USER);
    return null;
  });
}

export async function deleteOrganizationAction(id: string) {
  return runAction(async () => {
    await orgs.softDeleteOrganization(id, USER);
    return null;
  });
}

export async function restoreOrganizationAction(id: string) {
  return runAction(async () => {
    await orgs.restoreOrganization(id, USER);
    return null;
  });
}

export async function purgeOrganizationAction(id: string) {
  return runAction(async () => {
    await orgs.hardDeleteOrganization(id, USER);
    return null;
  });
}

export async function createContactAction(input: ContactInput) {
  return runAction(async () => ({ id: (await people.createContact(input, USER)).id }));
}

export async function updateContactAction(id: string, patch: Partial<ContactInput>) {
  return runAction(async () => ({ id: (await people.updateContact(id, patch, USER)).id }));
}

export async function deleteContactAction(id: string) {
  return runAction(async () => {
    await people.softDeleteContact(id, USER);
    return null;
  });
}

export async function restoreContactAction(id: string) {
  return runAction(async () => {
    await people.restoreContact(id, USER);
    return null;
  });
}

export async function purgeContactAction(id: string) {
  return runAction(async () => {
    await people.hardDeleteContact(id, USER);
    return null;
  });
}
