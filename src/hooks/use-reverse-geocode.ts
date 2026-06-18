"use client";

import { useCallback, useRef, useState } from "react";
import { prefFromMuniCd } from "@/lib/geo";

/*
 * 国土地理院 逆ジオコーダ（経緯度 → 住所）フック。
 * 仕様上フロントから直接呼び出す（CORS 許可済・登録不要）。取得は町丁目レベルまでで
 * 番地・地番は取得できない。失敗してもピン留めを止めない非致命エラーとして返す。
 * see: docs/gis-map-implementation-plan.md §3.2, §6C
 */

export type ReverseGeocodeResult = {
  pref: string | null; // muniCd 先頭2桁から導出（市区町村名は別表が必要なため未解決）
  town: string | null; // lv01Nm（町丁目／大字字レベル）
  muniCd: string | null;
};

type GsiResponse = {
  results: { muniCd: string; lv01Nm: string } | null;
};

const ENDPOINT = "https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress";

export function useReverseGeocode() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 連続クリック時に古い応答を破棄する。
  const lastQueryRef = useRef<string | null>(null);

  const lookup = useCallback(
    async (lng: number, lat: number): Promise<ReverseGeocodeResult | null> => {
      const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      lastQueryRef.current = key;
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`${ENDPOINT}?lat=${lat}&lon=${lng}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as GsiResponse;

        if (lastQueryRef.current !== key) return null;

        const r = json.results;
        if (!r || !r.muniCd) {
          setError("この地点の住所が取得できませんでした");
          return null;
        }
        return {
          pref: prefFromMuniCd(r.muniCd),
          town: r.lv01Nm ?? null,
          muniCd: r.muniCd,
        };
      } catch {
        if (lastQueryRef.current === key) {
          setError("住所検索サービスに接続できませんでした");
        }
        return null;
      } finally {
        if (lastQueryRef.current === key) setIsLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
    lastQueryRef.current = null;
  }, []);

  return { lookup, reset, isLoading, error };
}
