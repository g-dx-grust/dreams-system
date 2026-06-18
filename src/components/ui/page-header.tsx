import * as React from "react";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** パンくず等、タイトル上に置く要素。正は AppHeader だがページ単位でも使える。see: DESIGN.md §8.7 */
  breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="mb-m border-b border-border pb-m">
      {breadcrumb && <div className="mb-xs">{breadcrumb}</div>}
      <div className="flex flex-wrap items-end justify-between gap-m">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight text-text-black">{title}</h1>
          {description && <p className="mt-xs text-s text-text-grey">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-s">{actions}</div>}
      </div>
    </div>
  );
}
