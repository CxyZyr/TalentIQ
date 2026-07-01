"use client";

import * as React from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { DropdownNavProps, DropdownProps } from "react-day-picker";

import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

interface DatePickerProps {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
}

function DatePicker({ date, onDateChange, placeholder = "选择日期", className }: DatePickerProps) {
  const handleCalendarChange = (
    _value: string | number,
    _e: React.ChangeEventHandler<HTMLSelectElement>,
  ) => {
    const _event = {
      target: {
        value: String(_value),
      },
    } as React.ChangeEvent<HTMLSelectElement>;
    _e(_event);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-32 h-8 justify-start text-left font-normal text-sm px-2",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
          {date ? format(date, "yyyy-MM-dd") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onDateChange}
          locale={zhCN}
          className="rounded-lg border-0"
          classNames={{
            month_caption: "mx-0",
          }}
          captionLayout="dropdown"
          defaultMonth={date || new Date()}
          startMonth={new Date(1980, 0)}
          endMonth={new Date(2030, 11)}
          hideNavigation
          components={{
            DropdownNav: (props: DropdownNavProps) => {
              return <div className="flex w-full items-center gap-2">{props.children}</div>;
            },
            Dropdown: (props: DropdownProps) => {
              return (
                <Select
                  value={String(props.value)}
                  onValueChange={(value) => {
                    if (props.onChange) {
                      handleCalendarChange(value, props.onChange);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-fit font-medium first:grow text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[min(20rem,var(--radix-select-content-available-height))]">
                    {props.options?.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={String(option.value)}
                        disabled={option.disabled}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            },
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker };
