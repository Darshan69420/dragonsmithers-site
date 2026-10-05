import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = ['/', '/business/', '/privacy/', '/portfolio/', '/portfolio/wazuh-siem/', '/portfolio/proxmox-lab/', '/portfolio/trail-window/'];
const WIDTHS = [390, 768, 1280];
const SCHEMES = ['light', 'dark'];
// Links to files Darshan still has to add. Remove an entry once the file exists.
const KNOWN_PENDING = new Set(['/resume.pdf']);

/** Scroll through the page so every scroll-reveal has played, then let the last fades finish. */
async function settle(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) {
      scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 60));
    }
    scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(900);
}

/** Fail on console errors and uncaught exceptions. External requests are stubbed so tests run offline. */
async function watch(page) {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  return errors;
}

for (const scheme of SCHEMES) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });
    for (const path of PAGES) {
      for (const width of WIDTHS) {
        test(`${path} renders at ${width}px`, async ({ page }) => {
          const errors = await watch(page);
          await page.setViewportSize({ width, height: 900 });
          const res = await page.goto(path);
          expect(res.status()).toBe(200);
          await expect(page.locator('h1')).toHaveCount(1);
          await expect(page.locator('main#main')).toBeVisible();
          const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
          expect(sw, 'no horizontal scroll').toBeLessThanOrEqual(cw);
          expect(errors).toEqual([]);
        });
      }
      test(`${path} has no serious or critical axe issues`, async ({ page }) => {
        await watch(page);
        await page.goto(path);
        await settle(page);
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        const bad = violations.filter((v) => ['serious', 'critical'].includes(v.impact));
        expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      });
    }
  });
}

test('every internal link and in-page anchor resolves', async ({ page, request }) => {
  await watch(page);
  const checked = new Map();
  for (const path of [...PAGES, '/404.html']) {
    await page.goto(path);
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
    for (const href of hrefs) {
      if (/^(mailto:|https?:)/.test(href)) continue;
      const url = new URL(href, `http://localhost:8080${path}`);
      if (KNOWN_PENDING.has(url.pathname)) continue;
      if (!checked.has(url.pathname)) checked.set(url.pathname, (await request.get(url.pathname)).status());
      expect(checked.get(url.pathname), `${href} on ${path}`).toBe(200);
      if (url.hash.length > 1) {
        const html = await (await request.get(url.pathname)).text();
        expect(html, `#${url.hash.slice(1)} exists for ${href} on ${path}`).toContain(`id="${decodeURIComponent(url.hash.slice(1))}"`);
      }
    }
  }
});

test('unknown URLs get the custom 404 page', async ({ request }) => {
  const res = await request.get('/this-page-does-not-exist');
  expect(res.status()).toBe(404);
  expect(await res.text()).toContain('Ticket not found');
});

test.describe('quote form', () => {
  test.beforeEach(async ({ page }) => { await watch(page); await page.goto('/'); });

  test('shows inline errors and focuses the first bad field', async ({ page }) => {
    await page.getByRole('button', { name: 'Send my request' }).click();
    await expect(page.locator('#q-name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#q-email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#q-issue')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#q-name-err')).toBeVisible();
    await expect(page.locator('#formStatus')).toContainText('Check 3 fields');
    await expect(page.locator('#q-name')).toBeFocused();

    await page.fill('#q-name', 'Test Person');
    await page.fill('#q-email', 'not-an-email');
    await page.fill('#q-issue', 'Laptop will not boot past the logo.');
    await page.getByRole('button', { name: 'Send my request' }).click();
    await expect(page.locator('#q-name')).toHaveAttribute('aria-invalid', 'false');
    await expect(page.locator('#q-email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#q-email')).toBeFocused();
  });

  test('falls back to a prefilled email while no form key is set', async ({ page }) => {
    await page.fill('#q-name', 'Test Person');
    await page.fill('#q-email', 'test@example.com');
    await page.fill('#q-issue', 'Laptop will not boot past the logo.');
    await page.getByRole('button', { name: 'Send my request' }).click();
    await expect(page.locator('#formSent')).toBeVisible();
    await expect(page.locator('#sentMsg')).toContainText('email app');
  });

  test('posts to Web3Forms when configured and shows success', async ({ page }) => {
    let body;
    await page.route('https://api.web3forms.com/submit', async (r) => { body = r.request().postDataJSON(); await r.fulfill({ json: { success: true } }); });
    await page.evaluate(() => { document.querySelector('[name=access_key]').value = 'test-key'; });
    await page.fill('#q-name', 'Test Person');
    await page.fill('#q-email', 'test@example.com');
    await page.selectOption('#q-device', 'Mac');
    await page.fill('#q-issue', 'Laptop will not boot past the logo.');
    await page.getByRole('button', { name: 'Send my request' }).click();
    await expect(page.locator('#formSent')).toBeVisible();
    await expect(page.locator('#formSent')).toBeFocused();
    expect(body).toMatchObject({ access_key: 'test-key', name: 'Test Person', email: 'test@example.com', device: 'Mac' });
    expect(body.subject).toContain('Mac');
    expect(body.redirect).toBeUndefined();
  });

  test('shows an error with an email fallback when sending fails', async ({ page }) => {
    await page.route('https://api.web3forms.com/submit', (r) => r.fulfill({ status: 500, json: { success: false, message: 'nope' } }));
    await page.evaluate(() => { document.querySelector('[name=access_key]').value = 'test-key'; });
    await page.fill('#q-name', 'Test Person');
    await page.fill('#q-email', 'test@example.com');
    await page.fill('#q-issue', 'Laptop will not boot past the logo.');
    await page.getByRole('button', { name: 'Send my request' }).click();
    await expect(page.locator('#formStatus')).toContainText("didn't send");
    await expect(page.locator('#formStatus a[href^="mailto:"]')).toBeVisible();
    await expect(page.locator('#quoteForm')).toBeVisible();
  });

  test('silently drops honeypot submissions', async ({ page }) => {
    let posted = false;
    await page.route('https://api.web3forms.com/submit', (r) => { posted = true; r.fulfill({ json: { success: true } }); });
    await page.evaluate(() => { document.querySelector('[name=access_key]').value = 'test-key'; document.querySelector('[name=botcheck]').checked = true; });
    await page.fill('#q-name', 'Bot');
    await page.fill('#q-email', 'bot@example.com');
    await page.fill('#q-issue', 'Buy cheap followers now!!!');
    await page.getByRole('button', { name: 'Send my request' }).click();
    await page.waitForTimeout(300);
    expect(posted).toBe(false);
  });

  test('device picker preselects the device', async ({ page }) => {
    await page.getByRole('link', { name: 'Custom PC build' }).click();
    await expect(page.locator('#q-device')).toHaveValue('Custom PC build');
    await page.goto('/?device=Business%20IT#quote');
    await expect(page.locator('#q-device')).toHaveValue('Business IT');
  });
});

test('site is dark-only: no theme toggle, dark in a light-preferring browser, stale choice cleared', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const page = await ctx.newPage();
  await watch(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload();
  await expect(page.locator('.theme-toggle')).toHaveCount(0);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(10, 6, 7)');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
  await ctx.close();
});

test('hero loops pause when the hero scrolls off screen', async ({ page }) => {
  await watch(page);
  await page.goto('/');
  await expect(page.locator('.hero')).not.toHaveClass(/is-idle/);
  await page.locator('#faq').scrollIntoViewIfNeeded();
  await expect(page.locator('.hero')).toHaveClass(/is-idle/);
});

test('copy button copies the email address', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await watch(page);
  await page.goto('/');
  await page.locator('#quote [data-copy]').click();
  await expect(page.locator('#quote [data-copy]')).toContainText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('darshan@dragonsmithers.com');
});

test('sticky quote bar appears on mobile after scrolling and hides at the form', async ({ page }) => {
  await watch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const bar = page.locator('.quickbar');
  await expect(bar).toHaveClass(/is-hidden/);
  await page.locator('#process').scrollIntoViewIfNeeded();
  await expect(bar).not.toHaveClass(/is-hidden/);
  await page.locator('#quote').scrollIntoViewIfNeeded();
  await expect(bar).toHaveClass(/is-hidden/);
});

test('pages carry unique titles, descriptions, canonicals and OG images', async ({ page, request }) => {
  const seen = new Set();
  for (const path of PAGES) {
    await page.goto(path);
    const title = await page.title();
    const desc = await page.locator('meta[name=description]').getAttribute('content');
    expect(seen.has(title), `duplicate title ${title}`).toBe(false);
    seen.add(title);
    expect(desc.length).toBeGreaterThan(50);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', `https://dragonsmithers.com${path}`);
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect((await request.get(new URL(og).pathname)).status()).toBe(200);
  }
  for (const f of ['/sitemap.xml', '/robots.txt', '/site.webmanifest', '/favicon.ico', '/apple-touch-icon.png', '/CNAME']) {
    expect((await request.get(f)).status(), f).toBe(200);
  }
});

test('no phone numbers or street addresses leak onto the site', async ({ request }) => {
  for (const path of [...PAGES, '/404.html']) {
    const html = await (await request.get(path)).text();
    const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    expect(text, path).not.toMatch(/\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/);
  }
});

test.describe('motion', () => {
  test('reduced-motion users get every section visible with no reveal states', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('html')).not.toHaveClass(/reveal-ready/);
      const hidden = await page.$$eval('[data-reveal]', (els) => els.filter((e) => getComputedStyle(e).opacity !== '1').length);
      expect(hidden, path).toBe(0);
    }
    await ctx.close();
  });

  test('every reveal target is fully visible after scrolling through', async ({ page }) => {
    await watch(page);
    for (const path of PAGES) {
      await page.goto(path);
      await settle(page);
      const stuck = await page.$$eval('[data-reveal]', (els) => els.filter((e) => !e.classList.contains('in') || getComputedStyle(e).opacity !== '1').map((e) => e.className || e.tagName));
      expect(stuck, path).toEqual([]);
    }
  });
});
