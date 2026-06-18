"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  CalendarDays,
  ContactRound,
  FileClock,
  LayoutDashboard,
  LayoutTemplate,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { AppUser } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section: "workspace" | "admin";
  adminOnly?: boolean;
};

const items: NavItem[] = [
  { href: "/", label: "ダッシュボード", icon: LayoutDashboard, section: "workspace" },
  { href: "/cases", label: "案件", icon: BriefcaseBusiness, section: "workspace" },
  { href: "/calendar", label: "カレンダー", icon: CalendarDays, section: "workspace" },
  { href: "/map", label: "地図", icon: MapPin, section: "workspace" },
  { href: "/persons", label: "関係者台帳", icon: ContactRound, section: "workspace" },
  { href: "/documents", label: "帳票履歴", icon: FileClock, section: "workspace" },
  {
    href: "/templates",
    label: "テンプレート",
    icon: LayoutTemplate,
    section: "admin",
    adminOnly: true,
  },
  { href: "/users", label: "ユーザー管理", icon: Users, section: "admin", adminOnly: true },
  { href: "/audit-logs", label: "監査ログ", icon: ShieldCheck, section: "admin", adminOnly: true },
];

const sections = [
  { key: "workspace" as const, label: "業務" },
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
          "border-b border-border p-s",
          isCollapsed
            ? "flex flex-col items-center gap-s"
            : "flex min-h-[var(--height-app-header)] items-center justify-between gap-s",
        )}
      >
        <Link
          href="/"
          aria-label="ダッシュボードへ移動"
          onClick={mobile ? onCloseMobile : undefined}
          className={cn(
            "flex min-w-0 items-center gap-s rounded-s text-text-black transition-colors hover:bg-grey-7",
            isCollapsed ? "h-9 w-9 justify-center" : "min-w-0 flex-1 px-xs py-xs",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-m bg-grust-navy text-l font-bold leading-none text-white">
            d
          </span>
          <span className={cn("min-w-0", isCollapsed && "sr-only")}>
            <span className="block truncate text-l font-semibold leading-tight tracking-tight text-text-black">
              dreaMs
            </span>
            <span className="block truncate text-xs leading-tight text-text-quaternary">
              案件管理システム
            </span>
          </span>
        </Link>

        {mobile ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="h-8 w-8 shrink-0 px-0"
            aria-label="メニューを閉じる"
            onClick={onCloseMobile}
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="h-8 w-8 shrink-0 px-0"
            aria-label={isCollapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
            title={isCollapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
            onClick={onToggleCollapse}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" />
            )}
          </Button>
        )}
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
                  "px-s pb-xs text-xs font-medium text-text-quaternary",
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
                        "relative flex min-h-10 items-center gap-s rounded-s px-s text-m transition-colors",
                        isCollapsed && "justify-center px-0",
                        isActive
                          ? "bg-main-soft font-semibold text-main"
                          : "font-medium text-text-black hover:bg-grey-7",
                      )}
                    >
                      {isActive && (
                        <span
                          className="absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-main"
                          aria-hidden="true"
                        />
                      )}
                      <Icon
                        className="h-[18px] w-[18px] shrink-0"
                        strokeWidth={isActive ? 2.25 : 2}
                      />
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
