"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  ContactRound,
  Files,
  FileStack,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { AppUser } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { isTemplateMappingWorkspace } from "./dashboard-route-utils";

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
  { href: "/persons", label: "関係者台帳", icon: ContactRound, section: "workspace" },
  { href: "/documents", label: "帳票履歴", icon: Files, section: "workspace" },
  {
    href: "/templates",
    label: "テンプレート",
    icon: FileStack,
    section: "admin",
    adminOnly: true,
  },
  {
    href: "/users",
    label: "ユーザー管理",
    icon: Users,
    section: "admin",
    adminOnly: true,
  },
  {
    href: "/audit-logs",
    label: "監査ログ",
    icon: ShieldCheck,
    section: "admin",
    adminOnly: true,
  },
];

const sections = [
  { key: "workspace" as const, label: "業務メニュー" },
  { key: "admin" as const, label: "管理メニュー" },
];

type SideNavProps = {
  user: AppUser;
  signOutAction: () => Promise<void>;
};

export function SideNav({ user, signOutAction }: SideNavProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isTemplateMappingWorkspace(pathname)) return null;

  const visibleItems = items.filter((item) => !item.adminOnly || user.role === "admin");
  const ToggleIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className="flex shrink-0 flex-col overflow-hidden border-r border-border bg-white transition-[width] duration-200 ease-out"
      style={{ width: isCollapsed ? "72px" : "var(--width-side-nav)" }}
    >
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
          className={cn(
            "flex min-w-0 items-center gap-s rounded-s text-text-black transition-colors hover:bg-grey-7",
            isCollapsed ? "h-9 w-9 justify-center" : "min-w-0 flex-1 px-xs py-xs",
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-s bg-main text-m font-bold text-white">
            G
          </span>
          <span className={cn("min-w-0", isCollapsed && "sr-only")}>
            <span className="block text-xs font-semibold uppercase tracking-wider text-text-quaternary">
              G-DX
            </span>
            <span className="block truncate text-m font-semibold leading-tight text-text-black">
              案件管理・帳票転記システム
            </span>
          </span>
        </Link>

        <Button
          type="button"
          variant="secondary"
          size="md"
          className="h-8 w-8 shrink-0 px-0"
          aria-label={isCollapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
          title={isCollapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
          onClick={() => setIsCollapsed((current) => !current)}
        >
          <ToggleIcon className="h-[18px] w-[18px]" aria-hidden="true" />
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-m overflow-y-auto px-s py-m">
        {sections.map((section) => {
          const sectionItems = visibleItems.filter((item) => item.section === section.key);
          if (sectionItems.length === 0) return null;

          return (
            <div key={section.key}>
              <p
                className={cn(
                  "px-s pb-s text-xs font-semibold uppercase tracking-wider text-text-quaternary",
                  isCollapsed && "sr-only",
                )}
              >
                {section.label}
              </p>

              <div className="flex flex-col gap-xxs">
                {sectionItems.map((item) => {
                  const isActive =
                    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      title={isCollapsed ? item.label : undefined}
                      className={cn(
                        "flex min-h-9 items-center gap-s rounded-s px-s py-s text-m font-semibold transition-colors",
                        isCollapsed && "justify-center px-0",
                        isActive ? "bg-main-soft text-main" : "text-text-black hover:bg-grey-7",
                      )}
                    >
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

      <div className="border-t border-border p-s">
        <div
          className={cn(
            "mb-s flex min-w-0 items-center gap-s rounded-s bg-grey-5 p-s",
            isCollapsed && "justify-center p-xs",
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-main-soft text-s font-semibold text-main">
            {(user.fullName || user.email).slice(0, 1).toUpperCase()}
          </div>
          <div className={cn("min-w-0 leading-tight", isCollapsed && "sr-only")}>
            <p className="text-xs text-text-quaternary">ログイン中</p>
            <p className="truncate text-s font-semibold text-text-black">
              {user.fullName || user.email}
            </p>
          </div>
        </div>

        <form action={signOutAction}>
          <Button
            type="submit"
            variant="secondary"
            size="md"
            className={cn("w-full", isCollapsed && "h-8 w-8 px-0")}
            aria-label="ログアウト"
            title={isCollapsed ? "ログアウト" : undefined}
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className={cn(isCollapsed && "sr-only")}>ログアウト</span>
          </Button>
        </form>
      </div>
    </aside>
  );
}
