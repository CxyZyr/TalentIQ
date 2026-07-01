"use client"

import * as React from "react"
import { Calendar as CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { cn } from "../../lib/utils"
import { Button } from "./button"
import { CalendarTwin } from "./calendar-twin"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

interface DateRangePickerProps {
  startDate?: Date
  endDate?: Date
  onStartDateChange?: (date: Date | undefined) => void
  onEndDateChange?: (date: Date | undefined) => void
  startPlaceholder?: string
  endPlaceholder?: string
  className?: string
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  startPlaceholder = "开始日期",
  endPlaceholder = "结束日期",
  className,
}: DateRangePickerProps) {
  const [activeField, setActiveField] = React.useState<"start" | "end">("start")
  const [open, setOpen] = React.useState(false)

  const handleDateSelect = (date: Date) => {
    if (activeField === "start") {
      onStartDateChange?.(date)
      // 如果选择的开始日期大于结束日期，清空结束日期
      if (endDate && date > endDate) {
        onEndDateChange?.(undefined)
      }
      setActiveField("end")
    } else {
      // 如果选择的结束日期小于开始日期，将其设为开始日期
      if (startDate && date < startDate) {
        onStartDateChange?.(date)
        setActiveField("end")
      } else {
        onEndDateChange?.(date)
        setOpen(false)
        setActiveField("start")
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={cn("flex items-center gap-1.5", className)}>
          <Button
            variant="outline"
            onClick={() => { setActiveField("start"); setOpen(true) }}
            className={cn(
              "w-[130px] h-8 justify-start text-left font-normal text-sm px-2",
              !startDate && "text-muted-foreground",
              open && activeField === "start" && "ring-2 ring-primary ring-offset-1"
            )}
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" />
            {startDate ? format(startDate, "yyyy-MM-dd") : <span>{startPlaceholder}</span>}
          </Button>
          <span className="text-sm text-gray-500">至</span>
          <Button
            variant="outline"
            onClick={() => { setActiveField("end"); setOpen(true) }}
            className={cn(
              "w-[130px] h-8 justify-start text-left font-normal text-sm px-2",
              !endDate && "text-muted-foreground",
              open && activeField === "end" && "ring-2 ring-primary ring-offset-1"
            )}
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" />
            {endDate ? format(endDate, "yyyy-MM-dd") : <span>{endPlaceholder}</span>}
          </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-2">
          <div className="flex items-center gap-2 mb-2 px-1">
            <span
              className={cn(
                "text-xs px-2 py-1 rounded cursor-pointer transition-colors",
                activeField === "start"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
              onClick={() => setActiveField("start")}
            >
              开始日期{startDate ? `：${format(startDate, "yyyy-MM-dd")}` : ""}
            </span>
            <span className="text-xs text-muted-foreground">→</span>
            <span
              className={cn(
                "text-xs px-2 py-1 rounded cursor-pointer transition-colors",
                activeField === "end"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
              onClick={() => setActiveField("end")}
            >
              结束日期{endDate ? `：${format(endDate, "yyyy-MM-dd")}` : ""}
            </span>
          </div>
          <CalendarTwin
            value={activeField === "start" ? startDate : endDate}
            onChange={handleDateSelect}
            className="border-0 p-0 w-[560px]"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
