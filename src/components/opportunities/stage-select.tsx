"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGE_CATEGORIES, STAGE_CATEGORY_META, type PipelineKey } from "@/lib/constants";
import { useStages } from "@/components/app/app-data";
import { cn } from "@/lib/utils";

export function StageSelect({
  pipeline,
  value,
  onChange,
  size = "default",
  className,
  disabled,
}: {
  pipeline: PipelineKey;
  value: string | null | undefined;
  onChange: (key: string) => void;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
}) {
  const stages = useStages(pipeline);
  const current = stages.find((s) => s.key === value);
  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size={size} className={cn("min-w-40", className)}>
        <SelectValue placeholder="Status">
          {current && (
            <span className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", STAGE_CATEGORY_META[current.category].dot)} />
              {current.label}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STAGE_CATEGORIES.map((category, index) => {
          const items = stages.filter((s) => s.category === category);
          if (!items.length) return null;
          return (
            <SelectGroup key={category}>
              {index > 0 && <SelectSeparator />}
              <SelectLabel className="text-xs">{STAGE_CATEGORY_META[category].label}</SelectLabel>
              {items.map((s) => (
                <SelectItem key={s.id} value={s.key}>
                  <span className={cn("size-2 rounded-full", STAGE_CATEGORY_META[s.category].dot)} />
                  {s.label}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
