"use client";

import * as React from "react";
import { Clock } from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

interface TimePickerProps {
  time: string | undefined;
  onTimeChange: (time: string) => void;
  placeholder?: string;
  className?: string;
}

// 生成小时选项 (00-23)
const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

// 生成分钟选项 (00-59)
const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function TimePicker({ time, onTimeChange, placeholder = "选择时间", className }: TimePickerProps) {
  const [hour, minute] = React.useMemo(() => {
    if (!time) return ["09", "00"];
    const parts = time.split(":");
    return [parts[0] || "09", parts[1] || "00"];
  }, [time]);

  const handleHourChange = (newHour: string) => {
    onTimeChange(`${newHour}:${minute}`);
  };

  const handleMinuteChange = (newMinute: string) => {
    onTimeChange(`${hour}:${newMinute}`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-24 h-8 justify-start text-left font-normal text-sm px-2",
            !time && "text-muted-foreground",
            className
          )}
        >
          <Clock className="mr-1.5 h-3.5 w-3.5" />
          {time ? time : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="end">
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 text-center">时</span>
            <Select value={hour} onValueChange={handleHourChange}>
              <SelectTrigger className="w-16 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-48">
                {hours.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-lg font-medium text-gray-400 mt-4">:</span>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 text-center">分</span>
            <Select value={minute} onValueChange={handleMinuteChange}>
              <SelectTrigger className="w-16 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-48">
                {minutes.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { TimePicker };
