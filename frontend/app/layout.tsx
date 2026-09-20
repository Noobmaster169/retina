import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";

import "./globals.css";

/*
 * The three families of docs/05-design.md section 5. Newsreader carries one
 * display line per page and is the reason this does not look like every other
 * dashboard; Inter stays neutral under it; JetBrains Mono sets every id, enum,
 * count and quote.
 */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Retina SDOC",
  description: "Shipping document verification.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${newsreader.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body className="font-sans text-body text-ink">{children}</body>
    </html>
  );
}
