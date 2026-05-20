import * as React from "react";
import { cn } from "@/lib/cn";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-9 w-full appearance-none rounded-s border border-border bg-white px-s pr-l text-m text-text-black outline-none transition-[border-color,box-shadow] hover:border-border-strong focus:border-main disabled:bg-grey-7",
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2216%22%20height=%2216%22%20viewBox=%220%200%2016%2016%22%20fill=%22none%22%20stroke=%22%23646a73%22%20stroke-width=%222%22%3E%3Cpath%20d=%22M4%206l4%204%204-4%22/%3E%3C/svg%3E')] bg-[right_8px_center] bg-no-repeat",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
