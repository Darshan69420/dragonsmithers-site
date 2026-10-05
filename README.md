# dragonsmithers.com

The DragonSmiths Tech Repair site (`/`) and Darshan Sanjel's portfolio (`/portfolio/`).

It's plain HTML, CSS and JavaScript served by GitHub Pages. **There is no build step.** Edit a file,
push to `main`, and it's live a minute later. Everything in `package.json` (tests, Lighthouse, image
and font tools) is for development only and never needed for the site to work.

```
index.html                  Repair homepage
business/index.html         Small-business IT plan
privacy/index.html          Privacy notice
portfolio/index.html        Portfolio + HTML résumé
portfolio/<slug>/index.html Case studies (wazuh-siem, proxmox-lab, trail-window)
404.html                    "Ticket not found"
style.css                   The whole design system: Ember palette tokens at the top, motion at the bottom
site.js                     Scroll reveals, copy buttons, quote form, mobile quote bar, analytics
fonts/                      Self-hosted, subset Archivo + IBM Plex Mono (OFL)
og/                         1200×630 social cards
CNAME                       dragonsmithers.com (don't touch)
```

## Fill in the TODOs

Every unconfirmed fact is marked with an HTML comment. List them all:

```sh
grep -rn "TODO(darshan)" --include=*.html --include=*.js .
```

The three that make features work:

1. **Quote form key:** sign up free at [web3forms.com](https://web3forms.com) with
   `darshan@dragonsmithers.com`, then paste the key into `index.html` in place of
   `YOUR_WEB3FORMS_ACCESS_KEY` (search for `access_key`). Until then, the form opens a prefilled email instead.
2. **Analytics:** paste a Cloudflare Web Analytics token into `CF_ANALYTICS_TOKEN` at the top of `site.js`.
   Leave it empty and no analytics load at all.
3. **Résumé PDF:** add `resume.pdf` to the repo root. The download buttons already point at `/resume.pdf`.
   Then remove `/resume.pdf` from `KNOWN_PENDING` in `tests/site.spec.mjs`.

## Common edits

### Change a price
In `index.html`, find the `<div class="rates">` block. Each job is one `<div class="rate">`; change the
number inside `<div class="price">` and the word in `<small>` ("starting", "labor", "+ parts"). The business
plan price is also on `business/index.html` in the "Plan sheet".

### Add a review
Reviews are an empty state until you have real ones. **Never add a quote you didn't get.**
1. Set your Google review link in the `#reviews` section of `index.html` and remove `hidden` from that button.
2. To show a real review, replace the `<div class="review-slot" aria-hidden="true">` with:
   ```html
   <figure class="review-slot">
     <blockquote><p>"What they actually wrote."</p></blockquote>
     <figcaption class="who">First name · Town · Device</figcaption>
   </figure>
   ```
   Ask the customer before you post their name.

### Add a finished job to the Job log
In `index.html`, copy the `<article class="ticket job">` block in `#jobs`, change the details, and remove
the "Sample write-up" label. Before/after photos: put them in `/jobs/` and swap each `<b>` in `.ba` for
`<figure><img src="/jobs/name-before.jpg" alt="…" width="800" height="600" loading="lazy"></figure>`.
Once you have a real job, delete the sample.

### Add a case study
1. Copy `portfolio/trail-window/` to `portfolio/<new-slug>/` and rewrite the text. Keep the five sections:
   problem, setup, architecture, what broke, what's next.
2. The diagram is inline SVG. Use the classes `box`, `box hot`, `zone`, `wire`, `wire dash`, `t`, `s`
   and `z` so it picks up the site's colors automatically. Give every marker id a unique prefix.
3. Update the "Previous / Next" links at the bottom of the neighboring case studies.
4. Link it from the project in `portfolio/index.html` with `<a href="/portfolio/<new-slug>/" class="case">`.
5. Add it to `sitemap.xml`, to `PAGES` in `tests/site.spec.mjs`, and give it an OG card in
   `tools/og-images.mjs`, then run `npm run og`.

### Header, footer or `<head>` changes
Each page carries its own copy (no build step), so change all eight HTML files the same way.
If you add an inline `<script>`, the Content-Security-Policy meta tag will block it: put code in `site.js`.

## Run the checks

```sh
npm install
npm test            # Playwright: every page at 390/768/1280, links, form, motion, axe
npm run lhci        # Lighthouse CI (start `npm run serve` in another terminal first)
node tools/audit.mjs http://localhost:8080 audit-out   # full audit with screenshots (start `npm run serve` first)
```

Other tools: `npm run og` regenerates social cards and icons; `npm run fonts` re-subsets the fonts
(needs `pip install fonttools brotli`).

Pull requests run the same tests and Lighthouse CI in GitHub Actions (`.github/workflows/checks.yml`).
Pushes to `main` are deployed by GitHub Pages and are never blocked by these checks.

## Security headers

GitHub Pages can't set custom HTTP headers, so each page sets what it can in `<meta>` tags:
a Content-Security-Policy (only this site, Web3Forms and Cloudflare analytics are allowed) and a
`strict-origin-when-cross-origin` referrer policy. Headers that only work as real HTTP headers
(`frame-ancestors`/`X-Frame-Options`, `Strict-Transport-Security` preload, `Permissions-Policy`,
`X-Content-Type-Options`) need a proxy such as Cloudflare in front of Pages.
