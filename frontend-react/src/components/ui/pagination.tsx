import * as React from "react";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

export interface PaginationProps {
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

function Pagination({
  currentPage,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className,
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);

  if (total === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between",
        className,
      )}
    >
      {/* 左侧：每页条数 */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span>共 {total} 条</span>
        {onPageSizeChange && (
          <>
            <span>,</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger className="h-8 w-[68px] text-sm text-gray-600">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>条/页</span>
          </>
        )}
      </div>

      {/* 右侧：4个翻页按钮 */}
      <div className="flex items-center gap-1">
        {/* 首页 */}
        <button
          className="h-8 w-8 flex items-center justify-center rounded border border-slate-300 text-gray-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          title="首页"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>

        {/* 上一页 */}
        <button
          className="h-8 w-8 flex items-center justify-center rounded border border-slate-300 text-gray-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          title="上一页"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* 页码显示 */}
        <span className="px-2 text-sm text-gray-600">
          {currentPage} / {totalPages}
        </span>

        {/* 下一页 */}
        <button
          className="h-8 w-8 flex items-center justify-center rounded border border-slate-300 text-gray-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          title="下一页"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* 末页 */}
        <button
          className="h-8 w-8 flex items-center justify-center rounded border border-slate-300 text-gray-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          title="末页"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export { Pagination };
