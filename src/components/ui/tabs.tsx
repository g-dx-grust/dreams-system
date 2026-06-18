"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type TabItem = { href: string; label: string };

export function TabNav({ items }: { items: TabItem[] }) {
  const pathname = usePathname();
  // セグメント境界で一致するもののうち、最長の href を活性にする。
  // これで親ルート(基本情報)と子ルート(関係者 等)が同時に光る誤活性を防ぐ。
  const activeHref = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex gap-m" role="tablist">
        {items.map((item) => {
          const isActive = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "border-b-2 px-s py-s text-s font-medium",
                isActive
                  ? "border-main text-main"
                  : "border-transparent text-text-grey hover:text-text-black",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
