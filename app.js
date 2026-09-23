/* ===================================================================
   Comfort Next × Fall Home Show — Scratch & Win
   Flow: Welcome → Scratch → Congratulations → Contact details → Done
   Entries are saved to the server database (api/entry.php). If the
   booth Wi-Fi drops, entries wait on the iPad and upload automatically.
   =================================================================== */
(function () {
  'use strict';

  const cfg = window.FHS_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------------- Local storage (never throws) ---------------- */
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('Storage write failed', e); } }
  };
  const K = { backup: 'fhs_backup', outbox: 'fhs_outbox', device: 'fhs_device', seq: 'fhs_seq' };

  function rand(n) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
  function fill(tpl, vars) { return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  const deviceCode = store.get(K.device, null) || (() => {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const code = abc[rand(24)] + abc[rand(24)];
    store.set(K.device, code);
    return code;
  })();

  /* ---------------- State ---------------- */
  const state = { screen: 'welcome', entry: null, idleTimer: null, doneTimer: null, doneLeft: 0, revealTimer: null };

  function show(name) {
    state.screen = name;
    document.body.dataset.screen = name;
    window.scrollTo(0, 0);
    armIdle();
  }

  /* ---------------- Idle + privacy reset ---------------- */
  function armIdle() {
    clearTimeout(state.idleTimer);
    if (['scratch', 'congrats', 'form'].includes(state.screen)) {
      state.idleTimer = setTimeout(resetKiosk, cfg.idleResetSeconds * 1000);
    }
  }
  ['pointerdown', 'keydown', 'input'].forEach(ev =>
    document.addEventListener(ev, () => {
      armIdle();
      if (state.screen === 'done') state.doneLeft = cfg.doneResetSeconds;
    }, { passive: true })
  );

  function resetKiosk() {
    clearTimeout(state.idleTimer);
    clearTimeout(state.revealTimer);
    clearInterval(state.doneTimer);
    state.entry = null;

    const form = $('#entryForm');
    form.reset();
    $$('.err', form).forEach(e => (e.textContent = ''));
    $$('input', form).forEach(i => { i.removeAttribute('aria-invalid'); i.name = 'f' + Math.random().toString(36).slice(2); });
    $('.consent').classList.remove('is-invalid');
    $('#formError').hidden = true;
    setSubmitting(false);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

    scratch.teardown();
    ['#prizeUnder', '#winCard', '#winUses'].forEach(s => ($(s).innerHTML = ''));
    ['#claimCaption', '#bookCaption', '#doneMeta', '#resetCount'].forEach(s => ($(s).textContent = ''));
    $('#doneTitle').textContent = "You're all set!";
    confetti.stop();
    $$('.sheet').forEach(s => (s.hidden = true));

    goHome();
  }

  /* iPad (incl. iPadOS that reports as Mac) + desktop/laptop: unlimited.
     Phones and other mobile: one completed claim, remembered in a cookie. */
  function isIPad() {
    const ua = navigator.userAgent || '';
    if (/iPad/i.test(ua)) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }
  function isUnlimitedDevice() {
    const as = new URLSearchParams(location.search).get('as');
    if (as === 'phone' || as === 'mobile') return false;
    if (as === 'ipad' || as === 'booth') return true;
    if (isIPad()) return true;
    return !/iPhone|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
  }
  const PLAY_COOKIE = 'fhs_play';
  function cookieGet(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '=([^;]*)'));
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch { return null; }
  }
  function cookieSet(name, obj) {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(JSON.stringify(obj))
      + '; Max-Age=' + (60 * 60 * 24 * 365 * 10) + '; Path=/; SameSite=Lax' + secure;
  }
  function priorPlay() { return cookieGet(PLAY_COOKIE); }
  function rememberPlay(entry) {
    if (isUnlimitedDevice()) return;
    const p = prizeOf(entry);
    cookieSet(PLAY_COOKIE, {
      prizeId: p.id, amount: p.amount, label: p.label, subtitle: p.subtitle, entryId: entry.entryId
    });
  }
  function showAlreadyPlayed(play) {
    const p = Object.assign({}, prizeOf({ prizeId: play.prizeId }), play);
    $('#playedCard').innerHTML = giftCardHTML(p);
    show('played');
  }
  function goHome() {
    const play = priorPlay();
    if (!isUnlimitedDevice() && play) { showAlreadyPlayed(play); return; }
    show('welcome');
  }

  /* ---------------- 1. Welcome → deal a card ---------------- */
  function pickPrize() {
    const given = {};
    store.get(K.backup, []).forEach(x => (given[x.prizeId] = (given[x.prizeId] || 0) + 1));
    const pool = cfg.prizes.filter(p => p.weight > 0 && (p.limit == null || (given[p.id] || 0) < p.limit));
    const list = pool.length ? pool : [cfg.prizes.find(p => p.limit == null) || cfg.prizes[0]];
    const total = list.reduce((s, p) => s + p.weight, 0);
    let r = rand(Math.max(1, Math.round(total * 1000))) / 1000;
    for (const p of list) { if ((r -= p.weight) < 0) return p; }
    return list[list.length - 1];
  }
  function nextEntryId() {
    const seq = store.get(K.seq, 0) + 1;
    store.set(K.seq, seq);
    return `${cfg.entryPrefix}-${deviceCode}${String(seq).padStart(4, '0')}`;
  }
  const prizeOf = entry => cfg.prizes.find(p => p.id === entry.prizeId) || cfg.prizes[0];

  function startEntry() {
    const play = priorPlay();
    if (!isUnlimitedDevice() && play) { showAlreadyPlayed(play); return; }
    const prize = pickPrize();
    // The prize is fixed the moment the card appears; going back can't re-roll it.
    state.entry = { entryId: nextEntryId(), prizeId: prize.id, dealtAt: new Date().toISOString(), scratchedAt: null };
    $('#prizeUnder').innerHTML = giftCardHTML(prize);
    show('scratch');
    scratch.start();
  }
  $('#teaser').addEventListener('click', startEntry);
  $('#startBtn').addEventListener('click', startEntry);

  /* ---------------- Gift card + icons ---------------- */
  function giftCardHTML(p) {
    return `<div class="giftcard">
      <svg class="giftcard__bow" viewBox="0 0 100 70" aria-hidden="true">
        <path d="M50 35 C30 5 5 8 8 28 C11 45 35 40 50 35Z" fill="#1dcb72"/>
        <path d="M50 35 C70 5 95 8 92 28 C89 45 65 40 50 35Z" fill="#17b964"/>
        <path d="M50 35 L36 68 L44 64 L48 70 Z M50 35 L64 68 L56 64 L52 70 Z" fill="#13a95a"/>
        <circle cx="50" cy="35" r="8" fill="#0f9a50"/>
      </svg>
      <img class="giftcard__brand" src="${$('.logo-cn').src}" alt="">
      <div class="giftcard__amount">${esc(p.amount)}</div>
      <div class="giftcard__label">${esc(p.label)}</div>
      <div class="giftcard__sub">${esc(p.subtitle)}</div>
    </div>`;
  }
  const ICONS = {
    furnace: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9Z"/>',
    heat: '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-6 3-6s2 3-1 6M14 12c4 0 6 1 6 3s-3 2-6-1M12 14c0 4-1 6-3 6s-2-3 1-6M10 12c-4 0-6-1-6-3s3-2 6 1"/>',
    air: '<path d="M12 2v20M4 7l16 10M20 7 4 17M9 4l3 2 3-2M9 20l3-2 3 2"/>',
    water: '<rect x="6" y="3" width="12" height="18" rx="3"/><circle cx="12" cy="13" r="2"/><path d="M9 7h6"/>',
    softener: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z"/>',
    tune: '<path d="M14 6a4 4 0 0 1-5 5L4 16l4 4 5-5a4 4 0 0 1 5-5l-2-2 2-2Z"/>',
    more: '<path d="M3 11 12 4l9 7M5 10v10h14V10"/>'
  };
  function iconFor(text) {
    const t = text.toLowerCase();
    const key = t.includes('furnace') ? 'furnace' : t.includes('heat pump') ? 'heat' : t.includes('air') || t.includes('a/c') ? 'air'
      : t.includes('softener') ? 'softener' : t.includes('water') ? 'water' : t.includes('tune') ? 'tune' : 'more';
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg>`;
  }

  /* ---------------- 2. Scratch engine ---------------- */
  const scratch = (() => {
    const canvas = $('#scratchCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const hint = $('#fingerHint');
    const revealBtn = $('#revealBtn');
    let active = false, drawing = false, last = null, w = 0, h = 0, dpr = 1, lastCheck = 0, brush = 30;

    async function fontsReady() {
      if (!document.fonts || !document.fonts.load) return;
      await Promise.race([document.fonts.load('800 40px "Barlow Condensed"'), new Promise(r => setTimeout(r, 1200))]).catch(() => {});
    }
    async function start() {
      teardown();
      await fontsReady();
      if (state.screen !== 'scratch') return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      brush = Math.max(20, w * 0.07);
      drawCover();
      canvas.classList.remove('gone');
      hint.classList.remove('off');
      active = true;
      state.revealTimer = setTimeout(() => { if (active) revealBtn.hidden = false; }, 6000);
    }
    function drawCover() {
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#b6b9bc'); g.addColorStop(.38, '#e9ebed'); g.addColorStop(.62, '#adb1b4'); g.addColorStop(1, '#d8dbdd');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (let i = 0; i < 260; i++) {
        const y = Math.random() * h * 1.4 - h * .2, x = Math.random() * w;
        ctx.strokeStyle = Math.random() < .5 ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.05)';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * .25, y - w * .13); ctx.stroke();
      }
      for (let i = 0; i < 70; i++) {
        const cx = w / 2 + (Math.random() - .5) * w * .7, cy = h / 2 + (Math.random() - .5) * h * .45;
        ctx.strokeStyle = `rgba(255,255,255,${.12 + Math.random() * .18})`;
        ctx.lineWidth = 2 + Math.random() * 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - w * .12, cy + h * .05); ctx.lineTo(cx + w * .12, cy - h * .06); ctx.stroke();
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#35393c';
      ctx.font = `800 ${Math.round(h * .2)}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
      ctx.fillText('SCRATCH HERE', w / 2, h * .45);
      ctx.font = `700 ${Math.round(h * .085)}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
      ctx.fillText('TO SEE WHAT YOU WIN!', w / 2, h * .62);
    }
    function point(e) {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (w / r.width), y: (e.clientY - r.top) * (h / r.height) };
    }
    function erase(a, b) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = brush * 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x, b.y, brush, 0, Math.PI * 2); ctx.fill();
    }
    function percent() {
      const W = canvas.width, H = canvas.height;
      const data = ctx.getImageData(0, 0, W, H).data;
      const step = Math.max(4, Math.round(8 * dpr));
      let clear = 0, total = 0;
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) { total++; if (data[(y * W + x) * 4 + 3] < 40) clear++; }
      return (clear / total) * 100;
    }
    function check(force) {
      const now = performance.now();
      if (!force && now - lastCheck < 140) return;
      lastCheck = now;
      if (percent() >= cfg.revealAtPercent) reveal();
    }
    canvas.addEventListener('pointerdown', e => {
      if (!active) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      drawing = true; last = point(e); erase(last, last);
      hint.classList.add('off');
    });
    canvas.addEventListener('pointermove', e => {
      if (!active || !drawing) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) { const p = point(ev); erase(last, p); last = p; }
      check(false);
    });
    const up = () => { if (!drawing) return; drawing = false; if (active) check(true); };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    revealBtn.addEventListener('click', () => reveal());

    function reveal() {
      if (!active) return;
      active = false; drawing = false;
      revealBtn.hidden = true; hint.classList.add('off');
      canvas.classList.add('gone');
      if (state.entry) state.entry.scratchedAt = new Date().toISOString();
      confetti.burst();
      state.revealTimer = setTimeout(showCongrats, 1400);
    }
    function teardown() {
      active = false; drawing = false;
      clearTimeout(state.revealTimer);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      revealBtn.hidden = true; hint.classList.add('off');
    }
    return { start, teardown };
  })();

  /* ---------------- 3. Congratulations ---------------- */
  function showCongrats() {
    const entry = state.entry;
    if (!entry) return;
    const p = prizeOf(entry);
    const vars = { amount: p.amount, label: p.label.toLowerCase() };
    $('#winCard').innerHTML = giftCardHTML(p);
    $('#usesTitle').textContent = p.usesTitle || 'Good for';
    $('#winUses').innerHTML = (p.uses || []).map(u => `<li>${iconFor(u)}<span>${esc(u)}</span></li>`).join('');
    $('#claimCaption').textContent = fill(cfg.claimCaption, vars);
    show('congrats');
    confetti.rain(true);
  }
  $('#claimBtn').addEventListener('click', () => {
    confetti.stop();
    const p = prizeOf(state.entry || {});
    $('#formTitle').textContent = `Claim your ${p.amount} ${p.label.toLowerCase()}`;
    show('form');
    $('#fName').focus();
  });

  /* ---------------- 4. Contact details ---------------- */
  $('#consentText').textContent = cfg.consentText + (cfg.consentRequired ? '' : ' (optional)');
  $('#cancelBtn').addEventListener('click', resetKiosk);

  const phoneDigits = v => { let d = String(v).replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d; };
  const fmtPhone = d => d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d;
  $('#fPhone').addEventListener('blur', e => { const d = phoneDigits(e.target.value); if (d.length === 10) e.target.value = fmtPhone(d); });

  ['fName', 'fPhone', 'fEmail', 'fConsent'].forEach(id =>
    $('#' + id).addEventListener(id === 'fConsent' ? 'change' : 'input', () => { setErr(id, ''); $('#formError').hidden = true; })
  );
  const order = ['fName', 'fPhone', 'fEmail'];
  order.forEach((id, i) => $('#' + id).addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (i < order.length - 1) $('#' + order[i + 1]).focus(); else $('#entryForm').requestSubmit();
  }));

  function setErr(id, msg) {
    $(`.err[data-for="${id}"]`).textContent = msg || '';
    if (id === 'fConsent') $('.consent').classList.toggle('is-invalid', !!msg);
    else if (msg) $('#' + id).setAttribute('aria-invalid', 'true');
    else $('#' + id).removeAttribute('aria-invalid');
    return !msg;
  }
  function splitName(full) {
    const parts = full.split(' ').filter(Boolean);
    return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
  }
  function readForm() {
    const fullName = $('#fName').value.trim().replace(/\s+/g, ' ');
    const names = splitName(fullName);
    return {
      fullName,
      firstName: names.firstName,
      lastName: names.lastName,
      phone: phoneDigits($('#fPhone').value),
      email: $('#fEmail').value.trim().toLowerCase(),
      consent: $('#fConsent').checked
    };
  }
  function validate(v) {
    let ok = true;
    ok = setErr('fName', v.firstName && v.lastName ? '' : 'Enter your first and last name') && ok;
    ok = setErr('fPhone', v.phone.length === 10 ? '' : 'Enter a 10-digit mobile number') && ok;
    ok = setErr('fEmail', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email) ? '' : 'Enter an email like name@example.com') && ok;
    ok = setErr('fConsent', !cfg.consentRequired || v.consent ? '' : 'Tick the box to claim your prize') && ok;
    return ok;
  }
  function setSubmitting(on) {
    const b = $('#submitBtn');
    b.disabled = on;
    b.textContent = on ? 'Saving…' : 'Claim my prize';
  }

  $('#entryForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!state.entry) { resetKiosk(); return; }
    const v = readForm();
    if (!validate(v)) { const bad = $('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
    if (cfg.oneEntryPerPerson && store.get(K.backup, []).some(x => x.email === v.email || x.phone === v.phone)) {
      openSheet('dupSheet'); return;
    }
    if (document.activeElement) document.activeElement.blur();

    Object.assign(state.entry, v, { submittedAt: new Date().toISOString() });
    const payload = buildPayload(state.entry);
    setSubmitting(true);
    const result = await sendEntry(payload);
    setSubmitting(false);

    if (result.status === 'duplicate') { openSheet('dupSheet'); return; }
    if (result.status === 'invalid') {
      $('#formError').textContent = result.message || 'Some details need another look.';
      $('#formError').hidden = false;
      return;
    }
    // 'saved' or 'queued' — either way the visitor is done; queued entries upload later.
    saveBackup(payload, result.status);
    showDone();
  });

  /* ---------------- Saving to the server ---------------- */
  function buildPayload(entry) {
    const p = prizeOf(entry);
    const vars = {
      firstName: entry.firstName, lastName: entry.lastName, entryId: entry.entryId,
      amount: p.amount, label: p.label, subtitle: p.subtitle, schedulingUrl: cfg.schedulingUrl
    };
    vars.redeem = fill(p.redeem, vars);
    return {
      entryId: entry.entryId,
      event: cfg.eventName,
      device: deviceCode,
      fullName: entry.fullName || [entry.firstName, entry.lastName].filter(Boolean).join(' '),
      firstName: entry.firstName,
      lastName: entry.lastName,
      email: entry.email,
      phone: '+1' + entry.phone,
      consent: { given: !!entry.consent, text: cfg.consentText, timestamp: entry.consent ? entry.submittedAt : null },
      prize: { id: p.id, amount: p.amount, label: p.label, subtitle: p.subtitle, redeem: vars.redeem },
      dealtAt: entry.dealtAt,
      scratchedAt: entry.scratchedAt,
      submittedAt: entry.submittedAt,
      schedulingUrl: cfg.schedulingUrl,
      sms: { to: '+1' + entry.phone, body: fill(cfg.sms, vars) },
      emailMessage: { to: entry.email, subject: fill(cfg.emailSubject, vars), body: fill(cfg.emailBody, vars) }
    };
  }

  // One POST. Returns {status: 'saved' | 'duplicate' | 'invalid' | 'retry', message}
  async function post(payload) {
    if (!cfg.backend.enabled) return { status: 'retry', message: 'Saving is turned off in config.js' };
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(cfg.backend.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Kiosk-Key': cfg.backend.kioskKey },
        body: JSON.stringify(payload),
        signal: ctl.signal,
        cache: 'no-store'
      });
      let body = {};
      try { body = await res.json(); } catch {}
      if (res.ok) return { status: 'saved' };
      if (res.status === 409) return { status: 'duplicate' };
      if (res.status === 422) return { status: 'invalid', message: body.message };
      console.error('Entry API error', res.status, body);
      return { status: 'retry', message: body.message || `Server error ${res.status}` };
    } catch (err) {
      return { status: 'retry', message: String(err && err.message || err) };
    } finally { clearTimeout(t); }
  }

  async function sendEntry(payload) {
    if (!cfg.backend.enabled) { console.info('[Saving off] Entry not sent to a server:', payload); return { status: 'local' }; }
    const r = await post(payload);
    if (r.status !== 'retry') return r;
    const box = store.get(K.outbox, []);
    box.push({ payload, attempts: 1, lastError: r.message });
    store.set(K.outbox, box);
    console.warn('Entry saved on this iPad; will upload when the server is reachable.', r.message);
    return { status: 'queued' };
  }

  let flushing = false;
  async function flushOutbox() {
    if (flushing || !cfg.backend.enabled) return;
    flushing = true;
    try {
      let box = store.get(K.outbox, []);
      while (box.length) {
        const item = box[0];
        const r = await post(item.payload);
        if (r.status === 'retry') { item.attempts++; item.lastError = r.message; store.set(K.outbox, box); break; }
        box.shift(); store.set(K.outbox, box);
        markBackup(item.payload.entryId, r.status === 'saved' ? 'saved' : r.status);
        box = store.get(K.outbox, []);
      }
    } finally { flushing = false; }
  }
  setInterval(flushOutbox, 20000);
  window.addEventListener('online', flushOutbox);

  // Backup copy on the iPad (in case the server is ever unreachable for good).
  function saveBackup(payload, status) {
    const all = store.get(K.backup, []);
    all.push({
      entryId: payload.entryId, submittedAt: payload.submittedAt, firstName: payload.firstName, lastName: payload.lastName,
      phone: payload.phone.replace(/^\+1/, ''), email: payload.email, consentGiven: payload.consent.given,
      consentText: payload.consent.text, prizeId: payload.prize.id, upload: status
    });
    store.set(K.backup, all);
  }
  function markBackup(entryId, status) {
    const all = store.get(K.backup, []);
    const e = all.find(x => x.entryId === entryId);
    if (e) { e.upload = status; store.set(K.backup, all); }
  }

  /* ---------------- 5. Done ---------------- */
  function showDone() {
    const entry = state.entry;
    const p = prizeOf(entry);
    $('#doneTitle').textContent = `You're all set, ${entry.firstName}!`;
    $('#doneMeta').textContent = `Entry number ${entry.entryId}`;
    $('#bookBlock').hidden = !p.schedulable;
    $('#bookCaption').textContent = fill(cfg.bookCaption, { amount: p.amount, label: p.label.toLowerCase() });
    $('#qrBox').hidden = !cfg.showQRCode;
    rememberPlay(entry);
    $('#nextBtn').hidden = !isUnlimitedDevice();
    show('done');

    state.doneLeft = cfg.doneResetSeconds;
    $('#resetCount').textContent = `(${state.doneLeft})`;
    clearInterval(state.doneTimer);
    state.doneTimer = setInterval(() => {
      state.doneLeft--;
      $('#resetCount').textContent = `(${Math.max(0, state.doneLeft)})`;
      if (state.doneLeft <= 0) resetKiosk();
    }, 1000);
  }
  $('#scheduleBtn').addEventListener('click', () => window.open(cfg.schedulingUrl, '_blank', 'noopener'));
  $('#nextBtn').addEventListener('click', resetKiosk);

  function renderQR() {
    if (!cfg.showQRCode || !window.qrcode) return;
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(cfg.schedulingUrl); qr.make();
      $('#qrCode').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch { cfg.showQRCode = false; }
  }

  /* ---------------- Confetti ---------------- */
  const confetti = (() => {
    const cv = $('#confetti'), cx = cv.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const colors = ['#0e9f4f', '#23d27c', '#e7b43c', '#f3cf6b', '#ec1a5b', '#ffffff'];
    let parts = [], raf = 0, until = 0, looping = false;
    function size() {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = innerWidth * d; cv.height = innerHeight * d;
      cx.setTransform(d, 0, 0, d, 0, 0);
    }
    function add(n, fromX, fromY, spread) {
      for (let i = 0; i < n; i++) {
        const a = spread ? Math.random() * Math.PI * 2 : Math.PI / 2 + (Math.random() - .5) * .6;
        const v = spread ? 6 + Math.random() * 9 : 2 + Math.random() * 3;
        parts.push({
          x: fromX ?? Math.random() * innerWidth, y: fromY ?? -20 - Math.random() * 200,
          vx: Math.cos(a) * v, vy: spread ? Math.sin(a) * v - 6 : v,
          w: 6 + Math.random() * 8, h: 10 + Math.random() * 14, r: Math.random() * 6, vr: (Math.random() - .5) * .3,
          c: colors[rand(colors.length)]
        });
      }
    }
    function tick() {
      cx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(p => {
        p.vy += .22; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r);
        cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 1.7)) + 2);
        cx.restore();
      });
      parts = parts.filter(p => p.y < innerHeight + 40);
      if (looping && parts.length < 70) add(16);
      if (parts.length && (looping || performance.now() < until)) raf = requestAnimationFrame(tick);
      else { cx.clearRect(0, 0, innerWidth, innerHeight); parts = []; raf = 0; }
    }
    function run(ms) { until = performance.now() + ms; if (!raf) raf = requestAnimationFrame(tick); }
    return {
      burst() {
        if (reduce) return; looping = false; size();
        const r = $('#scratchWrap').getBoundingClientRect();
        add(140, r.left + r.width / 2, r.top + r.height / 2, true); run(4000);
      },
      rain(keep) {
        if (reduce) return; size(); looping = !!keep; add(110);
        if (keep) { if (!raf) raf = requestAnimationFrame(tick); }
        else run(5000);
      },
      stop() { looping = false; until = 0; parts = []; if (raf) cancelAnimationFrame(raf); raf = 0; cx.clearRect(0, 0, cv.width, cv.height); }
    };
  })();

  /* ---------------- Sheets ---------------- */
  function openSheet(id) { const s = $('#' + id); s.hidden = false; const b = $('button, input', s); if (b) b.focus(); }
  $$('.sheet').forEach(s => s.addEventListener('click', e => { if (e.target === s || e.target.hasAttribute('data-close')) s.hidden = true; }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.sheet').forEach(s => (s.hidden = true)); });
  $('#rulesBody').textContent = cfg.rulesText;
  $$('[data-open-rules]').forEach(b => b.addEventListener('click', () => openSheet('rulesSheet')));

  /* ---------------- Booth admin (tap the Fall Home Show logo 5×) ---------------- */
  let taps = [];
  $('#fhsLogo').addEventListener('click', () => {
    const now = Date.now();
    taps = taps.filter(t => now - t < 3000); taps.push(now);
    if (taps.length >= 5) { taps = []; openAdmin(); }
  });
  function openAdmin() {
    $('#adminLock').hidden = false; $('#adminBody').hidden = true; $('#adminPin').value = '';
    openSheet('adminSheet'); $('#adminPin').focus();
  }
  $('#adminUnlock').addEventListener('click', () => {
    if ($('#adminPin').value !== String(cfg.adminPin)) { $('#adminPin').value = ''; $('#adminPin').focus(); return; }
    $('#adminLock').hidden = true; $('#adminBody').hidden = false; renderStats();
  });
  $('#adminPin').addEventListener('keydown', e => { if (e.key === 'Enter') $('#adminUnlock').click(); });
  function renderStats() {
    const all = store.get(K.backup, []);
    const box = store.get(K.outbox, []);
    const lastErr = box.length ? esc(box[0].lastError || '') : '';
    $('#adminStats').innerHTML =
      `<div><b>${all.length}</b><span>Entries from this iPad</span></div>` +
      `<div><b>${all.filter(x => x.upload === 'saved').length}</b><span>Saved to database</span></div>` +
      `<div><b>${box.length}</b><span>Waiting to upload${lastErr ? ` (last error: ${lastErr})` : ''}</span></div>` +
      `<div><b>${deviceCode}</b><span>iPad code</span></div>`;
  }
  function csv() {
    const cols = ['entryId', 'submittedAt', 'firstName', 'lastName', 'phone', 'email', 'consentGiven', 'consentText', 'prizeId', 'upload'];
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [cols.join(','), ...store.get(K.backup, []).map(e => cols.map(c => q(e[c])).join(','))].join('\n');
  }
  $('#adminExport').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv()], { type: 'text/csv' }));
    a.download = `fhs-ipad-${deviceCode}-backup-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  });
  $('#adminRetry').addEventListener('click', async () => { await flushOutbox(); renderStats(); });
  $('#adminClear').addEventListener('click', () => {
    if (store.get(K.outbox, []).length && !confirm('Some entries have NOT uploaded yet. Erasing will lose them. Continue?')) return;
    if (!confirm("Erase this iPad's backup copy of entries? The database is not affected.")) return;
    store.set(K.backup, []); store.set(K.outbox, []); renderStats();
  });

  /* ---------------- Kiosk hardening + boot ---------------- */
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('contextmenu', e => e.preventDefault());
  $('#scheduleLabel').textContent = cfg.scheduleButtonText;
  $('#claimLabel').textContent = cfg.claimButtonText;
  renderQR();
  resetKiosk();
  flushOutbox();
})();
