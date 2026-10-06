/* DragonSmiths site script. Plain JS, no build step, loaded with `defer` on every page.
   ------------------------------------------------------------------------------------
   CONFIG: the two values below are the only things you need to fill in.
   - Cloudflare Web Analytics token: from dash.cloudflare.com > Analytics & Logs > Web Analytics.
     Leave empty to load no analytics at all.
   - The Web3Forms access key lives in index.html (hidden input named "access_key"),
     so the form also works without JavaScript once it is set.                        */
// TODO(darshan): paste your Cloudflare Web Analytics token here (or leave '' to disable analytics).
const CF_ANALYTICS_TOKEN = '';
const CONTACT_EMAIL = 'darshan@dragonsmithers.com';
const FORM_KEY_PLACEHOLDER = 'YOUR_WEB3FORMS_ACCESS_KEY';

(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  };

  /* Footer year */
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* The site is dark-only now; forget any light/dark choice saved by the old theme toggle. */
  if (store.get('theme')) store.set('theme', null);
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  /* Click-to-copy (any button with data-copy) */
  $$('[data-copy]').forEach((btn) => {
    const label = $('span', btn) || btn;
    const original = label.textContent;
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch {
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        ta.setAttribute('readonly', '');
        ta.className = 'vh';
        document.body.append(ta);
        ta.select();
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        ta.remove();
      }
      label.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      const live = $('#copy-live');
      if (live) live.textContent = ok ? `${text} copied to clipboard` : '';
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { label.textContent = original; }, 1800);
    });
  });

  /* Hero device picker: preselect the device in the quote form */
  const form = $('#quoteForm');
  $$('[data-device]').forEach((a) => a.addEventListener('click', (e) => {
    if (!form) return;
    e.preventDefault();
    form.elements.device.value = a.dataset.device;
    $('#quote').scrollIntoView();
    history.replaceState(null, '', '#quote');
    setTimeout(() => form.elements.name.focus({ preventScroll: true }), 450);
  }));

  /* Quote form: validate, send to Web3Forms, fall back to a prefilled email */
  if (form) {
    form.noValidate = true;
    const wanted = new URLSearchParams(location.search).get('device');
    if (wanted && [...form.elements.device.options].some((o) => o.value === wanted)) form.elements.device.value = wanted;
    const status = $('#formStatus');
    const btn = $('button[type="submit"]', form);
    const fields = ['name', 'email', 'issue'];
    const messages = {
      name: 'Tell me your name so I know who to reply to.',
      email: 'Enter an email address like name@example.com.',
      issue: 'Describe what the device is doing (a sentence is fine).',
    };
    const check = (name) => {
      const el = form.elements[name];
      const err = $(`#${el.id}-err`);
      const bad = !el.value.trim() || (el.type === 'email' && !el.validity.valid) || (name === 'issue' && el.value.trim().length < 8);
      el.setAttribute('aria-invalid', bad ? 'true' : 'false');
      err.textContent = bad ? messages[name] : '';
      err.hidden = !bad;
      return !bad;
    };
    fields.forEach((n) => form.elements[n].addEventListener('blur', () => {
      if (form.elements[n].getAttribute('aria-invalid') || form.elements[n].value) check(n);
    }));
    fields.forEach((n) => form.elements[n].addEventListener('input', () => {
      if (form.elements[n].getAttribute('aria-invalid') === 'true') check(n);
    }));

    const v = (n) => (form.elements[n]?.value || '').trim();
    const mailtoHref = () => {
      const subject = `Repair quote: ${v('device')}${v('town') ? ` (${v('town')})` : ''}`;
      const body = `Name: ${v('name')}\nEmail: ${v('email')}\nTown: ${v('town')}\nDevice: ${v('device')}\n\n${v('issue')}`;
      return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };
    const showError = (html) => {
      status.className = 'form-status is-error';
      status.innerHTML = html;
    };
    const showSent = (viaEmail) => {
      const panel = $('#formSent');
      $('#sentMsg', panel).textContent = viaEmail
        ? `Your email app should have opened with everything filled in. Hit send there and I'll reply to ${v('email')}. If nothing opened, email ${CONTACT_EMAIL} directly.`
        : `Thanks, ${v('name').split(' ')[0]}. Your request is in my inbox. I'll reply to ${v('email')} with next steps and a price.`;
      form.hidden = true;
      panel.hidden = false;
      panel.focus();
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = '';
      status.className = 'form-status';
      const bad = fields.filter((n) => !check(n));
      if (bad.length) {
        status.className = 'form-status is-error';
        status.innerHTML = `<b>Check ${bad.length === 1 ? 'one field' : `${bad.length} fields`}.</b> ${bad.map((n) => messages[n]).join(' ')}`;
        form.elements[bad[0]].focus();
        return;
      }
      if (form.elements.botcheck?.checked) return; // honeypot tripped: silently drop

      const key = form.elements.access_key?.value || '';
      if (!key || key === FORM_KEY_PLACEHOLDER) { // form service not configured yet: use email
        location.href = mailtoHref();
        showSent(true);
        return;
      }
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      status.textContent = 'Sending…';
      try {
        const data = Object.fromEntries(new FormData(form));
        data.subject = `Repair quote: ${v('device')}${v('town') ? ` (${v('town')})` : ''}`;
        data.from_name = 'DragonSmiths website';
        delete data.redirect; // only used by the no-JavaScript fallback
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.message || `HTTP ${res.status}`);
        status.textContent = '';
        showSent(false);
      } catch {
        showError(`<b>That didn't send.</b> Nothing was lost: <a href="${mailtoHref()}">send it by email instead</a> (it's prefilled), or write to ${CONTACT_EMAIL}.`);
      } finally {
        btn.removeAttribute('aria-busy');
        btn.disabled = false;
      }
    });
  }

  /* Sticky mobile quote bar: shown once the hero buttons scroll away, hidden at the form */
  const bar = $('.quickbar');
  if (bar && 'IntersectionObserver' in window) {
    const watch = $$('[data-bar-hide]');
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? seen.add(en.target) : seen.delete(en.target)));
      bar.classList.toggle('is-hidden', seen.size > 0);
    });
    watch.forEach((el) => io.observe(el));
    document.body.classList.add('has-bar');
  }

  /* Résumé print button prints only the résumé */
  $$('[data-print-resume]').forEach((b) => b.addEventListener('click', () => {
    document.body.classList.add('print-resume');
    window.print();
  }));
  window.addEventListener('afterprint', () => document.body.classList.remove('print-resume'));

  /* ---- Motion (all of it is skipped for prefers-reduced-motion) ---- */
  const header = $('.top');
  const onScroll = () => header && header.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Number children so CSS can stagger them (style properties set via CSSOM are allowed by the CSP).
  const stagger = (els, cap = 8) => els.forEach((el, i) => el.style.setProperty('--i', Math.min(i, cap)));
  // The hero's ember and eye loops pause whenever the hero is off screen (saves battery, cuts distraction).
  const hero = $('.hero');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => hero.classList.toggle('is-idle', !en.isIntersecting)).observe(hero);
  }
  $$('.diagram').forEach((fig) => { stagger($$('.wire', fig), 12); stagger($$('.sig', fig), 12); });

  const REVEAL = [
    '.band-head', '.rate', '.flow', '.job', '.slot', '.creds > div', '.review-copy', '.review-slot',
    '.faq details', 'form.quote', '.towns li', '.proj', '.spec-wrap', '.history > div', '.resume',
    '.checklist li', '.plan > aside', '.case-body > section', '.fault', '.diagram', '.features li',
    '.learning .item', '.next-case', '.prose > *', '.lost .ticket',
  ].join(',');
  const targets = $$(REVEAL);
  if (!calm.matches && 'IntersectionObserver' in window) {
    const groups = new Map();
    targets.forEach((el) => {
      el.dataset.reveal = '';
      const sibs = groups.get(el.parentElement) || [];
      sibs.push(el);
      groups.set(el.parentElement, sibs);
    });
    groups.forEach((sibs) => sibs.forEach((el, i) => el.style.setProperty('--i', Math.min(i, 8))));
    // Anything already on screen is shown as-is, so nothing above the fold ever flashes.
    // Read every position first, then write, so this costs one layout instead of one per element.
    const fold = innerHeight;
    const onScreen = targets.map((el) => el.getBoundingClientRect().top < fold);
    targets.forEach((el, i) => onScreen[i] && el.classList.add('in'));
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      io.unobserve(en.target);
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    targets.forEach((el) => !el.classList.contains('in') && io.observe(el));
    document.documentElement.classList.add('reveal-ready');
  } else {
    targets.forEach((el) => el.classList.add('in'));
  }

  // Pointer glow on the intake ticket.
  $$('.intake').forEach((card) => {
    let raf = 0;
    card.addEventListener('pointermove', (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
        raf = 0;
      });
    });
  });

  // Case-study table of contents follows the section you're reading.
  const toc = $$('.toc a');
  if (toc.length && 'IntersectionObserver' in window) {
    const byId = new Map(toc.map((a) => [a.hash.slice(1), a]));
    const spy = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      toc.forEach((a) => { a.classList.remove('is-active'); a.removeAttribute('aria-current'); });
      const a = byId.get(en.target.id);
      if (a) { a.classList.add('is-active'); a.setAttribute('aria-current', 'location'); }
    }), { rootMargin: '-35% 0px -60% 0px' });
    byId.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  /* Portfolio dragon: pointer parallax, embers that rise off its glowing ribbons, crackling arcs,
     and a roar (shake, shockwave, spark burst) on click or tap. The canvas only runs while the
     dragon is on screen and the tab is visible. Reduced-motion users get the still art. */
  const dragon = $('.dragon');
  if (dragon && !calm.matches) dragonFx(dragon);

  function dragonFx(el) {
    const canvas = $('.dragon-fx', el);
    const art = $('.dragon-img', el);
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx || !art) return;
    const COLORS = ['255,74,48', '255,120,64', '255,176,120', '229,57,44', '255,214,180'];
    const MAX = 280;
    let w = 0, h = 0, dpr = 1, raf = 0, last = 0, onScreen = false, boost = 0, nextArc = 90;
    let points = [];
    const parts = [];
    const arcs = [];

    // One soft round sprite per color: far cheaper than a gradient or shadowBlur per particle.
    const sprites = COLORS.map((c) => {
      const s = document.createElement('canvas');
      s.width = s.height = 64;
      const g = s.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,240,225,1)');
      grad.addColorStop(0.18, `rgba(${c},0.95)`);
      grad.addColorStop(0.5, `rgba(${c},0.25)`);
      grad.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return s;
    });

    // The canvas overhangs the art (see .dragon-fx in style.css); map art coords (0-1) to canvas pixels.
    const toX = (u) => ((0.08 + u) / 1.16) * w;
    const toY = (v) => ((0.12 + v) / 1.18) * h;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = () => points[(Math.random() * points.length) | 0];

    // Find the bright red ribbon pixels once, so embers and arcs come off the dragon itself.
    const sample = () => {
      try {
        const sw = 160, sh = Math.round((160 * art.naturalHeight) / art.naturalWidth);
        const off = document.createElement('canvas');
        off.width = sw; off.height = sh;
        const g = off.getContext('2d', { willReadFrequently: true });
        g.drawImage(art, 0, 0, sw, sh);
        const d = g.getImageData(0, 0, sw, sh).data;
        for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
          const i = (y * sw + x) * 4;
          if (d[i + 3] > 200 && d[i] > 170 && d[i + 1] < 110) points.push([x / sw, y / sh]);
        }
      } catch { /* fall back below */ }
      if (points.length < 20) points = Array.from({ length: 200 }, () => [rand(0.15, 0.95), rand(0.1, 0.95)]);
    };

    const ember = () => {
      const [u, v] = pick();
      parts.push({ k: 0, x: toX(u), y: toY(v), vx: rand(-0.35, 0.35), vy: rand(-1.4, -0.4), life: 0, max: rand(60, 150), size: rand(3, 9) * dpr, c: (Math.random() * COLORS.length) | 0, ph: rand(0, 6.28) });
    };
    const burst = (x, y, n, power = 1) => {
      for (let i = 0; i < n && parts.length < MAX + 120; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(2, 9) * power * dpr;
        parts.push({ k: 1, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rand(28, 60), size: rand(1.2, 2.6) * dpr, c: (Math.random() * COLORS.length) | 0 });
      }
    };
    // A jagged lightning arc between two ribbon points, redrawn with fresh jitter each frame it lives.
    const arc = () => {
      const [u1, v1] = pick(), [u2, v2] = pick();
      arcs.push({ x1: toX(u1), y1: toY(v1), x2: toX(u2), y2: toY(v2), life: 0, max: rand(8, 16) });
    };
    const drawArc = (a) => {
      const segs = 9, dx = a.x2 - a.x1, dy = a.y2 - a.y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      const jag = Math.min(40 * dpr, len * 0.12);
      const fade = 1 - a.life / a.max;
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      for (let i = 1; i < segs; i++) {
        const t = i / segs, off = rand(-jag, jag);
        ctx.lineTo(a.x1 + dx * t + nx * off, a.y1 + dy * t + ny * off);
      }
      ctx.lineTo(a.x2, a.y2);
      ctx.strokeStyle = `rgba(255,60,40,${0.35 * fade})`;
      ctx.lineWidth = 7 * dpr;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,225,210,${0.9 * fade})`;
      ctx.lineWidth = 1.4 * dpr;
      ctx.stroke();
    };

    const tick = (t) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(3, (t - last) / 16.67) : 1;
      last = t;
      // Fractional spawn rates carry over as a chance, so the average rate holds at any frame rate.
      let spawn = (boost > 0 ? 4 : 1.3) * dt;
      for (; spawn >= 1 && parts.length < MAX; spawn--) ember();
      if (parts.length < MAX && Math.random() < spawn) ember();
      boost = Math.max(0, boost - dt);
      if ((nextArc -= dt) <= 0) { arc(); if (Math.random() < 0.4) arc(); nextArc = rand(50, 140); }

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life += dt;
        if (p.life >= p.max) { parts.splice(i, 1); continue; }
        const f = 1 - p.life / p.max;
        if (p.k === 0) {
          p.vx += Math.sin(p.ph + p.life * 0.08) * 0.03 * dt;
          p.x += p.vx * dt * dpr;
          p.y += p.vy * dt * dpr;
          const s = p.size * (0.4 + f);
          ctx.globalAlpha = Math.min(1, f * 1.6) * (p.life < 8 ? p.life / 8 : 1);
          ctx.drawImage(sprites[p.c], p.x - s, p.y - s, s * 2, s * 2);
        } else {
          p.vx *= 0.93 ** dt; p.vy = p.vy * 0.93 ** dt + 0.06 * dt * dpr;
          const ox = p.x, oy = p.y;
          p.x += p.vx * dt; p.y += p.vy * dt;
          ctx.globalAlpha = f;
          ctx.strokeStyle = `rgb(${COLORS[p.c]})`;
          ctx.lineWidth = p.size;
          ctx.beginPath(); ctx.moveTo(ox - p.vx * 2, oy - p.vy * 2); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i];
        if ((a.life += dt) >= a.max) { arcs.splice(i, 1); continue; }
        drawArc(a);
      }
    };

    const run = () => {
      const go = onScreen && !document.hidden && w > 0;
      el.classList.toggle('is-idle', !onScreen || document.hidden);
      if (go && !raf) { last = 0; raf = requestAnimationFrame(tick); }
      if (!go && raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    const size = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.width = Math.round(canvas.clientWidth * dpr);
      h = canvas.height = Math.round(canvas.clientHeight * dpr);
      run();
    };
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(canvas); else addEventListener('resize', size);
    if ('IntersectionObserver' in window) new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; run(); }).observe(el);
    else onScreen = true;
    document.addEventListener('visibilitychange', run);

    const ready = art.complete && art.naturalWidth ? Promise.resolve() : new Promise((r) => art.addEventListener('load', r, { once: true }));
    ready.then(() => {
      sample();
      size();
      // The summon: a spark burst from the head as the dragon fades in.
      setTimeout(() => { burst(toX(0.82), toY(0.5), 90, 1.2); arc(); arc(); boost = 60; }, 700);
    });

    // Roar on click or tap, with sparks from wherever it was hit.
    el.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      burst((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr, 70, 1);
      burst(toX(0.82), toY(0.5), 50, 1.4);
      for (let i = 0; i < 4; i++) arc();
      boost = 45;
      el.classList.remove('roar');
      void el.offsetWidth; // restart the CSS roar if it's clicked again mid-roar
      el.classList.add('roar');
      clearTimeout(el._roar);
      el._roar = setTimeout(() => el.classList.remove('roar'), 950);
    });

    // Parallax: the dragon leans toward the pointer anywhere in the header (mouse and pen only).
    const headEl = el.closest('.sheet-head');
    if (headEl && matchMedia('(pointer: fine)').matches) {
      let pending = 0;
      headEl.addEventListener('pointermove', (e) => {
        if (pending) return;
        pending = requestAnimationFrame(() => {
          pending = 0;
          const r = el.getBoundingClientRect();
          const px = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 1.2)));
          const py = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 1.2)));
          el.style.setProperty('--px', px.toFixed(3));
          el.style.setProperty('--py', py.toFixed(3));
        });
      });
      headEl.addEventListener('pointerleave', () => { el.style.setProperty('--px', 0); el.style.setProperty('--py', 0); });
    }
  }

  /* Privacy-friendly analytics, only when a token is configured */
  if (CF_ANALYTICS_TOKEN) {
    const s = document.createElement('script');
    s.defer = true;
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.dataset.cfBeacon = JSON.stringify({ token: CF_ANALYTICS_TOKEN });
    document.head.append(s);
  }
})();
