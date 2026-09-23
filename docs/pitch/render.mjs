// Renders deck.html to deck.pdf (one 1920x1080 page per slide) and, with
// --png, one PNG per slide under preview/ for a visual check.
//
//   node render.mjs [--png]
//
// Needs a Chromium that Playwright can drive. The path below is the copy the
// gstack skill ships with; point PLAYWRIGHT_MODULE elsewhere if yours differs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleDir = process.env.PLAYWRIGHT_MODULE ?? "/root/.claude/skills/gstack/node_modules/playwright/index.mjs";
const { chromium } = await import(moduleDir);

const wantPng = process.argv.includes("--png");
const browser = await chromium.launch({ chromiumSandbox: false, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto("file://" + path.join(here, "deck.html"), { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

await page.emulateMedia({ media: "print" });
await page.pdf({
  path: path.join(here, "deck.pdf"),
  width: "1920px",
  height: "1080px",
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});
console.log("wrote deck.pdf");

if (wantPng) {
  await page.emulateMedia({ media: "screen" });
  const out = path.join(here, "preview");
  fs.mkdirSync(out, { recursive: true });
  const slides = page.locator("section.slide");
  const n = await slides.count();
  for (let i = 0; i < n; i++) {
    const file = path.join(out, `slide-${String(i + 1).padStart(2, "0")}.png`);
    await slides.nth(i).screenshot({ path: file });
  }
  console.log(`wrote ${n} previews under preview/`);
}
await browser.close();
