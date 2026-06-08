// Generates classic 2008-era PNG icons into /public/icons.
// Run: node scripts/gen-icons.mjs
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'icons')
const SIZE = 64

// Each icon authored in a 32x32 grid, classic toolbar style:
// flat fills, dark outline, simple highlight.
const wrap = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 32 32">${inner}</svg>`

const ICONS = {
  // ── Categories ──
  work: `
    <rect x="4" y="11" width="24" height="16" rx="2" fill="#c8923e" stroke="#6e4a18" stroke-width="2"/>
    <path d="M12 11 V8 a2 2 0 0 1 2-2 h4 a2 2 0 0 1 2 2 v3" fill="none" stroke="#6e4a18" stroke-width="2"/>
    <rect x="4" y="17" width="24" height="3" fill="#8a6324"/>
    <rect x="13" y="16" width="6" height="5" rx="1" fill="#f0d27a" stroke="#6e4a18" stroke-width="1"/>
    <rect x="6" y="12" width="20" height="2" fill="#e8c97a" opacity="0.7"/>`,

  study: `
    <rect x="6" y="5" width="21" height="23" rx="1" fill="#2a66b8" stroke="#163f7a" stroke-width="2"/>
    <rect x="6" y="5" width="6" height="23" fill="#163f7a"/>
    <rect x="15" y="10" width="9" height="2" fill="#dce8f8"/>
    <rect x="15" y="14" width="9" height="2" fill="#dce8f8"/>
    <rect x="15" y="18" width="9" height="2" fill="#dce8f8"/>
    <rect x="15" y="22" width="6" height="2" fill="#dce8f8"/>`,

  personal: `
    <path d="M16 4 L29 15 L3 15 Z" fill="#c0392b" stroke="#7a1f16" stroke-width="2" stroke-linejoin="round"/>
    <rect x="7" y="15" width="18" height="13" fill="#ead9a8" stroke="#7a5a2a" stroke-width="2"/>
    <rect x="13" y="19" width="6" height="9" fill="#7a5a2a"/>
    <rect x="20" y="18" width="3" height="3" fill="#8fc8e8" stroke="#7a5a2a" stroke-width="1"/>`,

  exercise: `
    <rect x="3" y="11" width="4" height="10" rx="1" fill="#777" stroke="#222" stroke-width="2"/>
    <rect x="7" y="13" width="3" height="6" fill="#444"/>
    <rect x="10" y="15" width="12" height="2" fill="#555"/>
    <rect x="22" y="13" width="3" height="6" fill="#444"/>
    <rect x="25" y="11" width="4" height="10" rx="1" fill="#777" stroke="#222" stroke-width="2"/>`,

  creative: `
    <ellipse cx="15" cy="16" rx="12" ry="10" fill="#f2e6cc" stroke="#7a5a2a" stroke-width="2"/>
    <circle cx="20" cy="21" r="3" fill="#ffffff" stroke="#7a5a2a" stroke-width="1.5"/>
    <circle cx="10" cy="11" r="2" fill="#c0392b"/>
    <circle cx="16" cy="9" r="2" fill="#2a66b8"/>
    <circle cx="21" cy="12" r="2" fill="#f5c518"/>
    <circle cx="9" cy="18" r="2" fill="#4caf50"/>`,

  admin: `
    <rect x="7" y="6" width="18" height="22" rx="1" fill="#d8b85a" stroke="#7a5a2a" stroke-width="2"/>
    <rect x="10" y="4" width="12" height="5" rx="1" fill="#9a9a9a" stroke="#444" stroke-width="1.5"/>
    <rect x="10" y="13" width="12" height="2" fill="#6e5424"/>
    <rect x="10" y="17" width="12" height="2" fill="#6e5424"/>
    <rect x="10" y="21" width="8" height="2" fill="#6e5424"/>`,

  // ── Fallback / generic ──
  default: `
    <path d="M9 3 H20 L25 8 V29 H9 Z" fill="#ffffff" stroke="#7a7a7a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M20 3 V8 H25" fill="#dcdcdc" stroke="#7a7a7a" stroke-width="2" stroke-linejoin="round"/>
    <rect x="12" y="13" width="10" height="2" fill="#9a9a9a"/>
    <rect x="12" y="17" width="10" height="2" fill="#9a9a9a"/>
    <rect x="12" y="21" width="7" height="2" fill="#9a9a9a"/>`,

  // ── Balance modes ──
  beast: `
    <path d="M18 3 L7 18 H14 L12 29 L25 12 H17 Z" fill="#f5c518" stroke="#9a7400" stroke-width="2" stroke-linejoin="round"/>`,

  balanced: `
    <path d="M11 27 L21 27 L18 22 L14 22 Z" fill="#7a7a7a" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="15" y="8" width="2" height="15" fill="#555"/>
    <rect x="5" y="7" width="22" height="2" rx="1" fill="#555"/>
    <line x1="7" y1="8" x2="7" y2="13" stroke="#555" stroke-width="1.5"/>
    <line x1="25" y1="8" x2="25" y2="13" stroke="#555" stroke-width="1.5"/>
    <path d="M3 13 H11 A4 4 0 0 1 3 13 Z" fill="#c8c8c8" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M21 13 H29 A4 4 0 0 1 21 13 Z" fill="#c8c8c8" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>`,

  chill: `
    <path d="M6 26 C6 13 17 6 27 5 C27 19 17 27 6 26 Z" fill="#4caf50" stroke="#2e7d32" stroke-width="2" stroke-linejoin="round"/>
    <path d="M9 24 L23 9" fill="none" stroke="#2e7d32" stroke-width="2"/>`,

  // ── Onboarding work types ──
  freelancer: `
    <circle cx="16" cy="16" r="12" fill="#ffffff" stroke="#c0392b" stroke-width="2"/>
    <circle cx="16" cy="16" r="11" fill="none" stroke="#c0392b" stroke-width="3"/>
    <circle cx="16" cy="16" r="6" fill="none" stroke="#c0392b" stroke-width="3"/>
    <circle cx="16" cy="16" r="2" fill="#c0392b"/>`,

  other: `
    <path d="M16 3 L20 12 L30 13 L22 19 L25 29 L16 23 L7 29 L10 19 L2 13 L12 12 Z"
      fill="#f5c518" stroke="#9a7400" stroke-width="2" stroke-linejoin="round"/>`,

  // ── Headings ──
  chart: `
    <line x1="5" y1="27" x2="28" y2="27" stroke="#444" stroke-width="2"/>
    <line x1="5" y1="4" x2="5" y2="27" stroke="#444" stroke-width="2"/>
    <rect x="8" y="16" width="5" height="10" fill="#2a66b8" stroke="#163f7a" stroke-width="1.5"/>
    <rect x="14" y="9" width="5" height="17" fill="#4caf50" stroke="#2e7d32" stroke-width="1.5"/>
    <rect x="20" y="13" width="5" height="13" fill="#f5c518" stroke="#9a7400" stroke-width="1.5"/>`,

  tasks: `
    <rect x="5" y="4" width="22" height="24" rx="1" fill="#ffffff" stroke="#7a7a7a" stroke-width="2"/>
    <path d="M7 10 l2 2 l3 -4" fill="none" stroke="#2e7d32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="14" y="9" width="10" height="2" fill="#888888"/>
    <path d="M7 17 l2 2 l3 -4" fill="none" stroke="#2e7d32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="14" y="16" width="10" height="2" fill="#888888"/>
    <path d="M7 24 l2 2 l3 -4" fill="none" stroke="#2e7d32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="14" y="23" width="10" height="2" fill="#888888"/>`,

  // ── Status ──
  warning: `
    <path d="M16 4 L29 27 H3 Z" fill="#f5c518" stroke="#9a7400" stroke-width="2" stroke-linejoin="round"/>
    <rect x="15" y="12" width="2" height="8" fill="#3a2a00"/>
    <rect x="15" y="22" width="2" height="2" fill="#3a2a00"/>`,

  check: `
    <circle cx="16" cy="16" r="12" fill="#4caf50" stroke="#2e7d32" stroke-width="2"/>
    <path d="M9 16 L14 21 L23 10" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
}

await mkdir(OUT, { recursive: true })
for (const [name, body] of Object.entries(ICONS)) {
  const svg = Buffer.from(wrap(body))
  await sharp(svg).png().toFile(join(OUT, `${name}.png`))
  console.log('wrote', `${name}.png`)
}
console.log('Done — generated', Object.keys(ICONS).length, 'icons to', OUT)
