// Renders the HTML résumé on /portfolio/ to /resume.pdf, so the PDF never drifts from the page.
// Dev-only. Edit the résumé in portfolio/index.html, then run: npm run resume
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.address().port}/portfolio/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.body.classList.add('print-resume');
    document.title = 'Darshan Sanjel, Résumé';
  });
  await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
  // Print styles in style.css keep this to one page; fail loudly if an edit pushes it to two.
  const pdf = await page.pdf({ format: 'Letter', margin: { top: '0.5in', bottom: '0.5in', left: '0.6in', right: '0.6in' }, tagged: true });
  const pages = Number(pdf.toString('latin1').match(/\/Count (\d+)/)?.[1]);
  await writeFile(join(root, 'resume.pdf'), pdf);
  if (pages !== 1) {
    console.error(`resume.pdf is ${pages} pages. Tighten the résumé or its print styles in style.css.`);
    process.exitCode = 1;
  }
  console.log(`Wrote resume.pdf (${pages} page${pages === 1 ? '' : 's'})`);
} finally {
  await browser.close();
  server.close();
}
