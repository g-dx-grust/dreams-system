import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export type Crumb = { label: string; href?: string };

/*
 * パンくず。深い階層で現在地と戻り導線を示す。末尾（現在地）はリンクにしない。
 * see: DESIGN.md §8.7
 */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="パンくず" className={cn("flex min-w-0 items-center gap-xxs text-s", className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <ChevronRight className="h-4 w-4 shrink-0 text-text-quaternary" aria-hidden="true" />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="truncate text-text-grey transition-colors hover:text-text-black"
              >
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={isLast ? "page" : undefined}
                className={cn("truncate", isLast ? "text-text-black" : "text-text-grey")}
              >
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
