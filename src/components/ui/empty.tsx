import * as React from "react";
import { cn } from "@/lib/cn";

export function Empty({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-m px-l py-xl", className)}>
      <div>
        <p className="text-m font-medium text-text-black">{title}</p>
        {hint && <p className="mt-xs max-w-[36rem] text-s text-text-grey">{hint}</p>}
      </div>
      {action && <div className="flex items-center gap-s">{action}</div>}
    </div>
  );
}
