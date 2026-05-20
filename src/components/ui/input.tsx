import * as React from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-9 w-full rounded-s border border-border bg-white px-s text-m text-text-black outline-none transition-[border-color,box-shadow] placeholder:text-text-disabled hover:border-border-strong focus:border-main disabled:bg-grey-7 disabled:text-text-disabled",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
