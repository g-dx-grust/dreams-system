import { describe, expect, it } from "vitest";
import { parseCoordinateInput } from "@/lib/geo";

describe("parseCoordinateInput", () => {
  it("parses latitude and longitude order", () => {
    expect(parseCoordinateInput("34.769123, 137.391456")).toEqual({
      lat: 34.769123,
      lng: 137.391456,
    });
  });

  it("parses longitude and latitude order when the first value is outside latitude range", () => {
    expect(parseCoordinateInput("137.391456 34.769123")).toEqual({
      lat: 34.769123,
      lng: 137.391456,
    });
  });

  it("parses Japanese labelled coordinates", () => {
    expect(parseCoordinateInput("緯度34.769123 経度137.391456")).toEqual({
      lat: 34.769123,
      lng: 137.391456,
    });
  });

  it("rejects values outside latitude and longitude ranges", () => {
    expect(parseCoordinateInput("999, 137.391456")).toBeNull();
    expect(parseCoordinateInput("34.769123, 999")).toBeNull();
  });
});
