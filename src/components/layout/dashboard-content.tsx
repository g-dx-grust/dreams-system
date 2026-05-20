"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { isTemplateMappingWorkspace } from "./dashboard-route-utils";

export function DashboardContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isWorkspace = isTemplateMappingWorkspace(pathname);

  return (
    <main
      className={cn(
        "flex-1 overflow-x-hidden",
        isWorkspace ? "overflow-hidden p-0" : "overflow-y-auto p-m",
      )}
    >
      <div className={cn(isWorkspace ? "h-full min-w-0" : "mx-auto max-w-[1200px]")}>
        {children}
      </div>
    </main>
  );
}
