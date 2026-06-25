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
    <div className="mb-l">
      {breadcrumb && <div className="mb-xs">{breadcrumb}</div>}
      <div className="flex min-h-10 flex-wrap items-start justify-between gap-m">
        <div className="min-w-0">
          <h1 className="text-xxl font-semibold leading-tight text-text-black">{title}</h1>
          {description && (
            <p className="mt-xs max-w-[56rem] text-s leading-relaxed text-text-grey">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-s pt-xxs">{actions}</div>}
      </div>
    </div>
  );
}
