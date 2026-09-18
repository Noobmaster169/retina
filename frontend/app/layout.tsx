import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = { title: "Retina", description: "Retina — AI workspace." };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex h-14 w-full max-w-2xl items-center px-5 font-semibold sm:px-8">Retina</div>
        </header>
        {children}
      </body>
    </html>
  );
}
