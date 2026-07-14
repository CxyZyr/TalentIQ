import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "../../lib/utils";

/**
 * 受控展示型树组件（复刻 shadcn / headless-tree 的视觉，零 @headless-tree 依赖）。
 * 由外部传入 level / selected / isFolder / expanded 等状态驱动，配合 visibleRows 扁平渲染。
 */

interface TreeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 每一层的缩进像素 */
  indent?: number;
}

function Tree({ indent = 18, className, style, children, ...props }: TreeProps) {
  return (
    <div
      data-slot="tree"
      className={cn("flex flex-col", className)}
      style={{ ...style, "--tree-indent": `${indent}px` } as React.CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}

interface TreeItemProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onToggle"> {
  /** 层级深度（从 0 开始） */
  level: number;
  selected?: boolean;
  /** 是否为可展开的文件夹节点 */
  isFolder?: boolean;
  expanded?: boolean;
  /** 搜索命中高亮 */
  matched?: boolean;
  /** 节点前的图标（如文件夹图标） */
  icon?: React.ReactNode;
  /** 点击展开/折叠箭头时触发（已 stopPropagation，不会触发行选中） */
  onToggle?: (e: React.MouseEvent) => void;
}

function TreeItem({
  level,
  selected,
  isFolder,
  expanded,
  matched,
  disabled,
  icon,
  onToggle,
  className,
  style,
  children,
  ...props
}: TreeItemProps) {
  return (
    <button
      type="button"
      data-slot="tree-item"
      data-selected={selected || undefined}
      aria-expanded={isFolder ? !!expanded : undefined}
      style={{
        ...style,
        paddingInlineStart: `calc(${level} * var(--tree-indent) + 0.5rem)`,
      }}
      className={cn(
        "group relative my-0.5 flex w-full items-center gap-1.5 rounded-md py-1.5 pe-2 text-start text-sm outline-none transition-colors",
        "text-slate-700 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40",
        matched && !selected && "bg-amber-100/70 text-amber-900",
        selected && "bg-blue-50 text-blue-700 font-medium hover:bg-blue-50",
        className
      )}
      {...props}
    >
      {isFolder ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label={expanded ? "折叠" : "展开"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.(e);
          }}
          className="flex size-4 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-600"
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-200",
              !expanded && "-rotate-90"
            )}
          />
        </span>
      ) : (
        <span className="inline-block size-4 shrink-0" />
      )}
      {icon}
      <span className={cn("truncate", disabled && "line-through text-slate-400")}>
        {children}
      </span>
    </button>
  );
}

export { Tree, TreeItem };
