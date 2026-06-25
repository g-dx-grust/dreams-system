"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { AppUser } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { resolveBreadcrumb } from "./dashboard-route-utils";

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
  const crumbs = resolveBreadcrumb(pathname);

  return (
    <header
      className="flex shrink-0 items-center justify-between gap-m bg-grust-navy px-m text-white"
      style={{ height: "var(--height-app-header)" }}
    >
      <div className="flex min-w-0 items-center gap-s">
        <button
          type="button"
          onClick={onHamburger}
          aria-label="メニューを開く"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-s text-white transition-colors hover:bg-white/10 lg:hidden"
        >
          <Menu className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        <div className="[&_a]:text-white [&_a:hover]:text-white [&_span]:text-white/70">
          <Breadcrumb items={crumbs} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-m">
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-xs text-white/60">ログインユーザー</p>
          <p className="truncate text-s font-semibold text-white">
            {user.fullName || user.email}
          </p>
        </div>
        <form action={signOutAction}>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            ログアウト
          </Button>
        </form>
      </div>
    </header>
  );
}
