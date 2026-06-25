"use client";

import { Bell, CircleHelp, Menu } from "lucide-react";

export function AppHeader({
  onHamburger,
}: {
  onHamburger: () => void;
}) {
  return (
    <header
      className="flex shrink-0 items-center justify-between gap-m border-b border-border bg-white px-l text-text-black"
      style={{ height: "var(--height-app-header)" }}
    >
      <div className="flex min-w-0 items-center gap-s">
        <button
          type="button"
          onClick={onHamburger}
          aria-label="メニューを開く"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-s text-text-black transition-colors hover:bg-grey-7 lg:hidden"
        >
          <Menu className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-s">
        <button
          type="button"
          className="relative flex h-8 w-8 items-center justify-center rounded-s text-text-black hover:bg-grey-7"
          aria-label="通知"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          <span className="absolute right-[5px] top-[5px] h-2 w-2 rounded-full bg-danger" />
        </button>
        <button
          type="button"
          className="hidden h-8 w-8 items-center justify-center rounded-s text-text-black hover:bg-grey-7 sm:flex"
          aria-label="ヘルプ"
        >
          <CircleHelp className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
