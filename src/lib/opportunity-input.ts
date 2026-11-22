import type { OpportunityInput } from "./schemas";
import type { OpportunityType } from "./constants";

/** Converts a stored opportunity into the editable form shape. */
export function opportunityToInput(o: {
  type: OpportunityType;
  title: string;
  organizationId: string | null;
  organization?: { name: string } | null;
  stage?: { key: string } | null;
  priority: OpportunityInput["priority"];
  source: string | null;
  sourceDetail: string | null;
  url: string | null;
  links: OpportunityInput["links"];
  locationCity: string | null;
  locationCountry: string | null;
  locationText: string | null;
  remotePolicy: OpportunityInput["remotePolicy"];
  summary: string | null;
  description: string | null;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  skills: string[];
  technologies: string[];
  benefits: string[];
  requiredDocuments: string[];
  details: OpportunityInput["details"];
  deadline: string | null;
  deadlineTime: string | null;
  applicationOpensAt: string | null;
  discoveredAt: string | null;
  appliedAt: string | null;
  expectedResponseAt: string | null;
  nextFollowUpAt: string | null;
  followUpIntervalDays: number | null;
  followUpBusinessDays: boolean | null;
  notes: string | null;
  tags: string[];
}): OpportunityInput {
  return {
    type: o.type,
    title: o.title,
    organizationId: o.organizationId,
    organizationName: o.organization?.name ?? null,
    status: o.stage?.key ?? null,
    priority: o.priority,
    source: o.source,
    sourceDetail: o.sourceDetail,
    url: o.url,
    links: o.links ?? [],
    locationCity: o.locationCity,
    locationCountry: o.locationCountry,
    locationText: o.locationText,
    remotePolicy: o.remotePolicy,
    summary: o.summary,
    description: o.description,
    responsibilities: o.responsibilities ?? [],
    requirements: o.requirements ?? [],
    niceToHave: o.niceToHave ?? [],
    skills: o.skills ?? [],
    technologies: o.technologies ?? [],
    benefits: o.benefits ?? [],
    requiredDocuments: o.requiredDocuments ?? [],
    details: o.details ?? {},
    deadline: o.deadline,
    deadlineTime: o.deadlineTime,
    applicationOpensAt: o.applicationOpensAt,
    discoveredAt: o.discoveredAt,
    appliedAt: o.appliedAt,
    expectedResponseAt: o.expectedResponseAt,
    nextFollowUpAt: o.nextFollowUpAt,
    followUpIntervalDays: o.followUpIntervalDays,
    followUpBusinessDays: o.followUpBusinessDays,
    notes: o.notes,
    tags: o.tags ?? [],
  };
}

export function emptyOpportunityInput(type: OpportunityType): OpportunityInput {
  return {
    type,
    title: "",
    organizationId: null,
    organizationName: null,
    status: null,
    priority: "NORMAL",
    source: null,
    links: [],
    responsibilities: [],
    requirements: [],
    niceToHave: [],
    skills: [],
    technologies: [],
    benefits: [],
    requiredDocuments: [],
    details: {},
    tags: [],
  };
}
