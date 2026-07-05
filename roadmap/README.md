# Atlas Vegrandis Roadmap

Interactive public roadmap prototype for Atlas Vegrandis, built with Vite, React, and React Flow.

## Local development

```bash
npm install
npm run dev
```

## Production build for jonathonkeeney.com/roadmap/

```bash
npm run build
```

Upload the contents of `dist/` into a `/roadmap/` directory on your website.

If you want to preview the production build locally:

```bash
npm run preview
```

## Editing roadmap content

Edit `src/roadmapData.js`. Each feature node has:

- `id`
- `title`
- `category`
- `status`
- `description`
- `dependsOn`
- `communitySignal`
- `details`

This version does not persist votes yet. The voting buttons are UI placeholders for phase 4.
