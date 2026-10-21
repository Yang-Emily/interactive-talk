/* ============================================================
   Minimal offline slide engine with scripted "beats".

   Slides:   <section class="slide" data-title="...">
   Beats:    (a) static: elements with class "beat" appear in DOM order
             (b) scripted: Deck.demo(id, {beats:[fn...], reset:fn}) on a
                 section with data-demo="id". Each beat fn(ctx, instant).
                 Going backwards = reset() + replay beats instantly, so
                 every state is reproducible.
   Keys:     → / Space / PageDown  next beat (or next slide)
             ← / PageUp            previous beat (or previous slide)
             Shift+→ / Shift+←     skip whole slide
             Home / End            first / last slide
             R                     reset current demo to beat 0
             V                     toggle fallback image overlay
             S                     open speaker window
             F                     fullscreen
             Esc                   close fallback overlay
   URL:      #<slideIndex>/<beat>
   ============================================================ */
(function () {
  const Deck = {};
  const demos = {};          // id -> {beats, reset, ctx}
  let slides = [];
  let cur = 0;               // slide index
  let beat = 0;              // beats applied on current slide (0 = none)
  let channel = null;
  let t0 = null;
  // Separate talks served from the same origin must never share speaker traffic.
  const deckId = new URL('.', location.href).pathname;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- registration ---------- */
  Deck.demo = function (id, def) {
    const d = Object.assign({ beats: [], reset() {}, ctx: {} }, def);
    // Timer bookkeeping so a reset/back-step cancels in-flight animations.
    d.ctx._timers = [];
    d.ctx.later = (fn, ms) => { const id = setTimeout(fn, ms); d.ctx._timers.push(id); return id; };
    d.ctx.clearTimers = () => { d.ctx._timers.forEach(clearTimeout); d.ctx._timers = []; };
    demos[id] = d;
  };

  /* ---------- geometry ---------- */
  function fit() {
    const stage = $('#stage');
    const W = 1920, H = 1080;
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = `translate(-50%,-50%) scale(${s})`;
    stage.style.transformOrigin = '50% 50%';
    stage.style.left = '50%'; stage.style.top = '50%';
  }

  /* ---------- beats ---------- */
  function slideDemo(sec) { return sec.dataset.demo ? demos[sec.dataset.demo] : null; }
  function totalBeats(sec) {
    const d = slideDemo(sec);
    return d ? d.beats.length : $$('.beat', sec).length;
  }
  function applyState(sec, n, instant) {
    // Bring slide `sec` to state "n beats applied" deterministically.
    const d = slideDemo(sec);
    if (d) {
      d.ctx.section = sec;
      d.ctx.clearTimers();
      d.reset(d.ctx);
      for (let i = 0; i < n; i++) d.beats[i](d.ctx, true);
    } else {
      $$('.beat', sec).forEach((el, i) => el.classList.toggle('on', i < n));
    }
  }
  function stepForward() {
    const sec = slides[cur];
    const d = slideDemo(sec);
    if (beat < totalBeats(sec)) {
      if (d) { d.ctx.section = sec; d.beats[beat](d.ctx, false); }
      else $$('.beat', sec)[beat].classList.add('on');
      beat++;
      sync();
      return true;
    }
    return false;
  }
  function stepBack() {
    if (beat > 0) { beat--; applyState(slides[cur], beat, true); sync(); return true; }
    return false;
  }

  /* ---------- navigation ---------- */
  function goto(i, n = 0) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    hideToc();
    const prev = slides[cur];
    if (prev && prev !== slides[i]) {
      prev.classList.remove('active');
      const pd = slideDemo(prev);
      if (pd) pd.ctx.clearTimers();     // stop in-flight animations of the slide we leave
      if (pd && pd.leave) pd.leave(pd.ctx);
    }
    cur = i; beat = Math.min(n, totalBeats(slides[cur]));
    slides[cur].classList.add('active');
    applyState(slides[cur], beat, true);
    const d = slideDemo(slides[cur]);
    if (d && d.enter) d.enter(d.ctx);
    hideFallback();
    sync();
  }
  function next() { if (!stepForward()) goto(cur + 1, 0); }
  function prev() { if (!stepBack()) { if (cur > 0) goto(cur - 1, totalBeats(slides[cur - 1])); } }
  function resetDemo() { beat = 0; applyState(slides[cur], 0, true); sync(); }

  /* ---------- fallback overlay ---------- */
  function toggleFallback() {
    const fb = $('#fallback');
    if (fb.classList.contains('on')) return hideFallback();
    const sec = slides[cur];
    const src = sec.dataset.fallback || (sec.dataset.demo ? `fallback/${sec.dataset.demo}.png` : null);
    if (!src) return;
    $('img', fb).src = src;
    fb.classList.add('on');
  }
  function hideFallback() { $('#fallback').classList.remove('on'); }

  /* ---------- table of contents (click the page number) ---------- */
  function buildToc() {
    const toc = $('#toc'); if (!toc) return;
    toc.innerHTML = '<div class="tocbox"><div class="tochead">Contents <span class="hint">click to jump · Esc to close</span></div><ol></ol></div>';
    const ol = $('ol', toc);
    slides.forEach((s, i) => {
      const li = document.createElement('li');
      const tb = totalBeats(s);
      li.innerHTML = `<span class="n">${i + 1}</span><span class="t">${s.dataset.title || ('Slide ' + (i + 1))}</span><span class="b">${tb ? tb + ' beats' : ''}</span>`;
      li.addEventListener('click', (e) => { e.stopPropagation(); hideToc(); goto(i, 0); });
      ol.appendChild(li);
    });
    toc.addEventListener('click', (e) => { if (e.target === toc) hideToc(); });
  }
  function toggleToc() { const toc = $('#toc'); if (!toc) return; toc.classList.contains('on') ? hideToc() : showToc(); }
  function showToc() { const toc = $('#toc'); toc.classList.add('on'); $$('li', toc).forEach((li, i) => li.classList.toggle('cur', i === cur)); const c = $('li.cur', toc); if (c) c.scrollIntoView({ block: 'nearest' }); }
  function hideToc() { const toc = $('#toc'); if (toc) toc.classList.remove('on'); }

  /* ---------- hud / hash / speaker sync ---------- */
  function sync() {
    const sec = slides[cur];
    const tb = totalBeats(sec);
    // page number counts slides only; steps (animations) within a slide don't change it
    $('#hud').innerHTML = `<span class="pg"><b>${cur + 1}</b><span class="of">/ ${slides.length}</span></span>`;
    $('#progress').style.width = (100 * (cur + 1) / slides.length) + '%';
    history.replaceState(null, '', `#${cur}/${beat}`);
    // a deck can draw its own page indicator from this
    document.dispatchEvent(new CustomEvent('deck:sync', { detail: { cur, beat, total: slides.length, beats: tb } }));
    if (channel) channel.postMessage(state());
  }
  // each open deck tab has its own id, so a speaker window follows only the tab that opened it
  const inst = Math.random().toString(36).slice(2, 10);
  function state() {
    const sec = slides[cur];
    const notes = $('aside.notes', sec);
    const nextSec = slides[cur + 1];
    return {
      type: 'state', deckId, inst, cur, beat, total: slides.length, beats: totalBeats(sec),
      title: sec.dataset.title || sec.querySelector('h1,h2,h3')?.textContent || '',
      nextTitle: nextSec ? (nextSec.dataset.title || nextSec.querySelector('h1,h2,h3')?.textContent || '') : '— end —',
      notes: notes ? notes.innerHTML : '',
      version: document.querySelector('meta[name="deck-version"]')?.content || '',
      expStart: slides.slice(0, cur).reduce((a, x) => a + (+x.dataset.min || 0), 0),   // minutes
      expDur: +sec.dataset.min || 0,
      expTotal: slides.reduce((a, x) => a + (+x.dataset.min || 0), 0),
      qaMinutes: +document.querySelector('meta[name="qa-minutes"]')?.content || 0,
      t0
    };
  }
  function openSpeaker() {
    window.open('speaker.html?v=96&inst=' + inst, 'speaker-' + encodeURIComponent(deckId), 'width=1100,height=760');
    if (!t0) t0 = Date.now();
    setTimeout(sync, 300);
  }

  /* ---------- keys ---------- */
  function onKey(e) {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === ' ' || k === 'PageDown') { e.preventDefault(); e.shiftKey ? goto(cur + 1) : next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); e.shiftKey ? goto(cur - 1) : prev(); }
    else if (k === 'Home') goto(0);
    else if (k === 'End') goto(slides.length - 1);
    else if (k === 'r' || k === 'R') resetDemo();
    else if (k === 'v' || k === 'V') toggleFallback();
    else if (k === 's' || k === 'S') openSpeaker();
    else if (k === 'f' || k === 'F') document.documentElement.requestFullscreen?.();
    else if (k === 'Escape') { hideFallback(); hideToc(); }
    else if (k === 'g' || k === 'G') toggleToc();
    else if (k === 't' || k === 'T') { t0 = Date.now(); sync(); }
  }

  /* ---------- boot ---------- */
  function boot() {
    slides = $$('section.slide:not([data-skip])');   // data-skip leaves a slide out of the talk without deleting it
    fit(); window.addEventListener('resize', fit);
    document.addEventListener('keydown', onKey);
    buildToc(); $('#hud').addEventListener('click', toggleToc);
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('deck:' + deckId);
      channel.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'cmd' && m.deckId === deckId && (!m.inst || m.inst === inst)) {
          if (m.cmd === 'next') next(); else if (m.cmd === 'prev') prev();
          else if (m.cmd === 'reset') resetDemo(); else if (m.cmd === 'hello') sync();
          else if (m.cmd === 'timer') { t0 = Date.now(); sync(); }
        }
      };
    }
    const m = location.hash.match(/#(\d+)(?:\/(\d+))?/);
    goto(m ? +m[1] : 0, m ? +(m[2] || 0) : 0);
    if (matchMedia('print').matches) slides.forEach(s => applyState(s, totalBeats(s), true));
    window.addEventListener('beforeprint', () => slides.forEach(s => applyState(s, totalBeats(s), true)));
  }

  Deck.next = next; Deck.prev = prev; Deck.goto = goto; Deck.reset = resetDemo;
  Deck.state = () => ({ cur, beat });
  Deck.beatsOf = (i) => totalBeats(slides[i]);
  window.Deck = Deck;
  document.addEventListener('DOMContentLoaded', boot);
})();

/* ---------- small helpers shared by demos ---------- */
window.DemoUtil = {
  // Type text into el over `ms`; instant => immediate. Returns a cancel fn.
  type(el, text, ms, instant, done) {
    if (instant || ms <= 0) { el.textContent = text; done && done(); return () => {}; }
    el.textContent = '';
    const n = text.length; let i = 0; const step = Math.max(8, ms / n); let id;
    const tick = () => { i = Math.min(n, i + Math.ceil(n * 16 / ms)); el.textContent = text.slice(0, i); if (i < n) id = setTimeout(tick, 16); else done && done(); };
    id = setTimeout(tick, step);
    return () => clearTimeout(id);
  },
  // Run fns one after another with delays: seq([[fn, delayAfter], ...], instant)
  seq(steps, instant) {
    let t = 0; const ids = [];
    for (const [fn, d] of steps) {
      if (instant) fn(true); else ids.push(setTimeout(() => fn(false), t));
      t += d || 0;
    }
    return () => ids.forEach(clearTimeout);
  },
  el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
};
