import { seedDemoData, hasDemoData } from "@/server/services/demo";
import { getToday } from "@/server/services/today";
import { getDashboard, getAnalytics } from "@/server/services/analytics";
import { searchAll } from "@/server/services/search";
import { evaluatePeriodicRules } from "@/server/services/rules";
import { listDocuments } from "@/server/services/documents";
async function main() {
  if (!(await hasDemoData())) console.log("seed:", await seedDemoData());
  console.log("rules:", await evaluatePeriodicRules());
  const t = await getToday();
  console.log("today counts:", t.counts);
  for (const s of ["overdue","dueToday","upcoming"] as const) console.log(s, t[s].map(i => `${i.kind} ${i.date}${i.time? " "+i.time:""} ${i.title} [${i.due.label}]`));
  console.log("waiting", t.waiting.map(i => i.title));
  console.log("missing docs", t.missingDocuments.map(i => `${i.title}: ${i.subtitle}`));
  console.log("suggestions", t.suggestions.map(n => n.title + " — " + n.body));
  const d = await getDashboard();
  console.log("kpis", d.kpis, "goals", d.goals.map(g => `${g.goal.title}: ${g.current}/${g.goal.target}`));
  const a = await getAnalytics({ segment: "cv" });
  console.log("overall", a.overall, "segments", a.segments.map(s => `${s.key}: ${s.applications} app, ${s.interviews} itw`));
  console.log("search zefir", (await searchAll("zefir")).map(h => `${h.type}:${h.title}`));
  const docs = await listDocuments();
  console.log("docs", docs.map(x => `${x.name} v${x.latest?.version} used=${x.usageCount} status=${x.latest?.fileStatus}`));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
