"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SortableTH, type SortDirection } from "@/components/ui/table";

/*
 * 一覧の列ソートヘッダ。URL クエリ (?sort=&order=) を更新して再取得させる。
 * サーバ側でソートする一覧で再利用する。see: DESIGN.md §8.4
 */
export function SortHeader({
  column,
  label,
  numeric,
  className,
}: {
  column: string;
  label: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = searchParams.get("sort") === column;
  const currentOrder: SortDirection = searchParams.get("order") === "desc" ? "desc" : "asc";
  const direction: SortDirection = active ? currentOrder : "asc";

  const onSort = () => {
    const params = new URLSearchParams(searchParams.toString());
    const nextOrder: SortDirection = active && currentOrder === "asc" ? "desc" : "asc";
    params.set("sort", column);
    params.set("order", nextOrder);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <SortableTH
      label={label}
      active={active}
      direction={direction}
      onSort={onSort}
      numeric={numeric}
      className={className}
    />
  );
}
