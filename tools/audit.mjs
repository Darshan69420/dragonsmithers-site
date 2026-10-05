// Dev-only audit: Lighthouse (mobile + desktop), axe-core, and layout overflow checks.
// Usage: node tools/audit.mjs [baseUrl] [outDir] [paths...]
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:8080';
const out = process.argv[3] || 'audit-out';
const paths = process.argv.slice(4).length ? process.argv.slice(4) : ['/', '/portfolio/'];
const chromePath = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
mkdirSync(out, { recursive: true });
const report = { lighthouse: {}, axe: {}, layout: {} };

const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ['--headless=new', '--no-sandbox'] });
for (const p of paths) {
  for (const preset of ['mobile', 'desktop']) {
    const cfg = preset === 'desktop' ? (await import('lighthouse/core/config/desktop-config.js')).default : undefined;
    const r = await lighthouse(base + p, { port: chrome.port, output: 'json', logLevel: 'error' }, cfg);
    const c = r.lhr.categories;
    report.lighthouse[`${p} ${preset}`] = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v.score * 100)]));
    const failed = Object.values(r.lhr.audits).filter(a => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable').map(a => `${a.id}: ${a.displayValue || a.score}`);
    report.lighthouse[`${p} ${preset}`].failing = failed;
  }
}
await chrome.kill();

const browser = await chromium.launch({ executablePath: chromePath });
for (const p of paths) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base + p, { waitUntil: 'networkidle' });
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    report.axe[`${p} ${scheme}`] = res.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 3).map(n => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 2).join('')) }));
    for (const w of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(150);
      const info = await page.evaluate(() => {
        const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
        const offenders = [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > cw + 1 && r.width > 0; }).slice(0, 5).map(el => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').join('.') : ''));
        const small = [...document.querySelectorAll('a, button, input, select, textarea, summary')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.height < 24 || r.width < 24); }).slice(0, 6).map(el => `${el.tagName.toLowerCase()}("${(el.textContent || '').trim().slice(0, 20)}") ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
        return { overflowX: sw > cw, sw, cw, offenders, smallTargets: small };
      });
      report.layout[`${p} ${scheme} ${w}`] = info;
      await page.screenshot({ path: `${out}/${p.replace(/\//g, '_') || 'root'}-${scheme}-${w}.png`, fullPage: true });
    }
    await ctx.close();
  }
}
await browser.close();
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
