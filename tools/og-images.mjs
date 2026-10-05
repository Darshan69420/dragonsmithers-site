// Generates the 1200x630 Open Graph cards in /og and the PNG/ICO app icons from favicon.svg.
// Dev-only (Playwright renders an SVG to PNG). Run: npm run og
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const fonts = pathToFileURL(join(root, 'fonts')).href;
const tmp = mkdtempSync(join(tmpdir(), 'og-'));
mkdirSync(join(root, 'og'), { recursive: true });

const cards = [
  { file: 'home', kicker: 'Computer & network repair · Butler County, OH', title: ['Your computer, fixed by', 'someone down the street.'], foot: 'Hamilton · Fairfield · West Chester · Liberty Twp · Oxford · Trenton' },
  { file: 'business', kicker: 'Small-business IT plan', title: ['IT for small offices that', "don't have an IT person."], foot: 'Google Workspace · Email deliverability · Backups · 2-step login' },
  { file: 'privacy', kicker: 'DragonSmiths', title: ['Privacy:', 'no ads, no tracking cookies.'], foot: 'dragonsmithers.com/privacy' },
  { file: 'portfolio', kicker: 'Cybersecurity · IT support · Systems & networking', title: ['Darshan Sanjel'], foot: 'Wazuh SIEM · Proxmox VE lab · Help desk · Fairfield, OH', brand: 'Portfolio' },
  { file: 'wazuh-siem', kicker: 'Case study · Wazuh 4.14 · Ubuntu 24.04', title: ['A self-hosted SIEM that', 'drafts its own write-ups.'], foot: 'Darshan Sanjel · dragonsmithers.com/portfolio', brand: 'Portfolio' },
  { file: 'proxmox-lab', kicker: 'Case study · Proxmox VE 9 · LXC · Tailscale', title: ['A repurposed laptop', 'running my whole lab.'], foot: 'Darshan Sanjel · dragonsmithers.com/portfolio', brand: 'Portfolio' },
  { file: 'trail-window', kicker: 'Case study · JavaScript · Cloudflare Workers', title: ['A weather planner with a', 'locked-down AI briefing.'], foot: 'Darshan Sanjel · dragonsmithers.com/portfolio', brand: 'Portfolio' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const card = ({ kicker, title, foot, brand = 'DragonSmiths' }) => {
  const big = title.length === 1;
  const size = big ? 100 : 62;
  const lines = title.map((t, i) => `<text x="80" y="${big ? 350 : 300 + i * (size + 10)}" class="h" font-size="${size}">${esc(t)}</text>`).join('');
  return `<!doctype html><html><head><style>
@font-face { font-family: A; src: url("${fonts}/archivo-var.woff2"); font-weight: 400 800; }
@font-face { font-family: M; src: url("${fonts}/plex-mono-400.woff2"); }
@font-face { font-family: M; src: url("${fonts}/plex-mono-600.woff2"); font-weight: 600; }
html, body { margin: 0; } svg { display: block; }
.h { font-family: A; font-weight: 800; font-variation-settings: "wdth" 125; fill: #eaf3ec; letter-spacing: -1.5px; }
.m { font-family: M; fill: #a9c7b5; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; }
.b { font-family: A; font-weight: 800; font-variation-settings: "wdth" 125; fill: #eaf3ec; font-size: 34px; }
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><pattern id="d" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1.2" fill="#eaf3ec" opacity=".12"/></pattern></defs>
  <rect width="1200" height="630" fill="#0e4a33"/><rect width="1200" height="630" fill="url(#d)"/>
  <g fill="none" stroke="#e3a867" stroke-width="3" opacity=".9">
    <path d="M1200 90 H1150 L1110 130 V250"/><path d="M1200 140 H1180 L1160 160 V400 L1130 430 H1090"/><path d="M1200 470 H1170 L1150 490 V630"/>
  </g>
  <g fill="#e3a867"><circle cx="1110" cy="250" r="8"/><circle cx="1090" cy="430" r="8"/><circle cx="1150" cy="490" r="6"/></g>
  <g transform="translate(80 70)">
    <rect width="54" height="54" rx="9" fill="#0b3b29" stroke="#2a6b51"/>
    <g transform="scale(.84375)" fill="none" stroke="#e3a867" stroke-width="4" stroke-linecap="round"><path d="M14 18h14a14 14 0 0 1 0 28H14z"/><path d="M50 18v10M50 36v10"/></g>
    <g transform="scale(.84375)"><circle cx="50" cy="32" r="4" fill="#e3a867"/><circle cx="14" cy="18" r="3" fill="#eaf3ec"/><circle cx="14" cy="46" r="3" fill="#eaf3ec"/></g>
    <text x="74" y="39" class="b">${esc(brand)}</text>
  </g>
  <text x="80" y="${big ? 240 : 220}" class="m">${esc(kicker)}</text>
  ${lines}
  <line x1="80" x2="1120" y1="530" y2="530" stroke="#eaf3ec" stroke-opacity=".2" stroke-width="2"/>
  <text x="80" y="574" class="m" font-size="22" style="text-transform:none;letter-spacing:.5px">${esc(foot)}</text>
</svg></body></html>`;
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const c of cards) {
  const f = join(tmp, `${c.file}.html`);
  writeFileSync(f, card(c));
  await page.goto(pathToFileURL(f).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(root, 'og', `${c.file}.png`) });
  console.log(`og/${c.file}.png`);
}

// App icons from favicon.svg. The apple-touch icon gets a full-bleed square (iOS rounds it).
const svg = readFileSync(join(root, 'favicon.svg'), 'utf8');
const icons = [['apple-touch-icon.png', 180, true], ['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['favicon-32.png', 32, false]];
for (const [name, size, bleed] of icons) {
  const inner = bleed ? svg.replace('rx="10"', 'rx="0"') : svg;
  const pad = name.includes('maskable') ? size * 0.1 : 0;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${bleed ? '#0e4a33' : 'transparent'}"><div style="width:${size}px;height:${size}px;padding:${pad}px;box-sizing:border-box">${inner.replace('<svg ', `<svg width="${size - 2 * pad}" height="${size - 2 * pad}" `)}</div></body></html>`);
  await page.screenshot({ path: join(root, name), omitBackground: !bleed });
  console.log(name);
}
await browser.close();

// favicon.ico: a single 32x32 PNG wrapped in an ICO container.
const png = readFileSync(join(root, 'favicon-32.png'));
const hdr = Buffer.alloc(22);
hdr.writeUInt16LE(0, 0); hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(1, 4);
hdr.writeUInt8(32, 6); hdr.writeUInt8(32, 7); hdr.writeUInt16LE(1, 10); hdr.writeUInt16LE(32, 12);
hdr.writeUInt32LE(png.length, 14); hdr.writeUInt32LE(22, 18);
writeFileSync(join(root, 'favicon.ico'), Buffer.concat([hdr, png]));
console.log('favicon.ico');
unlinkSync(join(root, 'favicon-32.png'));
