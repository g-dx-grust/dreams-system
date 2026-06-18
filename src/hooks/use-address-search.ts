"use client";

import { useCallback, useRef, useState } from "react";

/*
 * 国土地理院 住所検索（住所 → 経緯度）フック。CORS 許可済・登録不要でフロントから直接呼ぶ。
 * 候補を複数返すことがあるため配列で返す。失敗してもピン留めを止めない非致命エラー。
 * see: docs/gis-map-implementation-plan.md §3.2
 */

export type AddressSearchResult = {
  title: string;
  lng: number;
  lat: number;
};

type GsiFeature = {
  geometry: { coordinates: [number, number] } | null;
  properties: { title?: string } | null;
};

const ENDPOINT = "https://msearch.gsi.go.jp/address-search/AddressSearch";
const MAX_RESULTS = 8;

export function useAddressSearch() {
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 連続検索時に古い応答を破棄する。
  const lastQueryRef = useRef<string | null>(null);

  const search = useCallback(async (query: string): Promise<void> => {
    const q = query.trim();
    if (!q) return;
    lastQueryRef.current = q;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${ENDPOINT}?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as GsiFeature[];

      if (lastQueryRef.current !== q) return;

      const list: AddressSearchResult[] = (Array.isArray(json) ? json : [])
        .flatMap((f): AddressSearchResult[] => {
          const c = f.geometry?.coordinates;
          if (!c || c.length < 2) return [];
          const [lng, lat] = c;
          if (typeof lng !== "number" || typeof lat !== "number") return [];
          return [{ title: f.properties?.title ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lng, lat }];
        })
        .slice(0, MAX_RESULTS);

      if (list.length === 0) setError("該当する住所が見つかりませんでした。");
      setResults(list);
    } catch {
      if (lastQueryRef.current === q) {
        setError("住所検索サービスに接続できませんでした。");
        setResults([]);
      }
    } finally {
      if (lastQueryRef.current === q) setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResults([]);
    setError(null);
    setIsLoading(false);
    lastQueryRef.current = null;
  }, []);

  return { search, reset, results, isLoading, error };
}
