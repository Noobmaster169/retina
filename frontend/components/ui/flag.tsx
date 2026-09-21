import { flagSrc } from "@/lib/flag";

/**
 * A country's flag as an image, at a height the caller sets, with the 3:2
 * shape every file in public/flags/ has. Renders nothing for a code without
 * a flag, so callers fall back to their own glyph.
 */
export function Flag({ code, height = 14, className = "" }: { code: string | null | undefined; height?: number; className?: string }) {
  const src = flagSrc(code);
  if (!src) return null;
  return (
    // A plain img: the file is ours, tiny, and needs none of next/image's sizing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${code?.toUpperCase()} flag`}
      title={code?.toUpperCase()}
      width={Math.round(height * 1.5)}
      height={height}
      className={`inline-block shrink-0 rounded-[2px] shadow-[0_0_0_1px_var(--hairline)] ${className}`}
    />
  );
}
