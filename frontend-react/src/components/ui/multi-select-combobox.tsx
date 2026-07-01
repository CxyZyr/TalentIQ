import React, { useState } from "react";
import { Check, ChevronsUpDown, ListFilter, X } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";
import { cn } from "../../lib/utils";

export interface BaseOption {
  label: string;
  value: string;
}

export type Option<T extends BaseOption = BaseOption> = T;

interface Props<T extends BaseOption> {
  label: string;
  renderItem: (option: T) => React.ReactNode;
  renderSelectedItem: (value: string[]) => React.ReactNode;
  options: T[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export const MultiSelectCombobox = <T extends BaseOption>({
  label,
  renderItem,
  renderSelectedItem,
  options,
  value,
  onChange,
  placeholder,
}: Props<T>) => {
  const [open, setOpen] = useState(false);

  const handleChange = (currentValue: string) => {
    onChange(
      value.includes(currentValue)
        ? value.filter((val) => val !== currentValue)
        : [...value, currentValue],
    );
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls="multi-select-options"
          aria-label={`Select ${label}`}
          tabIndex={0}
          className="flex h-8 min-w-[120px] cursor-pointer items-center justify-start gap-1.5 rounded-md border border-input bg-background px-3 py-1 text-sm hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1"
          onClick={() => setOpen(!open)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setOpen(!open);
            }
          }}
        >
          <ListFilter
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          {value.length > 0 && (
            <span className="text-muted-foreground text-xs">{label}</span>
          )}

          <div className="flex-1 overflow-hidden text-sm text-gray-600">
            {value.length > 0
              ? renderSelectedItem(value)
              : label}
          </div>

          <span className="z-10 ml-auto flex items-center gap-1">
            {value.length > 0 && (
              <button
                type="button"
                aria-label="Clear selection"
                className="z-10 rounded-sm opacity-50 hover:opacity-100 focus:outline-none"
                onClick={handleClear}
              >
                <X className="size-3.5 shrink-0" />
              </button>
            )}
            <ChevronsUpDown
              className="size-3.5 shrink-0 opacity-50"
              aria-hidden="true"
            />
          </span>
        </div>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        id="multi-select-options"
      >
        <Command>
          <CommandInput
            placeholder={placeholder || `搜索${label}...`}
            aria-label={`搜索${label}`}
          />
          <CommandList>
            <CommandEmpty>未找到{label}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => handleChange(option.value)}
                  aria-selected={value.includes(option.value)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value.includes(option.value)
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                    aria-hidden="true"
                  />
                  {renderItem(option)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
