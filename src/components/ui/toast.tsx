"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/*
 * トースト。右下・最大360px・border+shadow-m・左3pxの種別バー・同時1つ（最新優先）。
 * 成功2.5s / 警告4s / エラー5s。see: DESIGN.md §9.5
 */
export type ToastTone = "success" | "danger" | "warning" | "info";

type ToastInput = { message: string; tone?: ToastTone; duration?: number };
type ToastState = Required<Pick<ToastInput, "message" | "tone">> & { id: number; duration: number };

type ShowToast = (input: ToastInput) => void;

const ToastContext = React.createContext<ShowToast | null>(null);

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 2500,
  info: 2500,
  warning: 4000,
  danger: 5000,
};

const TONE_BAR: Record<ToastTone, string> = {
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-main",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = React.useState<ToastState | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = React.useRef(0);

  const show = React.useCallback<ShowToast>((input) => {
    const tone = input.tone ?? "info";
    const duration = input.duration ?? DEFAULT_DURATION[tone];
    counter.current += 1;
    const id = counter.current;
    setToast({ message: input.message, tone, id, duration });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, duration);
  }, []);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed bottom-m right-m z-[400] flex justify-end"
        aria-live="polite"
        aria-atomic="true"
      >
        {toast && (
          <div
            key={toast.id}
            role="status"
            className="ui-toast pointer-events-auto flex w-[360px] max-w-[calc(100vw-2rem)] items-stretch gap-s overflow-hidden rounded-m border border-border bg-white shadow-m"
          >
            <span className={cn("w-[3px] shrink-0", TONE_BAR[toast.tone])} aria-hidden="true" />
            <p className="flex-1 py-s pr-s text-s leading-snug text-text-black">{toast.message}</p>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast は ToastProvider の内側で使用してください");
  return context;
}
