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

  /* Theme toggle: system -> light -> dark -> system. The <head> snippet applies the saved
     choice before first paint, so this only handles clicks. */
  const modes = ['system', 'light', 'dark'];
  const names = { system: 'Auto', light: 'Light', dark: 'Dark' };
  const applyTheme = (mode) => {
    const root = document.documentElement;
    if (mode === 'system') delete root.dataset.theme; else root.dataset.theme = mode;
    $$('.theme-toggle').forEach((btn) => {
      btn.dataset.mode = mode;
      btn.setAttribute('aria-label', `Color theme: ${names[mode]}. Change theme`);
      const label = $('span', btn);
      if (label) label.textContent = names[mode];
    });
  };
  const saved = store.get('theme');
  applyTheme(modes.includes(saved) ? saved : 'system');
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  $$('.theme-toggle').forEach((btn) => btn.addEventListener('click', () => {
    const next = modes[(modes.indexOf(btn.dataset.mode || 'system') + 1) % modes.length];
    store.set('theme', next === 'system' ? null : next);
    if (!document.startViewTransition || calm.matches) { applyTheme(next); return; }
    // Circular reveal that grows out of the toggle, so the change visibly comes from what was clicked.
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const root = document.documentElement;
    root.classList.add('theme-vt');
    const vt = document.startViewTransition(() => applyTheme(next));
    vt.ready.then(() => root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
    )).catch(() => {});
    vt.finished.finally(() => root.classList.remove('theme-vt'));
  }));

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
  $$('.traces').forEach((svg) => {
    stagger($$('path:not(.sig):not(.pad)', svg));
    stagger($$('.sig', svg));
    stagger($$('.pad', svg));
  });
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

  /* Privacy-friendly analytics, only when a token is configured */
  if (CF_ANALYTICS_TOKEN) {
    const s = document.createElement('script');
    s.defer = true;
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.dataset.cfBeacon = JSON.stringify({ token: CF_ANALYTICS_TOKEN });
    document.head.append(s);
  }
})();
