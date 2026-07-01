import { cn } from '../../lib/utils';

/** 通用骨架块 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />;
}

/** 表格加载骨架 */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2.5 p-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-7 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
