"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, NumberInput } from "@/components/app/fields";
import { SectionHeader } from "@/components/app/sparkle";
import { useAction } from "@/hooks/use-action";
import { updateBudgetAction } from "@/app/actions/moves";
import { computeBudget, oneOffTotal, type BudgetPlan } from "@/lib/relocation";
import type { MoveView } from "@/server/services/moves";
import { cn } from "@/lib/utils";
import { money, savingsTone, signedMoney } from "./format";
import { Approx } from "@/components/app/approx";

const uid = () => Math.random().toString(36).slice(2, 10);

export function BudgetView({ move }: { move: MoveView }) {
  const { run, pending } = useAction();
  const cur = move.currency;
  const [plan, setPlan] = useState<BudgetPlan>(move.budgetPlan);
  const [base, setBase] = useState<BudgetPlan>(move.budgetPlan);
  if (base !== move.budgetPlan) {
    // New data from the server (after a save): reset the form.
    setBase(move.budgetPlan);
    setPlan(move.budgetPlan);
  }
  const dirty = JSON.stringify(plan) !== JSON.stringify(move.budgetPlan);
  const set = <K extends keyof BudgetPlan>(k: K, v: BudgetPlan[K]) => setPlan((p) => ({ ...p, [k]: v }));

  const priced = move.listings.filter((l) => l.total !== null);
  const defaultChoice = move.listings.find((l) => l.status === "CHOSEN")?.id ?? move.summary.bestSavings?.id ?? priced[0]?.id ?? "target";
  const [choice, setChoice] = useState(defaultChoice);
  const selected = move.listings.find((l) => l.id === choice) ?? null;
  const housing = selected?.total ?? plan.housingTarget ?? 0;
  const result = computeBudget(plan, housing, selected ? selected.commuteKm : 0);

  const comparison = useMemo(
    () =>
      move.listings
        .filter((l) => l.open && l.total !== null)
        .map((l) => ({ l, r: computeBudget(plan, l.total!, l.commuteKm) }))
        .sort((a, b) => b.r.savings - a.r.savings),
    [move.listings, plan],
  );

  const deposit = selected?.deposit ?? 0;
  const fees = (selected?.fees ?? []).reduce((s, f) => s + f.amount, 0);
  const upfront = oneOffTotal(plan, deposit + fees + housing);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <section className="space-y-3">
          <SectionHeader title="Revenus" description="Ce que tu es sûr de toucher chaque mois, après impôts." />
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Revenu net / mois" htmlFor="b-income">
              <NumberInput id="b-income" value={plan.income} onChange={(v) => set("income", v ?? 0)} />
            </FormField>
            <FormField label="Note" htmlFor="b-inote" className="sm:col-span-2">
              <Input id="b-inote" value={plan.incomeNote ?? ""} onChange={(e) => set("incomeNote", e.target.value || null)} placeholder="1 600 € annoncés, 1 500 € par prudence" />
            </FormField>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader title="Alimentation" description="Les chèques-repas ne paient que la nourriture : ils réduisent les courses au lieu de compter comme revenu." />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Courses / mois" htmlFor="b-food">
              <NumberInput id="b-food" value={plan.food} onChange={(v) => set("food", v ?? 0)} />
            </FormField>
            <FormField label="Chèques-repas / mois" htmlFor="b-fa">
              <NumberInput id="b-fa" value={plan.foodAllowance} onChange={(v) => set("foodAllowance", v ?? 0)} />
            </FormField>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader title="Transport" description="L'abonnement ne compte que si le logement est plus loin que ta distance à pied." />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Transports en commun / mois" htmlFor="b-tr">
              <NumberInput id="b-tr" value={plan.transitMonthly} onChange={(v) => set("transitMonthly", v ?? 0)} />
            </FormField>
            <FormField label="Je marche jusqu'à (km)" htmlFor="b-walk">
              <NumberInput id="b-walk" value={plan.walkThresholdKm} onChange={(v) => set("walkThresholdKm", v ?? 0)} step={0.1} />
            </FormField>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Autres dépenses mensuelles"
            action={
              <Button variant="ghost" size="sm" onClick={() => set("lines", [...plan.lines, { id: uid(), label: "Nouvelle dépense", amount: 0, kind: "EXPENSE", note: null }])}>
                <Plus /> Ajouter
              </Button>
            }
          />
          <div className="space-y-2">
            {plan.lines.map((line, i) => (
              <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2">
                <Input value={line.label} aria-label="Dépense" onChange={(e) => set("lines", plan.lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <NumberInput value={line.amount} onChange={(v) => set("lines", plan.lines.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)))} />
                <Button variant="ghost" size="icon-sm" aria-label="Retirer" onClick={() => set("lines", plan.lines.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader title="Objectifs" />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Budget logement (tout compris)" htmlFor="b-ht">
              <NumberInput id="b-ht" value={plan.housingTarget} onChange={(v) => set("housingTarget", v)} />
            </FormField>
            <FormField label="Objectif d'épargne / mois" htmlFor="b-st">
              <NumberInput id="b-st" value={plan.savingsTarget} onChange={(v) => set("savingsTarget", v)} />
            </FormField>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Coûts ponctuels"
            description="Payés une fois : voyage, installation… La garantie et le premier mois du logement sélectionné sont ajoutés automatiquement."
            action={
              <Button variant="ghost" size="sm" onClick={() => set("oneOff", [...plan.oneOff, { id: uid(), label: "Nouveau coût", amount: 0 }])}>
                <Plus /> Ajouter
              </Button>
            }
          />
          <div className="space-y-2">
            {plan.oneOff.map((o, i) => (
              <div key={o.id} className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2">
                <Input value={o.label} aria-label="Coût" onChange={(e) => set("oneOff", plan.oneOff.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <NumberInput value={o.amount} onChange={(v) => set("oneOff", plan.oneOff.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)))} />
                <Button variant="ghost" size="icon-sm" aria-label="Retirer" onClick={() => set("oneOff", plan.oneOff.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </section>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-separator bg-background/90 py-3 backdrop-blur">
          {dirty && <span className="mr-auto text-xs text-muted-foreground">Modifications non enregistrées</span>}
          <Button variant="outline" disabled={!dirty} onClick={() => setPlan(move.budgetPlan)}>
            Réinitialiser
          </Button>
          <Button variant="highlight" disabled={!dirty || pending} onClick={() => run(() => updateBudgetAction(move.id, plan), { success: "Budget enregistré" })}>
            Enregistrer le budget
          </Button>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Logement utilisé pour le calcul</span>
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="target">Mon budget logement ({money(plan.housingTarget, cur)})</SelectItem>
                {priced.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.title} · {money(l.total, cur)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <dl className="divide-y divide-separator text-sm">
            <Line label="Revenu net" value={money(result.income, cur)} />
            <Line label="Logement (loyer + charges)" value={`− ${money(result.housing, cur)}`} />
            <Line label="Courses non couvertes par les chèques-repas" value={`− ${money(result.foodOutOfPocket, cur)}`} />
            <Line label={result.walkable ? "Transport (à pied)" : "Transport"} value={`− ${money(result.transport, cur)}`} />
            {plan.lines.map((l) => (
              <Line key={l.id} label={l.label} value={`− ${money(l.amount, cur)}`} />
            ))}
          </dl>
          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="heading-sm">Épargne chaque mois</span>
            <span className="text-right">
              <span className={cn("heading-xl tabular-nums", savingsTone(result.savings))}>{signedMoney(result.savings, cur)}</span>
              <Approx amount={result.savings} currency={cur} signed className="block" />
            </span>
          </div>
          {result.savingsVsTarget !== null && (
            <p className="text-xs text-muted-foreground">
              {result.savingsVsTarget >= 0 ? `${money(result.savingsVsTarget, cur)} au-dessus de ton objectif` : `${money(-result.savingsVsTarget, cur)} sous ton objectif`}
              {move.stayMonths ? ` · ${money(result.savings * move.stayMonths, cur)} sur ${move.stayMonths} mois` : ""}
            </p>
          )}
          <div className="rounded-xl bg-muted-background p-3 text-xs text-muted-foreground">
            Argent à prévoir avant d’emménager : <span className="font-medium text-foreground">{money(upfront, cur)}</span> <Approx amount={upfront} currency={cur} />
            <br />
            premier mois {money(housing, cur)}
            {deposit ? ` + garantie ${money(deposit, cur)}` : selected ? " + garantie (inconnue)" : ""}
            {fees ? ` + frais ${money(fees, cur)}` : ""}
            {plan.oneOff.length ? ` + ponctuels ${money(oneOffTotal(plan), cur)}` : ""}
          </div>
        </div>

        {comparison.length > 0 && (
          <div className="space-y-2">
            <h3 className="heading-sm text-foreground">Épargne par logement</h3>
            <ul className="overflow-hidden rounded-2xl border border-border bg-background">
              {comparison.map(({ l, r }) => (
                <li key={l.id} className="flex items-center gap-3 border-b border-separator px-3 py-2 last:border-0">
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => setChoice(l.id)}>
                    {l.title}
                  </button>
                  <span className="text-xs text-muted-foreground tabular-nums">{money(l.total, cur)}</span>
                  <span className={cn("w-20 text-right text-sm font-medium tabular-nums", savingsTone(r.savings))}>{signedMoney(r.savings, cur)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
