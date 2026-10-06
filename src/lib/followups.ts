/**
 * Deterministic follow-up engine (no AI involved): interval resolution + next date computation.
 */
import type { OpportunityType } from "./constants";
import { addBusinessDays, addInterval, maxISO, type BusinessCalendar, type ISODate } from "./dates";

export interface FollowUpSettingsLike {
  defaultDays: Record<OpportunityType, number>;
  businessDays: boolean;
  holidays: "FR" | "NONE";
  recruiterDays: number;
  postInterviewDays: number;
}

export interface FollowUpOpportunityLike {
  type: OpportunityType;
  source?: string | null;
  followUpIntervalDays?: number | null;
  followUpBusinessDays?: boolean | null;
  expectedResponseAt?: ISODate | null;
}

export type IntervalReason = "custom" | "recruiter" | "post_interview" | "type_default";

export interface ResolvedInterval {
  days: number;
  businessDays: boolean;
  reason: IntervalReason;
}

export function resolveFollowUpInterval(
  opportunity: FollowUpOpportunityLike,
  settings: FollowUpSettingsLike,
  context: { afterInterview?: boolean } = {},
): ResolvedInterval {
  const businessDays = opportunity.followUpBusinessDays ?? settings.businessDays;
  if (opportunity.followUpIntervalDays != null) return { days: opportunity.followUpIntervalDays, businessDays, reason: "custom" };
  if (context.afterInterview) return { days: settings.postInterviewDays, businessDays, reason: "post_interview" };
  if (opportunity.source === "RECRUITER") return { days: settings.recruiterDays, businessDays, reason: "recruiter" };
  return { days: settings.defaultDays[opportunity.type] ?? 7, businessDays, reason: "type_default" };
}

/**
 * Next follow-up date from a reference date (application or last contact).
 * Returns null when follow-ups are disabled (interval = 0).
 * If the organization announced an answer date, the follow-up is never before the next business day after it.
 */
export function computeNextFollowUp(
  from: ISODate,
  interval: ResolvedInterval,
  options: { calendar?: BusinessCalendar; expectedResponseAt?: ISODate | null } = {},
): ISODate | null {
  if (interval.days <= 0) return null;
  const next = addInterval(from, interval.days, { businessDays: interval.businessDays, calendar: options.calendar });
  if (options.expectedResponseAt && options.expectedResponseAt >= from) {
    const afterAnnounced = addBusinessDays(options.expectedResponseAt, 1, options.calendar);
    return maxISO(next, afterAnnounced);
  }
  return next;
}

export function describeInterval(interval: ResolvedInterval): string {
  const unit = interval.businessDays ? "business day" : "day";
  const plural = interval.days === 1 ? unit : `${unit}s`;
  const why =
    interval.reason === "custom"
      ? "custom"
      : interval.reason === "recruiter"
        ? "recruiter rule"
        : interval.reason === "post_interview"
          ? "after interview"
          : "default";
  return interval.days <= 0 ? "No automatic follow-up" : `+${interval.days} ${plural} (${why})`;
}
