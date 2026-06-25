"use client";

import { usePathname } from "next/navigation";
import { Bell, CircleHelp, LogOut, Menu } from "lucide-react";
import type { AppUser } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { resolveRouteMeta } from "./dashboard-route-utils";

export function AppHeader({
  user,
  signOutAction,
  onHamburger,
}: {
  user: AppUser;
  signOutAction: () => Promise<void>;
  onHamburger: () => void;
}) {
  const pathname = usePathname();
  const meta = resolveRouteMeta(pathname);

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
        <div className="flex min-w-0 items-center gap-s">
          <span className="text-xl font-semibold leading-none text-main tabular-nums">
            {meta.number}
          </span>
          <h1 className="truncate text-l font-semibold leading-tight text-text-black">
            {meta.title}
          </h1>
        </div>
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
        <div className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
        <div className="hidden max-w-[220px] text-right leading-tight md:block">
          <p className="truncate text-s font-semibold text-text-black">
            {user.fullName || user.email}
          </p>
          <p className="text-xs text-text-grey">
            {user.role === "admin" ? "管理者" : "一般ユーザー"}
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="secondary" size="sm" className="h-8 px-s">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">ログアウト</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
