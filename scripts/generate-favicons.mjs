// Regenerates the favicon set from src/assets/learn-postgresql-icon.svg.
//
// One-off tooling: the generated SVG/PNG/ICO/webmanifest files are committed
// static assets, so `sharp` and `png-to-ico` are NOT kept as project
// dependencies. To re-run after changing the icon:
//
//   pnpm add -D sharp png-to-ico
//   node scripts/generate-favicons.mjs
//   pnpm remove sharp png-to-ico
//
// The icon is its own artwork rather than a crop of the logo taken at build
// time: it is the elephant's head on a solid tile, and the reasoning behind the
// shape lives in a comment at the top of that file. Everything in public/ is a
// render of it, so all the icons agree.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
const sourcePath = join(root, 'src', 'assets', 'learn-postgresql-icon.svg')

// --color-navy-600 from src/styles/app.css, resolved to sRGB. Used only for the
// manifest's theme_color; the icon carries its own colors.
const BRAND_HEX = '#1167a7'

const iconSvg = await readFile(sourcePath, 'utf8')

const sizedSvg = (svg, size) =>
  Buffer.from(svg.replace('<svg ', `<svg width="${size}" height="${size}" `))

// iOS puts its own rounded mask over the touch icon, so shipping rounded corners
// there would show the tile's corners inside Apple's, with white slivers between
// the two. This squares off the tile for that one file.
const squareCorners = (svg) => {
  const squared = svg.replaceAll(/ rx="[\d.]+"/g, '')
  if (squared === svg) {
    throw new Error('No rx to strip. The icon changed; re-check squareCorners.')
  }
  return squared
}

await writeFile(join(publicDir, 'favicon.svg'), iconSvg)
console.log('wrote favicon.svg')

function render(size, { svg = iconSvg, background } = {}) {
  let pipe = sharp(sizedSvg(svg, size))
  if (background) pipe = pipe.flatten({ background })
  return pipe.png()
}

async function writePng(name, size, options) {
  await render(size, options).toFile(join(publicDir, name))
  console.log('wrote', name)
}

// Transparent outside the tile's rounded corners, for browser tabs and Android.
await writePng('favicon-16.png', 16)
await writePng('favicon-32.png', 32)
await writePng('favicon-192.png', 192)
await writePng('favicon-512.png', 512)
// Apple touch icon: square, and flattened because iOS renders transparency black.
await writePng('apple-touch-icon.png', 180, {
  svg: squareCorners(iconSvg),
  background: '#012148',
})

// Multi-size .ico for the auto-requested /favicon.ico and legacy contexts.
const icoBuffers = await Promise.all(
  [16, 32, 48].map((size) => render(size).toBuffer()),
)
await writeFile(join(publicDir, 'favicon.ico'), await pngToIco(icoBuffers))
console.log('wrote favicon.ico')

// Web app manifest for Android home-screen / PWA install.
const manifest = {
  name: 'Learn PostgreSQL',
  short_name: 'Learn PostgreSQL',
  icons: [
    { src: '/favicon-192.png', type: 'image/png', sizes: '192x192' },
    { src: '/favicon-512.png', type: 'image/png', sizes: '512x512' },
  ],
  theme_color: BRAND_HEX,
  background_color: '#ffffff',
  display: 'standalone',
  start_url: '/',
}
await writeFile(
  join(publicDir, 'site.webmanifest'),
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log('wrote site.webmanifest')
