"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  ChevronDown,
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
  { key: "workspace" as const, label: "" },
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

  const activeHref = visibleItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const renderBody = (isCollapsed: boolean, mobile: boolean) => (
    <>
      <div className={cn("px-m pb-m pt-l", isCollapsed && "px-s")}>
        <div className={cn("flex items-center gap-s", isCollapsed && "justify-center")}>
          <Link
            href="/"
            aria-label="ダッシュボードへ移動"
            onClick={mobile ? onCloseMobile : undefined}
            className={cn(
              "flex min-w-0 items-center gap-s rounded-s text-white",
              isCollapsed && "justify-center",
            )}
          >
            <Image
              src="/dreams-logo.png"
              alt="dreaMs"
              width={44}
              height={44}
              className="h-11 w-11 shrink-0 rounded-full"
              priority
            />
            <span className={cn("min-w-0", isCollapsed && "sr-only")}>
              <span className="block truncate text-xl font-semibold leading-tight text-white">
                dreaMs
              </span>
              <span className="block truncate text-xs font-medium leading-tight text-white/75">
                案件管理・帳票転記
              </span>
            </span>
          </Link>

          {mobile && (
            <button
              type="button"
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-s text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="メニューを閉じる"
              onClick={onCloseMobile}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div
          className={cn(
            "mt-l flex items-center gap-s rounded-l border border-white/10 bg-white/10 px-s py-s text-white",
            isCollapsed && "justify-center px-0",
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-s font-semibold text-white">
            {(user.fullName || user.email).slice(0, 1)}
          </div>
          <div className={cn("min-w-0 flex-1", isCollapsed && "sr-only")}>
            <p className="truncate text-s font-semibold leading-tight text-white">
              {user.fullName || "開発管理者"}
            </p>
            <p className="mt-xxs truncate text-xs text-white/70">
              {user.role === "admin" ? "開発部" : "一般ユーザー"}
            </p>
          </div>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-white/70", isCollapsed && "sr-only")}
            aria-hidden="true"
          />
        </div>
      </div>

      <nav
        aria-label="メインメニュー"
        className="flex flex-1 flex-col gap-l overflow-y-auto px-m pb-m"
      >
        {sections.map((section) => {
          const sectionItems = visibleItems.filter((item) => item.section === section.key);
          if (sectionItems.length === 0) return null;

          return (
            <div key={section.key}>
              {section.label && (
                <p
                  className={cn(
                    "mb-xs px-s text-xs font-semibold text-white/50",
                    isCollapsed && "sr-only",
                  )}
                >
                  {section.label}
                </p>
              )}

              <div className="flex flex-col gap-xs">
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
                        "flex min-h-10 items-center gap-s rounded-l border px-s text-s font-semibold transition-colors",
                        isCollapsed && "justify-center px-0",
                        isActive
                          ? "border-main bg-main text-white shadow-s"
                          : "border-transparent text-white/80 hover:border-white/10 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      <Icon
                        className="h-[18px] w-[18px] shrink-0"
                        strokeWidth={isActive ? 2.3 : 2}
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

      <div className="px-m pb-m">
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-center gap-xs rounded-l border border-white/15 px-s text-s font-semibold text-white/80 hover:bg-white/10 hover:text-white",
            isCollapsed && "px-0",
          )}
          aria-label={isCollapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
          onClick={onToggleCollapse}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          )}
          <span className={cn(isCollapsed && "sr-only")}>メニューを閉じる</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside
        aria-label="サイドナビゲーション"
        className="hidden shrink-0 flex-col overflow-hidden bg-grust-navy transition-[width] duration-200 ease-out lg:flex"
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
            className="absolute inset-y-0 left-0 flex w-[var(--width-side-nav)] flex-col overflow-hidden bg-grust-navy shadow-m"
          >
            {renderBody(false, true)}
          </aside>
        </div>
      )}
    </>
  );
}
