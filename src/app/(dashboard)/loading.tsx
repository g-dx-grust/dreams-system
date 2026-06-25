export default function DashboardLoading() {
  return (
    <div aria-hidden="true">
      <div className="-mx-m mb-m border-b border-border bg-white px-m py-m">
        <div className="h-7 w-48 rounded-s bg-grey-7" />
        <div className="mt-s h-4 w-72 rounded-s bg-grey-7" />
      </div>

      <div className="rounded-m border border-border bg-white shadow-s">
        <div className="border-b border-border bg-head px-m py-s">
          <div className="h-4 w-32 rounded-s bg-grey-20" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-m px-m py-m">
              <div className="h-4 w-24 rounded-s bg-grey-7" />
              <div className="h-4 flex-1 rounded-s bg-grey-7" />
              <div className="h-4 w-20 rounded-s bg-grey-7" />
              <div className="h-4 w-16 rounded-s bg-grey-7" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
