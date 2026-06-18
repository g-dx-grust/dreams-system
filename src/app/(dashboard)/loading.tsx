/*
 * 遷移時のスケルトン（§9.4: spinner より静かな輪郭表示）。
 * シェル（ナビ・ヘッダ）は維持され、本文領域のみこの輪郭に差し替わる。
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="mb-m border-b border-border pb-m">
        <div className="h-7 w-48 rounded-s bg-grey-7" />
        <div className="mt-s h-4 w-72 rounded-s bg-grey-7" />
      </div>

      <div className="rounded-m border border-border bg-white">
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
