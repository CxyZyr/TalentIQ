import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** 统一空态：图标 + 标题 + 说明 + 可选操作 */
export function EmptyState({
  icon,
  title = '暂无数据',
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 text-center ${className}`}>
      <div className="text-slate-300 mb-3">{icon || <Inbox className="w-14 h-14" strokeWidth={1.5} />}</div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {description && <p className="text-xs text-slate-400 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
