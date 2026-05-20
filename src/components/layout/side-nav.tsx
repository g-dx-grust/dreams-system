"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  ContactRound,
  Files,
  FileStack,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { AppRole } from "@/lib/permissions";
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

export function SideNav({ role }: { role: AppRole }) {
  const pathname = usePathname();
  if (isTemplateMappingWorkspace(pathname)) return null;

  const visibleItems = items.filter((item) => !item.adminOnly || role === "admin");

  return (
    <aside
      className="shrink-0 overflow-y-auto border-r border-border bg-white"
      style={{ width: "var(--width-side-nav)" }}
    >
      <nav className="flex flex-col gap-l px-s py-m">
        {sections.map((section) => {
          const sectionItems = visibleItems.filter((item) => item.section === section.key);
          if (sectionItems.length === 0) return null;

          return (
            <div key={section.key}>
              <p className="px-s pb-s text-xs font-semibold uppercase tracking-wider text-text-quaternary">
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
                      className={cn(
                        "flex items-center gap-s rounded-s px-s py-s text-m transition-colors",
                        isActive
                          ? "bg-main-soft text-main font-semibold"
                          : "text-text-black font-medium hover:bg-grey-7",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2.25 : 2} />
                      <span className="truncate leading-tight">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
