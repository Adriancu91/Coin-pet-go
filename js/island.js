'use strict';
/* ============================================================================
   ISLAND — Coin-Master-style village: 5 buildings × 4 stars per island,
   completed islands unlock the next one. Owned pets wander around animated.
   ========================================================================== */
const Island = {
  walkers: [],          // { id, stars, el, x, y }
  wanderTimer: null,
  petSig: '',

  theme(n = S().island.level) {
    const base = DATA.ISLANDS[(n - 1) % DATA.ISLANDS.length];
    const cycle = Math.floor((n - 1) / DATA.ISLANDS.length);
    return { ...base, title: base.name + (cycle ? ' ' + Utils.roman(cycle + 1) : '') };
  },
  nameFor(n) { return this.theme(n).title; },

  /** Gold cost for upgrading building b from level lvl → lvl+1 on island n */
  cost(b, lvl, n = S().island.level) {
    return Math.round((400 * Math.pow(n, 1.35) * (1 + b * 0.25) * (lvl + 1)) / 10) * 10;
  },
  starsBuilt() { return S().island.buildings.reduce((s, l) => s + l, 0); },
  starsTotal() { return DATA.ISLANDS[0].buildings.length * CONFIG.BUILDING_MAX; },
  complete() { return S().island.buildings.every(l => l >= CONFIG.BUILDING_MAX); },
  completionReward(n = S().island.level) { return { energy: 100 * n, gold: 2000 * n }; },

  upgrade(b) {
    const st = S(); const lvl = st.island.buildings[b];
    if (lvl >= CONFIG.BUILDING_MAX) return;
    const price = this.cost(b, lvl);
    if (st.gold < price) { UI.toast(`Need ${Utils.fmt(price)} 🪙 — spin or raid for more Gold!`, 'red'); return; }
    st.gold -= price;
    st.island.buildings[b] = lvl + 1;
    const [ico, name] = this.theme().buildings[b];
    Social.log('🔨', `${lvl === 0 ? 'Built' : 'Upgraded'} ${name} to ${lvl + 1}★ (-${Utils.fmt(price)} Gold)`);
    UI.toast(`${ico} ${name} ${'★'.repeat(lvl + 1)}`, 'gold');
    Store.save();
    this.renderBuildings(b);
    UI.renderIslandPanel(); UI.renderTop();
    if (this.complete()) setTimeout(() => UI.showIslandComplete(), 900);
  },

  /** Collect the island reward and sail to the next island */
  travel() {
    if (!this.complete()) return;
    const st = S(); const r = this.completionReward();
    Energy.add(r.energy); st.gold += r.gold;
    Social.log('⛵', `Completed ${this.nameFor(st.island.level)} (+${r.energy}⚡ +${Utils.fmt(r.gold)} Gold)`);
    st.island.level++;
    st.island.buildings = [0, 0, 0, 0, 0];
    UI.toast(`⛵ Welcome to ${this.nameFor(st.island.level)}!`, 'green');
    UI.confetti();
    Store.save();
    this.renderScene(true);
    UI.renderIslandPanel(); UI.renderTop();
  },

  /* ------------------------------ SCENE ------------------------------ */
  renderScene(force = false) {
    const scene = UI.el('scene'); if (!scene) return;
    const th = this.theme();
    if (force || !scene.dataset.level || +scene.dataset.level !== S().island.level) {
      scene.dataset.level = S().island.level;
      scene.innerHTML = `
        <span class="cloud" style="top:4%;animation-duration:38s;animation-delay:-8s">☁️</span>
        <span class="cloud" style="top:14%;font-size:24px;animation-duration:55s;animation-delay:-30s">☁️</span>
        <div class="isle" id="isle" style="--sand1:${th.sand[0]};--sand2:${th.sand[1]};--grass1:${th.grass[0]};--grass2:${th.grass[1]}">
          <div class="isle-foam"></div><div class="isle-sand"></div><div class="isle-grass"></div>
          ${DATA.DECO_SPOTS.map(([x, y], i) => `<span class="deco" style="left:${x}%;top:${y}%">${th.deco[i % th.deco.length]}</span>`).join('')}
          <div id="buildLayer"></div>
          <div id="petLayer"></div>
        </div>
        <div class="absolute left-3 top-3 z-10 bg-white/85 rounded-2xl px-3 py-1 shadow">
          <div class="text-[10px] font-bold text-slate-500 leading-none">ISLAND ${S().island.level}</div>
          <div class="font-extrabold text-sky-800 leading-tight">${Utils.esc(th.title)}</div>
        </div>`;
      this.petSig = '';
      this.renderBuildings();
    }
    this.renderPets();
  },

  renderBuildings(popIdx = -1) {
    const layer = UI.el('buildLayer'); if (!layer) return;
    const th = this.theme();
    layer.innerHTML = th.buildings.map(([ico, name], b) => {
      const lvl = S().island.buildings[b];
      const [x, y] = DATA.BUILDING_SPOTS[b];
      return `<div class="bld ${lvl ? '' : 'empty'} ${b === popIdx ? 'built-pop' : ''}" style="left:${x}%;top:${y}%;font-size:${28 + lvl * 7}px" data-bld="${b}">
        <span class="ico">${lvl ? ico : '🚧'}</span>
        <span class="lvl">${lvl ? '★'.repeat(lvl) : 'build'}</span></div>`;
    }).join('');
    if (popIdx >= 0) {
      const [x, y] = DATA.BUILDING_SPOTS[popIdx];
      ['💨', '✨', '💨'].forEach((d, i) => {
        const s = document.createElement('span');
        s.className = 'dust'; s.textContent = d;
        s.style.left = `calc(${x}% + ${(i - 1) * 22}px)`; s.style.top = `calc(${y}% - 20px)`;
        UI.el('isle').appendChild(s); setTimeout(() => s.remove(), 1000);
      });
    }
  },

  /** Random point on the grass (percent of the island box) */
  randomPoint(nearX, nearY) {
    for (let i = 0; i < 20; i++) {
      let x, y;
      if (nearX == null) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.92; x = 50 + Math.cos(a) * r * 38; y = 54 + Math.sin(a) * r * 30; }
      else { x = nearX + Utils.rand(-16, 16); y = nearY + Utils.rand(-12, 12); }
      const dx = (x - 50) / 38, dy = (y - 54) / 30;
      if (dx * dx + dy * dy <= 0.85) return [x, y];
    }
    return [50, 54];
  },

  renderPets() {
    const layer = UI.el('petLayer'); if (!layer) return;
    const pets = Collection.activePets(CONFIG.ISLAND_PETS);
    const sig = pets.map(p => `${p.id}:${p.stars}`).join(',');
    if (sig === this.petSig) return;
    this.petSig = sig;
    const old = new Map(this.walkers.map(w => [w.id, w]));
    this.walkers = pets.map(p => {
      const prev = old.get(p.id);
      const [x, y] = prev ? [prev.x, prev.y] : this.randomPoint();
      return { id: p.id, stars: p.stars, x, y };
    });
    layer.innerHTML = this.walkers.length ? this.walkers.map(w => {
      const c = CREATURES[w.id];
      return `<div class="walker t${w.stars}" style="left:${w.x}%;top:${w.y}%" data-walker="${w.id}">
        <span class="shadow"></span><span class="tag">${'★'.repeat(w.stars)}</span>
        <span class="body"><span class="face">${c.emoji}</span></span></div>`;
    }).join('')
      : `<div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/85 rounded-2xl px-3 py-2 text-xs font-bold text-slate-600 text-center z-10">No pets yet!<br>Hatch eggs in the Shop 🥚</div>`;
    this.walkers.forEach(w => { w.el = layer.querySelector(`[data-walker="${w.id}"]`); });
  },

  /** Wander loop: each pet sometimes walks to a nearby spot */
  wander() {
    for (const w of this.walkers) {
      if (!w.el || Math.random() > 0.4 || w.el.classList.contains('moving')) continue;
      const [nx, ny] = this.randomPoint(w.x, w.y);
      w.el.classList.toggle('flip', nx > w.x);
      w.el.classList.add('moving');
      w.x = nx; w.y = ny;
      w.el.style.left = nx + '%'; w.el.style.top = ny + '%';
      w.el.style.zIndex = 4 + Math.round(ny);   // pets lower on screen stand in front
      const el = w.el; setTimeout(() => el.classList.remove('moving'), 2800);
    }
  },

  start() {
    this.renderScene();
    if (!this.wanderTimer) this.wanderTimer = setInterval(() => this.wander(), 1400);
    setTimeout(() => this.wander(), 200);
  },
  stop() { clearInterval(this.wanderTimer); this.wanderTimer = null; },

  /** Tap a pet: it jumps, shows a heart and its name */
  tapPet(id) {
    const w = this.walkers.find(x => x.id === id); if (!w?.el) return;
    w.el.classList.remove('jump'); void w.el.offsetWidth; w.el.classList.add('jump');
    const isle = UI.el('isle');
    const heart = document.createElement('span');
    heart.className = 'heart'; heart.textContent = Utils.pick(['❤️', '💖', '✨', '🎵']);
    heart.style.left = `calc(${w.x}% - 6px)`; heart.style.top = `calc(${w.y}% - 50px)`;
    isle.appendChild(heart); setTimeout(() => heart.remove(), 1100);
    const b = document.createElement('div');
    b.className = 'bubble'; b.textContent = `${CREATURES[id].name} ${'★'.repeat(w.stars)}`;
    b.style.left = w.x + '%'; b.style.top = `calc(${w.y}% - 40px)`;
    isle.appendChild(b); setTimeout(() => b.remove(), 1400);
  },
};
