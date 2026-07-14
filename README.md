# MAVIS — Agentic AI Capability Showcase

A self-contained, single-file interactive showcase (no runtime dependencies).
**Live:** https://ayen-bot.github.io/mavis-showcase/

## Structure
- `index.html` — the built, self-contained app (this is what GitHub Pages serves).
- `src/template.html` — HTML shell + inline CSS (contains `__DATA__` and `__APP_JS__` placeholders).
- `src/app.js` — inline application JavaScript.
- `src/showcase_data.json` — embedded dataset.
- `build.mjs` — assembles `src/*` into `index.html`.

## Build
```bash
node build.mjs   # regenerates index.html from src/
```

## Auto-build
`.github/workflows/build.yml` rebuilds `index.html` automatically on every push
that changes `src/**` or `build.mjs`, then commits the result — so editing the
source files is enough; the built file stays in sync and Pages redeploys.
