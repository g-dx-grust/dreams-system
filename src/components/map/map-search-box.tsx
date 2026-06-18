"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useAddressSearch, type AddressSearchResult } from "@/hooks/use-address-search";
import { parseCoordinateInput } from "@/lib/geo";

// 地図上の検索ボックス。住所または緯度/経度を入力し、onSelect に座標を渡す。
export function MapSearchBox({ onSelect }: { onSelect: (result: AddressSearchResult) => void }) {
  const [q, setQ] = useState("");
  const { search, reset, results, isLoading, error } = useAddressSearch();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    const coordinate = parseCoordinateInput(query);
    if (coordinate) {
      reset();
      onSelect({
        title: `${coordinate.lat.toFixed(6)}, ${coordinate.lng.toFixed(6)}`,
        lat: coordinate.lat,
        lng: coordinate.lng,
      });
      return;
    }
    void search(query);
  };

  return (
    <div className="w-64 max-w-[80vw]">
      <form
        onSubmit={submit}
        className="flex overflow-hidden rounded-s border border-border bg-white shadow-s"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="住所または座標で検索"
          aria-label="住所または座標で検索"
          className="min-w-0 flex-1 bg-transparent px-s py-xs text-s text-text-black outline-none placeholder:text-text-grey"
        />
        <button
          type="submit"
          aria-label="検索する"
          disabled={isLoading}
          className="flex items-center px-s text-text-grey hover:bg-grey-7 disabled:opacity-50"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      {(isLoading || error || results.length > 0) && (
        <div className="mt-xs overflow-hidden rounded-s border border-border bg-white shadow-s">
          {isLoading && <p className="px-s py-xs text-s text-text-grey">検索中…</p>}
          {!isLoading && error && <p className="px-s py-xs text-s text-text-grey">{error}</p>}
          {results.length > 0 && (
            <ul className="max-h-56 overflow-y-auto">
              {results.map((r, i) => (
                <li key={`${r.title}-${i}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(r);
                      reset();
                      setQ(r.title);
                    }}
                    className="block w-full truncate px-s py-xs text-left text-s text-text-black hover:bg-grey-7"
                  >
                    {r.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
