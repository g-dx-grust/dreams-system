import * as React from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-m flex flex-wrap items-end justify-between gap-m border-b border-border pb-m">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-tight text-text-black">{title}</h1>
        {description && <p className="mt-xs text-s text-text-grey">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-s">{actions}</div>}
    </div>
  );
}
