"use client";

import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
}

/** Compact multi-select used in filter bars. */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  searchable = true,
  className,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  searchable?: boolean;
  className?: string;
}) {
  const selected = new Set(value);
  const summary = value.length === 0 ? null : value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? value[0] : `${value.length} selected`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-1 font-normal", value.length && "border-highlight-200 from-highlight-50 to-highlight-50 text-highlight-700 dark:border-highlight-200 dark:from-highlight-50 dark:to-highlight-50", className)}>
          <span className={cn(value.length ? "text-highlight-700" : "text-muted-foreground")}>{label}</span>
          {summary && <span className="max-w-32 truncate font-medium">{summary}</span>}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          {searchable && options.length > 7 && <CommandInput placeholder={`Filter ${label.toLowerCase()}…`} />}
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    onSelect={() => onChange(isSelected ? value.filter((v) => v !== option.value) : [...value, option.value])}
                  >
                    <span className={cn("flex size-4 items-center justify-center rounded-md border", isSelected ? "border-foreground bg-foreground text-background" : "border-border-form bg-background")}>
                      {isSelected && <Check className="size-3" />}
                    </span>
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                    {option.hint && <span className="ml-auto text-xs text-muted-foreground">{option.hint}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {value.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-xs text-muted-foreground">
                    Clear
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
