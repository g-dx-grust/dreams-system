import * as React from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/cn";

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-m", className)} {...props} />
    </div>
  );
}

export function THead({
  className,
  sticky,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }) {
  return (
    <thead
      className={cn(
        "bg-head border-b border-border",
        sticky && "sticky top-0 z-10",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function TR({
  className,
  selected,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      data-selected={selected || undefined}
      className={cn(
        "border-b border-border",
        selected ? "bg-main-soft" : "hover:bg-grey-7",
        className,
      )}
      {...props}
    />
  );
}

export function TH({
  className,
  numeric,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        "px-m py-s text-s font-semibold text-text-grey whitespace-nowrap",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  numeric,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "px-m py-s align-middle text-text-black",
        numeric && "text-right tabular-nums whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export type SortDirection = "asc" | "desc";

/*
 * ソート可能なヘッダ。クリックで昇降をトグルする想定の presentational コンポーネント。
 * 実際の並べ替え（URL クエリや配列ソート）は呼び出し側で行う。see: DESIGN.md §8.4
 */
export function SortableTH({
  label,
  active,
  direction,
  onSort,
  numeric,
  className,
}: {
  label: React.ReactNode;
  active?: boolean;
  direction?: SortDirection;
  onSort?: () => void;
  numeric?: boolean;
  className?: string;
}) {
  const Icon = !active ? ChevronsUpDown : direction === "asc" ? ChevronUp : ChevronDown;
  return (
    <th
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "px-m py-s text-s font-semibold text-text-grey whitespace-nowrap",
        numeric ? "text-right" : "text-left",
        className,
      )}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "inline-flex items-center gap-xxs rounded-s hover:text-text-black",
          numeric && "flex-row-reverse",
          active && "text-text-black",
        )}
      >
        <span>{label}</span>
        <Icon
          className={cn("h-3.5 w-3.5", active ? "text-main" : "text-text-quaternary")}
          aria-hidden="true"
        />
      </button>
    </th>
  );
}
