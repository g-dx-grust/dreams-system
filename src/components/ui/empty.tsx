export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-l py-xl">
      <p className="text-m font-medium text-text-black">{title}</p>
      {hint && <p className="mt-xs max-w-[36rem] text-s text-text-grey">{hint}</p>}
    </div>
  );
}
