import * as React from "react";
import { cn } from "@/lib/cn";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "w-full rounded-s border border-border bg-white px-s py-xs text-m text-text-black outline-none transition-[border-color,box-shadow] placeholder:text-text-disabled hover:border-border-strong focus:border-main disabled:bg-grey-7",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
