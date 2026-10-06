"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface ComboOption {
  id: string;
  label: string;
  hint?: string | null;
}

/**
 * Select an existing entity or type a new name (created on save).
 * value = { id } for an existing one, or { name } for a new one.
 */
export function EntityCombobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  createLabel = "Create",
  allowCreate = true,
  className,
}: {
  options: ComboOption[];
  value: { id?: string | null; name?: string | null };
  onChange: (value: { id: string | null; name: string | null }) => void;
  placeholder?: string;
  createLabel?: string;
  allowCreate?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = value.id ? options.find((o) => o.id === value.id) : null;
  const label = selected?.label ?? value.name ?? null;
  const exact = options.some((o) => o.label.toLowerCase() === search.trim().toLowerCase());
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn("w-full justify-between font-normal", !label && "text-muted-foreground", className)}>
          <span className="truncate">
            {label ?? placeholder}
            {!value.id && value.name && <span className="ml-1.5 text-xs text-muted-foreground">(new)</span>}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or type a new name…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{allowCreate ? "Type a name to create it." : "No match."}</CommandEmpty>
            {allowCreate && search.trim() && !exact && (
              <CommandGroup>
                <CommandItem
                  value={`create ${search}`}
                  onSelect={() => {
                    onChange({ id: null, name: search.trim() });
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Plus /> {createLabel} “{search.trim()}”
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.label} ${option.hint ?? ""}`}
                  onSelect={() => {
                    onChange({ id: option.id, name: option.label });
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check className={cn(value.id === option.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{option.label}</span>
                  {option.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{option.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
            {(value.id || value.name) && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange({ id: null, name: null });
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  Clear
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
