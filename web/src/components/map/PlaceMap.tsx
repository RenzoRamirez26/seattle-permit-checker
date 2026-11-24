"use client";
/**
 * A small map of one place (brief section 9): the pin, and in the results the zone's outline with the zone's name
 * written on it as text. MapLibre is loaded only when a map is shown. Tiles come from a self-hosted Protomaps file
 * for Seattle (web/public/tiles/seattle.pmtiles, Q4); without it the map is drawn on a blank paper background, so
 * nothing is requested from another host. MapLibre itself is its production build, served from this site. The map
 * is not interactive (no pan, zoom, layers or search), so it holds no keyboard focus, and the same facts are always
 * written beside it.
 */
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Schemas } from "@/api/client";

type Point = Schemas["Point"];
type Outline = Record<string, unknown> | null | undefined;

const TILES = "/tiles/seattle.pmtiles";
// MapLibre's production build, copied into public/ by scripts/copy-demo.mjs and loaded from our own site, not bundled (F6).
const MAPLIBRE = "/maplibre-gl.mjs";
const PAPER = "#faf8f3", INK = "#1b1f24", BLUE = "#1f4e8c", HAIRLINE = "#d9d4c8", FIELD = "#7c8691";

/** Paper and ink: the Protomaps layers restyled to DESIGN.md, no labels (no glyphs are hosted). */
function tileStyle(): object {
  return {
    version: 8,
    sources: { base: { type: "vector", url: `pmtiles://${TILES}`, attribution: "© OpenStreetMap contributors, Protomaps" } },
    layers: [
      { id: "paper", type: "background", paint: { "background-color": PAPER } },
      { id: "water", type: "fill", source: "base", "source-layer": "water", paint: { "fill-color": HAIRLINE } },
      { id: "buildings", type: "fill", source: "base", "source-layer": "buildings", paint: { "fill-color": PAPER, "fill-outline-color": HAIRLINE } },
      { id: "roads", type: "line", source: "base", "source-layer": "roads", paint: { "line-color": FIELD, "line-width": 1 } },
    ],
  };
}
const BLANK = { version: 8, sources: {}, layers: [{ id: "paper", type: "background", paint: { "background-color": PAPER } }] };

function bounds(outline: Outline, point: Point): [[number, number], [number, number]] {
  const xs = [point.lon], ys = [point.lat];
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      xs.push(c[0] as number);
      ys.push(c[1] as number);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk((outline as { geometry?: { coordinates?: unknown } } | null)?.geometry?.coordinates);
  const pad = outline ? 0.0006 : 0.002;     // close in on a zone; a street's width around a lone pin
  return [[Math.min(...xs) - pad, Math.min(...ys) - pad], [Math.max(...xs) + pad, Math.max(...ys) + pad]];
}

/** Where to write the zone's name: above the middle of the outline's top edge, clear of the pin. */
function labelAt(outline: Outline, point: Point): [number, number] {
  const g = (outline as { geometry?: { type?: string; coordinates?: number[][][] | number[][][][] } } | null)?.geometry;
  const ring = g?.type === "Polygon" ? (g.coordinates as number[][][])[0] : g?.type === "MultiPolygon" ? (g.coordinates as number[][][][])[0][0] : null;
  if (!ring?.length) return [point.lon, point.lat];
  const xs = ring.map((c) => c[0]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, Math.max(...ring.map((c) => c[1]))];
}

export function PlaceMap({ point, outline, zoneName, label }: { point: Point; outline?: Outline; zoneName?: string | null; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "drawn" | "failed">("loading");
  const [tiles, setTiles] = useState(false);

  useEffect(() => {
    let map: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const hasTiles = await fetch(TILES, { method: "HEAD" }).then((r) => r.ok && !(r.headers.get("content-type") ?? "").includes("text/html"), () => false);
        const maplibre = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ MAPLIBRE)) as typeof import("maplibre-gl");
        await maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
        if (hasTiles) {
          const { Protocol } = await import("pmtiles");
          const protocol = new Protocol();
          maplibre.addProtocol("pmtiles", protocol.tile);
        }
        if (cancelled || !box.current) return;
        setTiles(hasTiles);
        const m = new maplibre.Map({
          container: box.current,
          style: (hasTiles ? tileStyle() : BLANK) as never,
          bounds: bounds(outline, point),
          fitBoundsOptions: { padding: { top: 48, bottom: 24, left: 24, right: 24 } },
          interactive: false,
          attributionControl: false,
        });
        map = m;
        m.on("error", () => setState((s) => (s === "loading" ? "failed" : s)));
        m.on("load", () => {
          if (outline) {
            m.addSource("zone", { type: "geojson", data: outline as never });
            m.addLayer({ id: "zone-fill", type: "fill", source: "zone", paint: { "fill-color": BLUE, "fill-opacity": 0.08 } });
            m.addLayer({ id: "zone-line", type: "line", source: "zone", paint: { "line-color": INK, "line-width": 2, "line-dasharray": [3, 2] } });
            if (zoneName) {
              const el = document.createElement("span");
              el.className = "map-zone-label";
              el.textContent = zoneName;
              new maplibre.Marker({ element: el, anchor: "bottom", offset: [0, -4] }).setLngLat(labelAt(outline, point)).addTo(m);
            }
          }
          const pin = document.createElement("span");
          pin.className = "map-pin";
          new maplibre.Marker({ element: pin, anchor: "bottom" }).setLngLat([point.lon, point.lat]).addTo(m);
          m.once("idle", () => setState("drawn"));
        });
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [point, outline, zoneName]);

  if (state === "failed") return null;          // the facts are written beside the map; nothing is lost
  return (
    <figure className="m-0 flex w-full flex-col gap-1 self-stretch">
      <div
        ref={box}
        role="img"
        aria-label={label}
        data-map-state={state}
        data-outline={outline ? "yes" : "no"}
        className="place-map aspect-[4/3] w-full overflow-hidden rounded-sm border border-hairline bg-paper"
      />
      {tiles ? <figcaption className="text-small text-ink-muted">Map data © OpenStreetMap contributors, Protomaps.</figcaption> : null}
    </figure>
  );
}
