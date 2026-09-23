# Pitch deck

The hackathon pitch deck, built by hand from the running product.

- `deck.html` is the deck: 19 pages (18 slides and a blank background template at the end) on a fixed 1920 x 1080 canvas, self-contained, light
  with the product's blue accent. Open it in a browser to read it.
- `deck.pdf` is the export, one page per slide, 16:9.
- `assets/screens/` are crops of screenshots taken from the local app against the full
  520-email run (`bcb018bf`). `assets/fonts/` are the three faces the product uses
  (Newsreader, Inter, JetBrains Mono) plus a two-glyph CJK subset for the bilingual label.
- `preview/` is one PNG per slide, for a quick flip-through.

Regenerate the PDF and the previews after editing `deck.html`:

```bash
node render.mjs --png
```

It drives a headless Chromium through Playwright. On this machine it uses the copy under
`~/.claude/skills/gstack/node_modules`; set `PLAYWRIGHT_MODULE` to point elsewhere.

The one placeholder left is the scoreboard submission line in the footer of the results slide.
