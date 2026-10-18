/* SketchMind talk — position bar and contents panel.
   Only lettered feature pages show dots: one each for a–d. Numbered sections have none.
   The contents panel groups slides by their section marker (01–06); the lettered features (a–d)
   sit inside the section before them (02 SketchMind). Each slide is listed by its own title. */
(function () {
  const GROUP_NAMES = { d: 'Counterexamples', '05': 'User study' };   // where a section's slides use several labels
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
    const where = s ? `<b>${s.mark}</b>${esc(s.name)}` : g && g.mark ? `<b>${g.mark}</b>${esc(g.name)}` : '';
    const dots = s ? `<span class="segs">${
      g.subs.map((x) => `<i class="${x === s ? 'now' : x.items[0] < cur ? 'done' : ''}" title="${x.mark} ${esc(x.name)}"></i>`).join('')
    }</span>` : '';
    hud.innerHTML = `<span class="where">${where}</span>${dots}<span class="pg"><b>${cur + 1}</b><span class="of">/ ${total}</span></span>`;
  }
  document.addEventListener('deck:sync', (e) => renderHud(e.detail));

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
    const li = (i) => `<li data-i="${i}"><span class="n">${i + 1}</span><span class="t">${esc(title(slides[i]))}</span></li>`;
    const own = (g) => g.items.filter((i) => !g.subs.some((s) => s.items.includes(i)));
    toc.innerHTML = `<div class="tocbox sm"><div class="tochead">Contents <span class="hint">click to jump · Esc to close</span></div><div class="tgrid">${
      groups.map((g) => `<div class="tg">${g.mark ? `<div class="gh"><b>${g.mark}</b>${esc(g.name)}</div>` : ''}<ol>${own(g).map(li).join('')}</ol>${
        g.subs.map((s) => `<div class="ts"><div class="sh"><b>${s.mark}</b>${esc(s.name)}</div><ol>${s.items.map(li).join('')}</ol></div>`).join('')
      }</div>`).join('')
    }</div></div>`;
    toc.querySelectorAll('li').forEach((el) => el.addEventListener('click', (e) => {
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
