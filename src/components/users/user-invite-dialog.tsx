"use client";

import { useEffect, useId, useRef, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { UserInviteForm } from "@/components/users/user-invite-form";

export function UserInviteDialog({
  variant = "primary",
  size = "md",
}: {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        ユーザーを招待する
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-scrim p-m"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-[480px] flex-col rounded-l border border-border bg-white shadow-m"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="flex items-start justify-between gap-m border-b border-border px-l py-m">
              <div>
                <h2 id={titleId} className="text-l font-semibold text-text-black">
                  ユーザーを招待する
                </h2>
                <p className="mt-xs text-s text-text-grey">
                  招待メールを送信し、初回ログイン時にパスワード設定へ案内します。
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="招待画面を閉じる"
                className="flex h-8 w-8 items-center justify-center rounded-s text-text-grey hover:bg-grey-7 hover:text-text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto p-l">
              <UserInviteForm onDone={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
