import type { SVGProps } from "react";

/*
 * The glyphs the canvas drew, lifted path for path so the approved screens
 * land as they were signed off. Everything is a 16px viewBox at a 1.4 stroke,
 * which is also lucide-react's grid: an icon this file does not carry comes
 * from there and sits beside these without a seam.
 */
const PATHS = {
  home: "M2.5 7 L8 2.5 L13.5 7 V13.5 h-11 z",
  mail: "M2 4 h12 v8 h-12 z M2 4 l6 4.5 L14 4",
  doc: "M4 2 h5 l3 3 v9 h-8 z M9 2 v3 h3",
  eye: "M1.5 8 S4 3.5 8 3.5 S14.5 8 14.5 8 S12 12.5 8 12.5 S1.5 8 1.5 8 Z",
  inbox: "M2 9 h3.5 l1 2 h3 l1 -2 H14 M2 9 L3.5 3 h9 L14 9 v4 h-12 z",
  clock: "M8 2.5 a5.5 5.5 0 1 0 0 11 a5.5 5.5 0 0 0 0 -11 M8 5 v3.2 l2.2 1.4",
  check: "M3 8.5 L6.5 12 L13 4.5",
  scale: "M8 2.5 v11 M3.5 6 h9 M5 6 L3 10 h4 z M11 6 L9 10 h4 z",
  graph: "M4 12 a2 2 0 1 0 0.01 0 M12 4 a2 2 0 1 0 0.01 0 M12 12 a2 2 0 1 0 0.01 0 M5.4 10.6 L10.6 5.4 M6 12 h4",
  table: "M2.5 3 h11 v10 h-11 z M2.5 6.5 h11 M6.5 6.5 v6.5",
  chat: "M2.5 3.5 h11 v7 h-6.5 L4 13 v-2.5 h-1.5 z",
  memory: "M3 3.5 h6.5 a2.5 2.5 0 0 1 0 5 H5 a2.5 2.5 0 0 0 0 5 h8",
  panel: "M2.5 3 h11 v10 h-11 z M6.5 3 v10",
  chevron: "M6 3.5 L10.5 8 L6 12.5",
  back: "M10 3.5 L5.5 8 L10 12.5",
  warning: "M8 2.2 L14.5 13.5 h-13 z M8 6.4 v3.1 M8 11.3 v0.6",
  send: "M8 12.5 V3.5 M4.5 7 L8 3.5 L11.5 7",
  ship: "M2 11 h12 l-1.5 3 h-9 z M4 11 V5 h8 v6 M8 5 V2.5",
  client: "M8 3 a2.2 2.2 0 1 0 0.01 0 M3.5 13 a4.5 4.5 0 0 1 9 0",
  diff: "M4.5 2.5 v11 M11.5 2.5 v11 M2 6 h5 M9 10 h5",
  trash: "M2.5 4.5 h11 M6 4.5 V3 h4 v1.5 M4 4.5 l0.7 9 h6.6 l0.7 -9 M6.6 7 v4 M9.4 7 v4",
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

/**
 * The seam's glyph is the product mark itself: a frame around a line with one
 * break in it. It is drawn rather than stroked, so it keeps its proportions at
 * 14px, and it is the only icon that carries a hue of its own.
 */
export function Mark({ size = 18, ...rest }: Omit<SVGProps<SVGSVGElement>, "name"> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...rest}>
      <rect x="0.5" y="0.5" width="15" height="15" rx="4" fill="none" stroke="currentColor" />
      <rect x="3.2" y="7.5" width="3.2" height="1" fill="currentColor" />
      <rect x="6.6" y="7.5" width="1.8" height="1" fill="var(--verdict-differ)" />
      <rect x="8.8" y="7.5" width="4" height="1" fill="currentColor" />
    </svg>
  );
}

export function Icon({ name, size = 15, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...rest}>
      <path
        d={PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The seam's own glyph: the mark at rule weight, for the line that says where Retina starts. */
export function SeamGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1" y="1" width="14" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth={1.2} />
      <path d="M4 8 h3.2 M8.8 8 H12" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
    </svg>
  );
}
