"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  ContactRound,
  FileClock,
  FilePlus2,
  LayoutDashboard,
  LayoutTemplate,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { AppUser } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section: "workspace" | "records" | "admin";
  adminOnly?: boolean;
};

const items: NavItem[] = [
  { href: "/", label: "ダッシュボード", icon: LayoutDashboard, section: "workspace" },
  { href: "/cases", label: "案件", icon: BriefcaseBusiness, section: "workspace" },
  { href: "/map", label: "地図", icon: MapPin, section: "workspace" },
  { href: "/persons", label: "関係者台帳", icon: ContactRound, section: "records" },
  { href: "/documents", label: "帳票履歴", icon: FileClock, section: "records" },
  {
    href: "/templates",
    label: "テンプレート",
    icon: LayoutTemplate,
    section: "records",
    adminOnly: true,
  },
  { href: "/users", label: "ユーザー管理", icon: Users, section: "admin", adminOnly: true },
  { href: "/audit-logs", label: "監査ログ", icon: ShieldCheck, section: "admin", adminOnly: true },
];

const sections = [
  { key: "workspace" as const, label: "業務" },
  { key: "records" as const, label: "台帳・帳票" },
  { key: "admin" as const, label: "管理" },
];

type SideNavProps = {
  user: AppUser;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function SideNav({
  user,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SideNavProps) {
  const pathname = usePathname();
  const visibleItems = items.filter((item) => !item.adminOnly || user.role === "admin");

  // セグメント境界一致のうち最長の href を活性にする（誤活性防止）。
  const activeHref = visibleItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const renderBody = (isCollapsed: boolean, mobile: boolean) => (
    <>
      <div
        className={cn(
          "border-b border-border bg-white p-s",
          isCollapsed ? "flex flex-col items-center gap-s" : "space-y-s",
        )}
      >
        <div
          className={cn(
            isCollapsed
              ? "flex flex-col items-center gap-s"
              : "flex min-h-10 items-center justify-between gap-s",
          )}
        >
          <Link
            href="/"
            aria-label="ダッシュボードへ移動"
            onClick={mobile ? onCloseMobile : undefined}
            className={cn(
              "flex min-w-0 items-center gap-s rounded-s text-text-black transition-colors hover:bg-main-soft",
              isCollapsed ? "h-9 w-9 justify-center" : "min-w-0 flex-1 px-xs py-xs",
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-s bg-grust-navy text-xs font-semibold leading-none text-white">
              DX
            </span>
            <span className={cn("min-w-0", isCollapsed && "sr-only")}>
              <span className="block truncate text-m font-semibold leading-tight text-text-black">
                dreaMs
              </span>
              <span className="block truncate text-xs leading-tight text-text-grey">
                案件管理・帳票転記
              </span>
            </span>
          </Link>

          {mobile ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="h-8 w-8 shrink-0 border-border-strong bg-grey-7 px-0 hover:bg-grey-9"
              aria-label="メニューを閉じる"
              onClick={onCloseMobile}
            >
              <span className="text-l font-semibold leading-none text-text-black" aria-hidden="true">
                ×
              </span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="h-8 w-8 shrink-0 border-border-strong bg-grey-7 px-0 hover:bg-grey-9"
              aria-label={isCollapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
              title={isCollapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
              onClick={onToggleCollapse}
            >
              <span className="text-l font-semibold leading-none text-text-black" aria-hidden="true">
                {isCollapsed ? "›" : "‹"}
              </span>
            </Button>
          )}
        </div>

        <Link
          href="/cases/new"
          onClick={mobile ? onCloseMobile : undefined}
          title={isCollapsed ? "案件を登録する" : undefined}
          className={cn(
            "flex h-8 items-center justify-center gap-xs rounded-s bg-grust-navy px-s text-s font-semibold text-white transition-colors hover:bg-main-darken",
            isCollapsed && "w-8 px-0",
          )}
        >
          <FilePlus2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className={cn(isCollapsed && "sr-only")}>案件を登録する</span>
        </Link>
      </div>

      <nav
        aria-label="メインメニュー"
        className="flex flex-1 flex-col gap-m overflow-y-auto px-s py-m"
      >
        {sections.map((section) => {
          const sectionItems = visibleItems.filter((item) => item.section === section.key);
          if (sectionItems.length === 0) return null;

          return (
            <div key={section.key}>
              <p
                className={cn(
                  "px-s pb-xs text-xs font-semibold text-text-quaternary",
                  isCollapsed && "sr-only",
                )}
              >
                {section.label}
              </p>

              <div className="flex flex-col gap-xxs">
                {sectionItems.map((item) => {
                  const isActive = item.href === activeHref;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      title={isCollapsed ? item.label : undefined}
                      onClick={mobile ? onCloseMobile : undefined}
                      className={cn(
                        "flex min-h-10 items-center gap-s rounded-s border px-s text-s transition-colors",
                        isCollapsed && "justify-center px-0",
                        isActive
                          ? "border-main/20 bg-main-soft font-semibold text-main"
                          : "border-transparent font-medium text-text-black hover:border-border hover:bg-grey-7",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={isActive ? 2.25 : 2} />
                      <span className={cn("truncate leading-tight", isCollapsed && "sr-only")}>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div
        className={cn(
          "border-t border-border px-s py-s",
          isCollapsed ? "text-center" : "text-left",
        )}
      >
        <p className={cn("text-xs text-text-quaternary", isCollapsed && "sr-only")}>権限</p>
        <p
          className={cn(
            "mt-xxs rounded-s border border-border bg-grey-5 px-s py-xs text-xs font-semibold text-text-grey",
            isCollapsed && "px-xxs",
          )}
          title={user.role === "admin" ? "管理者" : "一般ユーザー"}
        >
          <span className={cn(isCollapsed && "sr-only")}>
            {user.role === "admin" ? "管理者" : "一般ユーザー"}
          </span>
          {isCollapsed && <span aria-hidden="true">{user.role === "admin" ? "管" : "一"}</span>}
        </p>
      </div>
    </>
  );

  return (
    <>
      <aside
        aria-label="サイドナビゲーション"
        className="hidden shrink-0 flex-col overflow-hidden border-r border-border bg-white transition-[width] duration-200 ease-out lg:flex"
        style={{ width: collapsed ? "72px" : "var(--width-side-nav)" }}
      >
        {renderBody(collapsed, false)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[300] lg:hidden">
          <button
            type="button"
            aria-label="メニューを閉じる"
            className="absolute inset-0"
            style={{ background: "var(--color-scrim)" }}
            onClick={onCloseMobile}
          />
          <aside
            aria-label="サイドナビゲーション"
            className="absolute inset-y-0 left-0 flex w-[var(--width-side-nav)] flex-col overflow-hidden border-r border-border bg-white shadow-m"
          >
            {renderBody(false, true)}
          </aside>
        </div>
      )}
    </>
  );
}
