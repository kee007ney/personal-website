# Atlas Vegrandis Roadmap
Interactive public roadmap prototype for Atlas Vegrandis, built with Vite, React, and React Flow.

## To deploy
cd roadmap-dev
npm run build
rm -rf ../public/roadmap/*
cp -r dist/* ../public/roadmap/
git status
git add public/roadmap
git commit -m "Update roadmap build"
git push

Check locally:
npx serve public

If you get an upgrade error, look at your version:
node -v
npm -v

If you're using nvm (command -v nvm will output nvm) then it's easy:
nvm install 22
nvm use 22
(or whatever version you need).
Verify:
node -v
Now proceed:
cd roadmap-dev
npm install
npm run build

(npm install after an upgrade is a good idea because some native dependencies may have been built against the old runtime.)
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
