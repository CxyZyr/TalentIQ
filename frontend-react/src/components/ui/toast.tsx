'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** 全局 Toast Hook —— 需在 ToastProvider 内使用 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast 必须在 <ToastProvider> 内使用');
  }
  return ctx;
}

let idSeq = 0;

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-slate-700',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++idSeq;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2 rounded-md text-sm text-white shadow-lg animate-in fade-in slide-in-from-top-2 ${TYPE_STYLES[t.type]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
