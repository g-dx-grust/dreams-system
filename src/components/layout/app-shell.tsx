"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { AppUser } from "@/lib/permissions";
import { SideNav } from "./side-nav";
import { AppHeader } from "./app-header";
import { isTemplateMappingWorkspace } from "./dashboard-route-utils";

/*
 * ダッシュボードのアプリシェル。サイドナブの折りたたみ（cookie 永続化）と
 * モバイルドロワーの開閉状態を一元管理し、SideNav と AppHeader を協調させる。
 * マッピング作業画面は全画面（ナビ・ヘッダ非表示）にする。
 */
export function AppShell({
  user,
  signOutAction,
  initialCollapsed,
  children,
}: {
  user: AppUser;
  signOutAction: () => Promise<void>;
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const skipLink = (
    <a href="#main-content" className="ui-skip-link">
      メインコンテンツへ
    </a>
  );

  if (isTemplateMappingWorkspace(pathname)) {
    return (
      <>
        {skipLink}
        <main id="main-content" className="h-screen overflow-hidden bg-background">
          <div className="h-full min-w-0">{children}</div>
        </main>
      </>
    );
  }

  const toggleCollapse = () =>
    setCollapsed((current) => {
      const next = !current;
      document.cookie = `sidenav_collapsed=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });

  return (
    <>
      {skipLink}
      <div className="flex h-screen overflow-hidden bg-grey-6">
        <SideNav
          user={user}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader
            user={user}
            signOutAction={signOutAction}
            onHamburger={() => setMobileOpen(true)}
          />
          <main
            id="main-content"
            className="flex-1 overflow-x-hidden overflow-y-auto px-m py-m"
          >
            <div className="mx-auto max-w-[var(--width-content-max)]">{children}</div>
          </main>
        </div>
      </div>
    </>
  );
}
