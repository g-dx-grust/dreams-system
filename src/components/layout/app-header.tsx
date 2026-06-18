"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { AppUser } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { resolveBreadcrumb } from "./dashboard-route-utils";

/*
 * 白ベースの常設ヘッダ（§8.6）。左にハンバーガー（モバイル）＋パンくず、
 * 右にログインユーザー＋ログアウト。サイドナブを畳んでも現在地とユーザーが見える。
 */
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
      className="flex shrink-0 items-center justify-between gap-m border-b border-border bg-white px-m"
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
        <Breadcrumb items={crumbs} />
      </div>

      <div className="flex shrink-0 items-center gap-m">
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-xs text-text-quaternary">ログイン中</p>
          <p className="truncate text-s font-semibold text-text-black">
            {user.fullName || user.email}
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="secondary" size="sm">
            ログアウト
          </Button>
        </form>
      </div>
    </header>
  );
}
