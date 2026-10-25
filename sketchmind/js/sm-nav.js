/* SketchMind talk — position bar and contents panel.
   Only lettered feature pages show dots: one each for a–d. Numbered sections have none.
   The contents panel groups slides by their section marker (01–06); the lettered features (a–d)
   sit inside the section before them (02 SketchMind). Each slide is listed by its own title. */
(function () {
  const GROUP_NAMES = { d: 'Counterexamples', '05': 'User study', Backup: 'slides' };   // where a section's slides use several labels
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const isSub = (mark) => /^[a-z]$/.test(mark);

  // Current section/feature, optional a–d progress, and the page number.
  let groupsCache = null;
  function renderHud({ cur, total }) {
    const hud = document.getElementById('hud');
    if (!hud) return;
    const groups = groupsCache || (groupsCache = sections());
    const g = groups.find((x) => x.items.includes(cur));
    const s = g && g.subs.find((x) => x.items.includes(cur));
    // on a feature slide (a–d) show just the feature, not its parent section
    // a slide's data-hud replaces a feature's name, or follows a section's name
    const all = document.querySelectorAll('section.slide:not([data-skip])');
    const sub = all[cur]?.dataset.hud;
    // a feature's slides that carry data-hud become steps (d.1, d.2, …) with one dot per step
    const stepItems = s ? s.items.filter((i) => all[i].dataset.hud) : [];
    const k = stepItems.indexOf(cur), steps = stepItems.length > 1 && k >= 0;
    // likewise a numbered section whose slides all carry data-hud is split into a, b, …
    const parts = !s && g && g.mark && !isSub(g.mark) && g.items.length > 1 && g.items.every((i) => all[i].dataset.hud);
    const p = parts ? g.items.indexOf(cur) : -1;
    const where = s ? `<b>${s.mark}${steps ? '.' + (k + 1) : ''}</b>${esc(sub || s.name)}`
      : parts ? `<b>${String.fromCharCode(97 + p)}</b>${esc(sub)}`
      : g && g.mark ? `<b>${g.mark}</b>${esc(g.name)}${sub ? ` · ${esc(sub)}` : ''}` : '';
    const dots = parts ? `<span class="segs">${
      g.items.map((i, j) => `<i class="${j === p ? 'now' : j < p ? 'done' : ''}" title="${String.fromCharCode(97 + j)} ${esc(all[i].dataset.hud)}"></i>`).join('')
    }</span>` : steps ? `<span class="segs">${
      stepItems.map((i, j) => `<i class="${j === k ? 'now' : j < k ? 'done' : ''}" title="${s.mark}.${j + 1} ${esc(all[i].dataset.hud)}"></i>`).join('')
    }</span>` : s ? `<span class="segs">${
      g.subs.map((x) => `<i class="${x === s ? 'now' : x.items[0] < cur ? 'done' : ''}" title="${x.mark} ${esc(x.name)}"></i>`).join('')
    }</span>` : '';
    // backup slides (data-backup) are not counted: the main talk is numbered 1..N, backups show no number
    const firstBackup = [...all].findIndex((x) => x.hasAttribute('data-backup'));
    const mainTotal = firstBackup < 0 ? total : firstBackup;
    const pg = cur < mainTotal ? `<span class="pg"><b>${cur + 1}</b><span class="of">/ ${mainTotal}</span></span>` : '';
    hud.innerHTML = `<span class="where">${where}</span>${dots}${pg}`;
  }
  document.addEventListener('deck:sync', (e) => renderHud(e.detail));

  // play-once GIFs (img[data-once]) restart from the first frame each time they come into view:
  // when their slide is entered, or when the click step (.beat) holding them is revealed
  let lastCur = -1;
  document.addEventListener('deck:sync', (e) => {
    const { cur } = e.detail;
    const sec = document.querySelectorAll('section.slide:not([data-skip])')[cur];
    if (!sec) return;
    const entered = cur !== lastCur;
    lastCur = cur;
    sec.querySelectorAll('img[data-once]').forEach((img) => {
      const step = img.closest('.beat'), shown = !step || step.classList.contains('on');
      if (shown && (entered || !img.dataset.shown)) img.src = img.dataset.once + '?t=' + Date.now();
      if (shown) img.dataset.shown = '1'; else delete img.dataset.shown;
    });
  });

  function title(sec) {
    if (!sec.querySelector('.sec')) return sec.dataset.title || '';
    const h = sec.querySelector('h2, h1');
    if (!h) return sec.dataset.title || '';
    const c = h.cloneNode(true);
    c.querySelectorAll('.sub, .tag').forEach((x) => x.remove());
    return c.textContent.trim().replace(/\.$/, '');
  }

  // [{ mark, name, items, subs: [{ mark, name, items }] }]; a group's items include its subs' items
  function sections() {
    const groups = [];
    document.querySelectorAll('section.slide:not([data-skip])').forEach((sec, i) => {
      const lab = sec.querySelector('.sec');
      const mark = lab ? lab.querySelector('b').textContent.trim() : '';
      const name = lab ? (GROUP_NAMES[mark] || lab.textContent.replace(mark, '').trim()) : '';
      let g = groups[groups.length - 1];
      if (isSub(mark) && g && g.mark) {
        let s = g.subs[g.subs.length - 1];
        if (!s || s.mark !== mark) g.subs.push(s = { mark, name, items: [] });
        s.items.push(i);
      } else if (!g || g.mark !== mark || g.subs.length) {
        groups.push(g = { mark, name, items: [], subs: [] });
      }
      g.items.push(i);
    });
    return groups;
  }

  function buildToc() {
    const toc = document.getElementById('toc');
    if (!toc) return;
    const slides = [...document.querySelectorAll('section.slide:not([data-skip])')];
    const groups = sections();
    // backup slides get no number; a group that starts with the backup divider uses it as its clickable heading
    const li = (i) => `<li data-i="${i}"><span class="n">${slides[i].hasAttribute('data-backup') ? '' : i + 1}</span><span class="t">${esc(title(slides[i]))}</span></li>`;
    const head = (g) => (slides[g.items[0]].classList.contains('bkdiv') ? g.items[0] : -1);
    const own = (g) => g.items.filter((i) => i !== head(g) && !g.subs.some((s) => s.items.includes(i)));
    toc.innerHTML = `<div class="tocbox sm"><div class="tochead">Contents <span class="hint">click to jump · Esc to close</span></div><div class="tgrid">${
      groups.map((g) => `<div class="tg">${g.mark ? `<div class="gh${head(g) >= 0 ? ' go' : ''}"${head(g) >= 0 ? ` data-i="${head(g)}"` : ''}><b>${g.mark}</b>${esc(g.name)}</div>` : ''}<ol>${own(g).map(li).join('')}</ol>${
        g.subs.map((s) => `<div class="ts"><div class="sh"><b>${s.mark}</b>${esc(s.name)}</div><ol>${s.items.map(li).join('')}</ol></div>`).join('')
      }</div>`).join('')
    }</div></div>`;
    toc.querySelectorAll('li, .gh.go').forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation();
      toc.classList.remove('on');
      Deck.goto(+el.dataset.i, 0);
    }));
  }
  // Render the initial position explicitly as well as on later navigation.
  // This also supports loading the navigation after the deck has already booted.
  function initialize() {
    const state = window.Deck?.state();
    if (state) renderHud({ ...state, total: document.querySelectorAll('section.slide:not([data-skip])').length });
    setTimeout(buildToc, 0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
