'use strict';
/* ============================================================================
   UI — rendering, tabs, modals, toasts, event wiring
   ========================================================================== */
const UI = {
  activeTab: 'island',
  selectedStack: null,

  el: id => document.getElementById(id),

  /* ---------- Toasts / effects ---------- */
  toast(msg, color = 'blue') {
    const colors = { blue: 'bg-sky-600', green: 'bg-emerald-600', red: 'bg-rose-600', gold: 'bg-amber-500', pink: 'bg-pink-500' };
    const t = document.createElement('div');
    t.className = `toast ${colors[color] || colors.blue} text-white font-bold text-sm px-4 py-2 rounded-2xl shadow-lg max-w-sm text-center`;
    t.textContent = msg;
    const box = this.el('toasts');
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => t.remove(), 3000);
  },
  confetti() {
    const colors = ['#facc15', '#f472b6', '#22d3ee', '#a3e635', '#fb923c', '#a855f7'];
    for (let i = 0; i < 40; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = Utils.pick(colors);
      c.style.animationDelay = Math.random() * 0.5 + 's';
      c.style.animationDuration = 1.4 + Math.random() + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2600);
    }
  },

  /* ---------- Modal ---------- */
  showModal(html, locked = false) {
    const body = this.el('modalBody');
    body.innerHTML = html;
    const m = this.el('modal'); m.dataset.locked = locked ? '1' : '';
    m.classList.remove('hidden'); m.classList.add('flex');
    body.classList.remove('sheet'); void body.offsetWidth; body.classList.add('sheet');
  },
  closeModal() { const m = this.el('modal'); m.classList.add('hidden'); m.classList.remove('flex'); },

  /* ---------- Creature card (tier visuals) ---------- */
  card(id, stars, { count = 0, locked = false, faded = false, selected = false, attrs = '' } = {}) {
    const c = CREATURES[id]; const el = DATA.ELEMENTS[c.element];
    const tier = Math.max(1, stars);
    const particles = tier >= 5
      ? Array.from({ length: 7 }, (_, i) => `<span class="pt" style="left:${8 + i * 13}%;animation-delay:${(i * 0.37).toFixed(2)}s"></span>`).join('') : '';
    return `<div class="ccard tier-${locked ? 1 : tier} ${locked ? 'locked' : ''} ${faded ? 'faded' : ''} ${selected ? 'selected' : ''}" ${attrs}>
      <div class="ccard-in" style="--c1:${el.c1};--c2:${el.c2}">
        ${locked ? '' : particles}
        <div class="elem">${el.icon}</div>
        ${count > 1 ? `<div class="cnt">x${count}</div>` : ''}
        <div class="emo">${locked ? '❔' : c.emoji}</div>
        <div class="nm">${locked ? '???' : c.name}</div>
        <div class="stars">${locked || !stars ? '&nbsp;' : '★'.repeat(stars)}</div>
      </div></div>`;
  },

  /* ---------- Tabs ---------- */
  switchTab(name) {
    this.activeTab = name;
    document.querySelectorAll('[data-tab]').forEach(s => s.classList.toggle('hidden-tab', s.dataset.tab !== name));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.target === name));
    window.scrollTo({ top: 0 });
    if (name === 'island') Island.start(); else Island.stop();
    if (name === 'social' && Net.online) Net.refreshSocial().then(() => this.renderSocial());
    this.renderAll();
  },

  /* ---------- Top bar ---------- */
  renderTop() {
    const st = S(); const now = Date.now();
    this.el('goldText').textContent = Utils.fmt(st.gold);
    this.el('energyText').textContent = `${Utils.fmt(st.energy)} / ${Utils.fmt(CONFIG.MAX_ENERGY)}`;
    const fill = this.el('energyFill');
    fill.style.width = Math.min(100, (st.energy / CONFIG.MAX_ENERGY) * 100) + '%';
    fill.classList.toggle('over', st.energy > CONFIG.MAX_ENERGY);
    this.el('regenText').textContent = st.energy >= CONFIG.MAX_ENERGY ? 'FULL' : `+${CONFIG.REGEN_AMOUNT} in ${Utils.time(Energy.msToNext(now))}`;
    this.el('netBadge').innerHTML = Net.online
      ? `<span class="online-dot bg-emerald-500"></span> ${Utils.esc(Net.profile?.nickname)}`
      : `<span class="online-dot bg-slate-400"></span> Offline`;
    const giftReady = Net.online && Net.friends.some(f => !f.last_sent || now - new Date(f.last_sent) >= CONFIG.GIFT_COOLDOWN_MS);
    this.el('socialDot').classList.toggle('hidden', !(now >= st.shareReadyAt || giftReady || (Net.online && !Net.tombola?.entered)));
  },

  /* ---------- Slot tab ---------- */
  renderSlot() {
    const st = S();
    this.el('betBtns').innerHTML = CONFIG.BETS.map(b =>
      `<button class="btn !py-1 !px-3 text-sm ${st.bet === b ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-700'}" data-bet="${b}">x${b}</button>`).join('');
    this.el('spinCost').textContent = `(-${CONFIG.SPIN_COST * st.bet}⚡)`;
    this.renderRaidLog();
  },
  renderRaidLog() {
    const raids = S().raids;
    this.el('raidLog').innerHTML = raids.length
      ? raids.map(r => r.dir === 'in'
        ? `<div class="flex justify-between gap-2 bg-rose-50 rounded-xl px-2 py-1"><span class="truncate">🛡️ <b>${Utils.esc(r.name)}</b> raided you</span><b class="text-rose-600 whitespace-nowrap">-${Utils.fmt(r.stolen)}🪙</b></div>`
        : `<div class="flex justify-between gap-2 bg-sky-50 rounded-xl px-2 py-1"><span class="truncate">⚔️ ${Utils.esc(r.name)}${r.capText ? ` · <b class="text-violet-600">${r.capText}</b>` : ''}</span><b class="text-amber-600 whitespace-nowrap">+${Utils.fmt(r.stolen)}🪙</b></div>`).join('')
      : `<div class="text-slate-400 text-sm">No raids yet — hit ⚔️⚔️⚔️ to raid a real player's island!</div>`;
  },
  setSpinEnabled(on) { this.el('spinBtn').disabled = !on; },

  async animateReels(finalSyms) {
    const reels = [...document.querySelectorAll('#reels .reel')];
    reels.forEach(r => { r.classList.remove('stop', 'slot-win'); r.classList.add('spinning'); });
    const timer = setInterval(() => reels.forEach(r => {
      if (r.classList.contains('spinning')) r.querySelector('.sym').textContent = Utils.pick(DATA.SLOT_SYMBOLS);
    }), 70);
    for (let i = 0; i < reels.length; i++) {
      await Utils.sleep(i === 0 ? 650 : 330);
      reels[i].classList.remove('spinning');
      reels[i].querySelector('.sym').textContent = finalSyms[i];
      void reels[i].offsetWidth; reels[i].classList.add('stop');
    }
    clearInterval(timer);
    await Utils.sleep(250);
  },
  flashReels() { document.querySelectorAll('#reels .reel').forEach(r => { r.classList.remove('slot-win'); void r.offsetWidth; r.classList.add('slot-win'); }); },

  showRaid(opp, stolen, capture) {
    const petsHtml = opp.pets.length ? opp.pets.map(p => this.card(p.id, p.stars)).join('') : '<div class="col-span-3 text-sm text-slate-400 py-4">No pets defending this island</div>';
    this.showModal(`
      <div class="text-center">
        <div class="text-xs font-bold text-slate-500">RAIDING A REAL PLAYER</div>
        <div class="text-xl font-extrabold text-sky-800">🏝️ ${Utils.esc(opp.owner)}'s ${Utils.esc(opp.island)}</div>
        <div class="text-sm text-slate-500">Island treasury: 🪙 ${Utils.fmt(opp.gold || 0)}</div>
        <div class="grid grid-cols-3 gap-2 my-3">${petsHtml}</div>
        <div id="raidAnim" class="text-5xl my-2 egg shake">⚔️</div>
        <div id="raidRes" class="font-bold text-slate-500">Attacking...</div>
        <button class="btn w-full mt-3 bg-sky-600 text-white" data-close>Collect</button>
      </div>`);
    setTimeout(() => {
      const anim = this.el('raidAnim'); if (!anim) return;
      anim.classList.remove('shake'); anim.textContent = '💰'; anim.classList.add('pop-in');
      let capHtml = '<div class="text-slate-500 text-sm mt-1">No creature captured this time (5% chance).</div>';
      if (capture) {
        const c = CREATURES[capture.id];
        capHtml = capture.delevel
          ? `<div class="mt-2 text-violet-700 font-extrabold">🎯 CAPTURED ${c.emoji} ${c.name} ${capture.stars}★!</div>
             <div class="text-xs text-slate-600">Too powerful for your island — it de-levels into <b>THREE 1★ copies</b>!</div>
             <div class="grid grid-cols-3 gap-2 mt-2 pop-in">${this.card(capture.id, 1)}${this.card(capture.id, 1)}${this.card(capture.id, 1)}</div>`
          : `<div class="mt-2 text-violet-700 font-extrabold">🎯 CAPTURED ${c.emoji} ${c.name} ${capture.stars}★!</div>
             <div class="w-24 mx-auto mt-2 pop-in">${this.card(capture.id, capture.stars)}</div>`;
        this.confetti();
      }
      this.el('raidRes').innerHTML = `<div class="text-2xl font-extrabold text-amber-600">+${Utils.fmt(stolen)} Gold stolen!</div>${capHtml}`;
    }, 1100);
  },

  /* ---------- Island tab ---------- */
  renderIslandPanel() {
    const st = S(); const th = Island.theme();
    const built = Island.starsBuilt(), total = Island.starsTotal();
    this.el('islandTitle').textContent = `${th.title} · Island ${st.island.level}`;
    this.el('islandBar').style.width = (built / total * 100) + '%';
    this.el('islandProg').textContent = `${built}/${total} ★`;
    const r = Island.completionReward();
    this.el('islandReward').textContent = `Complete reward: +${r.energy}⚡ +${Utils.fmt(r.gold)}🪙 & a new island`;
    this.el('buildList').innerHTML = th.buildings.map(([ico, name], b) => {
      const lvl = st.island.buildings[b];
      const max = lvl >= CONFIG.BUILDING_MAX;
      const price = max ? 0 : Island.cost(b, lvl);
      return `<div class="flex items-center gap-2 bg-sky-50 rounded-2xl p-2">
        <div class="text-3xl w-11 text-center ${lvl ? '' : 'grayscale opacity-50'}">${ico}</div>
        <div class="flex-1 min-w-0"><div class="font-extrabold text-sm truncate">${name}</div>
          <div class="text-amber-500 text-sm tracking-tight">${'★'.repeat(lvl)}<span class="text-slate-300">${'★'.repeat(CONFIG.BUILDING_MAX - lvl)}</span></div></div>
        <button class="btn text-xs ${max ? 'bg-emerald-100 text-emerald-700' : 'bg-gradient-to-b from-amber-400 to-orange-500 text-white'}" data-upgrade="${b}" ${max || st.gold < price ? 'disabled' : ''}>
          ${max ? '✅ MAX' : `${lvl ? 'Upgrade' : 'Build'}<br>🪙 ${Utils.fmt(price)}`}</button>
      </div>`;
    }).join('');
    this.el('travelBtn').classList.toggle('hidden', !Island.complete());
  },

  showBuilding(b) {
    const [ico, name] = Island.theme().buildings[b];
    const lvl = S().island.buildings[b];
    const max = lvl >= CONFIG.BUILDING_MAX;
    const price = max ? 0 : Island.cost(b, lvl);
    this.showModal(`<div class="text-center">
      <div class="text-6xl ${lvl ? '' : 'grayscale opacity-50'}">${ico}</div>
      <div class="text-xl font-extrabold mt-1">${name}</div>
      <div class="text-amber-500 text-lg">${'★'.repeat(lvl)}<span class="text-slate-300">${'★'.repeat(CONFIG.BUILDING_MAX - lvl)}</span></div>
      <div class="flex gap-2 mt-3">
        <button class="btn flex-1 bg-slate-200 text-slate-700" data-close>Close</button>
        ${max ? '' : `<button class="btn flex-1 bg-gradient-to-b from-amber-400 to-orange-500 text-white" data-upgrade="${b}" data-close ${S().gold < price ? 'disabled' : ''}>${lvl ? 'Upgrade' : 'Build'} · 🪙${Utils.fmt(price)}</button>`}
      </div></div>`);
  },

  showIslandComplete() {
    const r = Island.completionReward();
    const next = Island.nameFor(S().island.level + 1);
    this.confetti();
    this.showModal(`<div class="text-center">
      <div class="text-6xl">🏝️</div>
      <div class="text-2xl font-extrabold text-sky-800 mt-1">Island complete!</div>
      <div class="text-sm text-slate-600">${Utils.esc(Island.theme().title)} is fully built.</div>
      <div class="text-lg font-extrabold text-emerald-600 mt-2">+${r.energy}⚡ +${Utils.fmt(r.gold)}🪙</div>
      <button class="btn w-full mt-3 bg-gradient-to-b from-sky-400 to-blue-600 text-white text-lg" id="travelNow">⛵ Sail to ${Utils.esc(next)}</button>
    </div>`, true);
  },

  /* ---------- Pets tab ---------- */
  renderPets() {
    const st = S();
    this.el('dexCount').textContent = Object.keys(st.discovered).length;
    this.el('avgTier').textContent = Collection.averageTier().toFixed(1);
    this.el('totalCreatures').textContent = Collection.total();

    this.el('setProgress').innerHTML = [1, 2, 3, 4, 5].map(t => {
      const p = Collection.setProgress(t), done = st.setClaims[t];
      return `<div class="rounded-xl p-1 text-center ${done ? 'bg-amber-300' : 'bg-sky-50'}">
        <div class="text-[10px] font-extrabold text-amber-600">${'★'.repeat(t)}</div>
        <div class="text-xs font-extrabold">${p}/50</div>
        <div class="text-[9px] text-slate-500">${done ? '✅ +' + t * 100 + '⚡' : `+${t * 100}⚡`}</div>
        ${t < 5 ? `<div class="lock-pill ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'} mt-0.5">${done ? '🔓 merge' : '🔒 merge'}</div>` : ''}</div>`;
    }).join('');

    // Next goal banner
    const nextT = [1, 2, 3, 4].find(t => !st.setClaims[t]);
    this.el('mergeRule').innerHTML = nextT
      ? `🔒 <b>${nextT}★ → ${nextT + 1}★ merging is locked</b> until you collect the full ${nextT}★ set (${Collection.setProgress(nextT)}/50). Keep every duplicate — you'll merge them after!`
      : '🔓 All merge tiers unlocked — you are a true Island Master!';

    const stacks = Collection.stacks();
    if (this.selectedStack && !st.inventory[this.selectedStack]) this.selectedStack = null;
    this.el('bagEmpty').classList.toggle('hidden', stacks.length > 0);
    this.el('bagGrid').innerHTML = stacks.map(s => {
      const k = Collection.key(s.id, s.stars);
      return this.card(s.id, s.stars, { count: s.count, selected: this.selectedStack === k, attrs: `data-stack="${k}"` });
    }).join('');
    const mergeable = stacks.filter(s => s.count >= 2 && s.stars < 5 && Collection.mergeUnlocked(s.stars)).length;
    this.el('autoMergeBtn').disabled = mergeable === 0;
    this.el('mergeHint').innerHTML = this.selectedStack
      ? (() => { const [id, t] = this.selectedStack.split(':').map(Number); const c = CREATURES[id];
          return Collection.mergeUnlocked(t)
            ? `Selected <b>${c.name} ${t}★</b>. Tap it again to merge → <b>${c.name} ${t + 1}★</b>.`
            : `Selected <b>${c.name} ${t}★</b> — 🔒 finish the ${t}★ set first (${Collection.setProgress(t)}/50).`; })()
      : `Tap a stack, then tap it again to merge 2 identical copies. ${mergeable ? `<b class="text-violet-600">${mergeable} stack(s) ready!</b>` : ''}`;

    this.el('habitats').innerHTML = Object.entries(DATA.ELEMENTS).map(([elName, el]) => {
      const list = CREATURES.filter(c => c.element === elName);
      const found = list.filter(c => st.discovered[c.id]).length;
      return `<div class="panel p-3">
        <div class="flex justify-between items-center mb-2">
          <div class="font-extrabold" style="color:${el.c2}">${el.icon} ${el.biome}</div>
          <div class="text-xs font-bold text-slate-500">${found}/10</div>
        </div>
        <div class="grid grid-cols-5 gap-2">${list.map(c => {
          const best = Collection.bestOwned(c.id); const disc = !!st.discovered[c.id];
          return this.card(c.id, best || st.maxStar[c.id] || 1, { locked: !disc, faded: disc && !best, count: Collection.totalOf(c.id), attrs: `data-dex="${c.id}"` });
        }).join('')}</div></div>`;
    }).join('');
  },

  onStackTap(k) {
    if (this.selectedStack === k) {
      const [id, stars] = k.split(':').map(Number);
      if (Collection.merge(id, stars)) {
        const c = CREATURES[id];
        this.toast(`✨ Merged! ${c.emoji} ${c.name} is now ${stars + 1}★`, 'gold');
        Social.log('✨', `Merged 2× ${c.name} ${stars}★ → ${stars + 1}★`);
        this.selectedStack = S().inventory[k] >= 2 ? k : null;
        Store.save();
        this.renderPets(); this.renderTop();
        document.querySelector(`[data-stack="${id}:${stars + 1}"]`)?.classList.add('merge-flash');
      }
    } else {
      this.selectedStack = k;
      this.renderPets();
    }
  },

  showDex(id) {
    const st = S(); const c = CREATURES[id];
    if (!st.discovered[id]) { this.toast('Not discovered yet — hatch eggs or raid to find it!', 'blue'); return; }
    const rows = [1, 2, 3, 4, 5].map(t => {
      const n = Collection.count(id, t);
      const unlocked = Collection.mergeUnlocked(t);
      return `<div class="flex items-center gap-2 bg-sky-50 rounded-2xl p-2">
        <div class="w-16 shrink-0">${this.card(id, t, { faded: !n })}</div>
        <div class="flex-1"><div class="font-extrabold">${t}★ · owned ${n}</div>
          <div class="text-[11px] text-slate-500">${DATA.TIER_NAMES[t - 1]}</div></div>
        ${t < 5 ? `<button class="btn text-xs ${unlocked ? 'bg-violet-500 text-white' : 'bg-slate-200 text-slate-500'}" data-dexmerge="${id}:${t}" ${n < 2 || !unlocked ? 'disabled' : ''}>${unlocked ? `Merge 2→${t + 1}★` : `🔒 ${t}★ set`}</button>` : ''}
      </div>`;
    }).join('');
    this.showModal(`
      <div class="flex justify-between items-center mb-2">
        <div class="text-xl font-extrabold">${c.emoji} ${c.name}</div>
        <div class="text-sm font-bold">${DATA.ELEMENTS[c.element].icon} ${c.element}</div>
      </div>
      <div class="space-y-2">${rows}</div>
      <button class="btn w-full mt-3 bg-slate-200 text-slate-700" data-close>Close</button>`);
  },

  /* ---------- Shop tab ---------- */
  renderShop() {
    const st = S();
    this.el('eggPrice').textContent = CONFIG.EGG_PRICE;
    this.el('eggsOpened').textContent = st.eggsOpened;
    this.el('buyEggBtn').disabled = st.gold < CONFIG.EGG_PRICE;
    this.el('pityBar').innerHTML = Array.from({ length: CONFIG.PITY_THRESHOLD }, (_, i) =>
      `<span class="w-8 h-3 rounded-full ${i < st.pity ? 'bg-rose-400' : 'bg-slate-200'}"></span>`).join('') +
      `<span class="w-8 h-3 rounded-full ${st.pity >= CONFIG.PITY_THRESHOLD ? 'bg-amber-400 animate-pulse' : 'bg-slate-200'}"></span>`;
    this.el('pityText').textContent = st.pity >= CONFIG.PITY_THRESHOLD
      ? '🌟 Next egg is 100% GUARANTEED to hatch!'
      : `${st.pity}/${CONFIG.PITY_THRESHOLD} empty in a row · 3 empties = guaranteed hatch`;
    const d = Shop.deals();
    this.el('dealsGrid').innerHTML = d.items.map((it, i) => {
      const bought = d.bought.includes(i);
      return `<div class="bg-sky-50 rounded-2xl p-2 text-center">
        ${this.card(it.id, 1, { faded: bought })}
        <div class="text-[10px] text-slate-500 mt-1">You own: ${Collection.totalOf(it.id)}</div>
        <button class="btn w-full mt-1 text-xs !px-1 ${bought ? 'bg-slate-300 text-slate-600' : 'bg-amber-400 text-white'}" data-deal="${i}" ${bought || st.gold < it.price ? 'disabled' : ''}>
          ${bought ? 'SOLD' : `🪙 ${Utils.fmt(it.price)}`}</button></div>`;
    }).join('');
    this.el('dealsTimer').textContent = Utils.time(Utils.msToMidnight());
  },

  showEgg({ hatched, id, guaranteed, free, isNew }) {
    this.showModal(`
      <div class="text-center">
        <div class="font-extrabold text-sky-800">${free ? '🎁 Free Egg from the Slots!' : '🥚 Opening Egg...'}</div>
        <div id="eggStage" class="my-4"><span class="egg shake">🥚</span></div>
        <div id="eggRes" class="font-bold text-slate-500 min-h-[48px]">${guaranteed ? '🌟 Pity active — guaranteed hatch!' : 'Crack... crack...'}</div>
        <div class="flex gap-2 mt-3">
          <button class="btn flex-1 bg-slate-200 text-slate-700" data-close>Close</button>
          <button class="btn flex-1 bg-gradient-to-b from-amber-400 to-orange-500 text-white" id="eggAgain" disabled>Again · 🪙${CONFIG.EGG_PRICE}</button>
        </div>
      </div>`);
    setTimeout(() => {
      const stage = this.el('eggStage'); if (!stage) return;
      if (hatched) {
        Collection.add(id, 1);
        Social.log('🐣', `Hatched ${CREATURES[id].name} 1★${guaranteed ? ' (pity)' : ''}`);
        stage.innerHTML = `<div class="w-28 mx-auto pop-in">${this.card(id, 1)}</div>`;
        this.el('eggRes').innerHTML = `<div class="text-xl font-extrabold text-emerald-600">${CREATURES[id].name} hatched!</div>
          ${isNew ? `<div class="text-sm text-emerald-700">🆕 New species · +${CONFIG.DISCOVERY_ENERGY}⚡ — it moves onto your island!</div>` : '<div class="text-sm text-slate-500">Duplicate — keep it for merging after the set is complete!</div>'}`;
        this.confetti();
      } else {
        Social.log('🥚', 'Egg was empty');
        stage.innerHTML = `<span class="egg pop-in">🪺</span>`;
        this.el('eggRes').innerHTML = `<div class="text-xl font-extrabold text-rose-500">Empty egg...</div>
          <div class="text-sm text-slate-500">${S().pity >= CONFIG.PITY_THRESHOLD ? '🌟 Your NEXT egg is guaranteed!' : `Pity ${S().pity}/${CONFIG.PITY_THRESHOLD}`}</div>`;
      }
      const again = this.el('eggAgain'); if (again) again.disabled = S().gold < CONFIG.EGG_PRICE;
      Store.save(); this.renderAll();
    }, 1200);
  },

  /* ---------- Social tab ---------- */
  renderSocial() {
    const st = S(); const now = Date.now();

    // Account
    this.el('accountBox').innerHTML = Net.online
      ? `<div class="flex items-center gap-2"><div class="text-3xl">🧑‍✈️</div>
          <div class="flex-1"><div class="font-extrabold">${Utils.esc(Net.profile.nickname)}</div>
          <div class="text-xs text-slate-500">Progress saved in the cloud ☁️ · friends can add you by this name</div></div>
          <button class="btn text-xs bg-slate-200 text-slate-600" id="logoutBtn">Log out</button></div>`
      : Net.available()
        ? `<div class="text-sm text-slate-600 mb-2">You're playing <b>offline</b>. Raids, Tombola and friends use <b>real players only</b> — sign in to join them.</div>
           <button class="btn w-full bg-gradient-to-b from-sky-400 to-blue-600 text-white" id="openAuthBtn">🔑 Sign in / Create account</button>`
        : `<div class="text-sm text-rose-600">Game server unreachable — playing offline.</div>`;

    // Tombola (server data)
    const t = Net.tombola;
    const players = Net.online ? (t?.players || 0) : 0;
    const enough = players >= CONFIG.TOMBOLA_MIN_PLAYERS;
    this.el('tombolaTimer').textContent = Utils.time(Tombola.msLeft(now));
    this.el('tombolaPlayers').textContent = players;
    this.el('tombolaPool').textContent = players * CONFIG.TOMBOLA_TICKET + '⚡';
    this.el('tombolaPrize').textContent = Tombola.prizeFor(players) + '⚡';
    this.el('tombolaNote').textContent = enough
      ? `Pool ÷ 3 winners × 10. Ticket: ${CONFIG.TOMBOLA_TICKET}⚡`
      : `Needs at least ${CONFIG.TOMBOLA_MIN_PLAYERS} real players — otherwise tickets are refunded.`;
    const tb = this.el('tombolaBtn');
    const inNow = !!t?.entered;
    tb.disabled = !Net.online || inNow || st.energy < CONFIG.TOMBOLA_TICKET;
    tb.textContent = !Net.online ? '🔑 Sign in to play' : inNow ? '✅ Ticket in — wait for the draw!' : `Buy Ticket · ${CONFIG.TOMBOLA_TICKET}⚡`;
    this.el('tombolaEntrants').innerHTML = (t?.names || []).map(n =>
      `<span class="text-[11px] font-bold ${n === Net.profile?.nickname ? 'bg-fuchsia-500 text-white' : 'bg-white'} rounded-full px-2 py-0.5 shadow-sm">🎟️ ${Utils.esc(n)}</span>`).join('');
    const L = t?.last;
    this.el('tombolaLast').innerHTML = L ? `<div class="bg-white rounded-2xl p-2 shadow-sm">
        <div class="font-extrabold text-slate-700">Last draw · ${L.players} players · pool ${L.pool}⚡</div>
        <div class="text-xs text-slate-600">${L.refunded ? 'Not enough players — tickets refunded.' : `Winners (+${L.prize}⚡ each): ${(L.winner_names || []).map(n => n === Net.profile?.nickname ? `<b class="text-fuchsia-600">${Utils.esc(n)} 🎉</b>` : Utils.esc(n)).join(', ')}`}</div>
      </div>` : '';

    // Share
    const shareLeft = st.shareReadyAt - now;
    this.el('shareTimer').textContent = shareLeft > 0 ? `Next share bonus in ${Utils.time(shareLeft)}` : `✅ Share bonus ready: +${CONFIG.SHARE_ENERGY}⚡`;

    // Friends (real accounts)
    this.el('friendAdd').classList.toggle('hidden', !Net.online);
    this.el('friendsList').innerHTML = !Net.online
      ? '<div class="text-sm text-slate-400">Sign in to add real friends by nickname.</div>'
      : Net.friends.length ? Net.friends.map(f => {
          const left = f.last_sent ? CONFIG.GIFT_COOLDOWN_MS - (now - new Date(f.last_sent).getTime()) : 0;
          return `<div class="flex items-center gap-2 bg-sky-50 rounded-2xl p-2">
            <div class="text-2xl w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">🏝️</div>
            <div class="flex-1 min-w-0"><div class="font-extrabold text-sm truncate">${Utils.esc(f.nickname)}</div>
              <div class="text-[11px] text-slate-500">Island ${f.island_level} · ${Utils.ago(f.last_seen)}${left > 0 ? ` · gift in ${Utils.time(left)}` : ''}</div></div>
            <button class="btn text-xs ${left > 0 ? 'bg-slate-200 text-slate-500' : 'bg-pink-500 text-white'}" data-gift="${f.id}" ${left > 0 ? 'disabled' : ''}>🎁 10⚡</button>
          </div>`;
        }).join('')
      : '<div class="text-sm text-slate-400">No friends yet — add one by nickname or share your invite!</div>';

    // Leaderboard
    this.el('leaderBox').classList.toggle('hidden', !Net.online);
    this.el('leaderList').innerHTML = Net.leaders.map((p, i) =>
      `<div class="flex items-center gap-2 text-sm ${p.nickname === Net.profile?.nickname ? 'bg-amber-100' : 'bg-sky-50'} rounded-xl px-2 py-1">
        <b class="w-6 text-center">${['🥇', '🥈', '🥉'][i] || i + 1}</b><span class="flex-1 truncate font-bold">${Utils.esc(p.nickname)}</span>
        <span class="text-xs text-slate-500">🏝️ ${p.island_level}</span><span class="text-xs text-amber-600 w-16 text-right">🪙 ${Utils.fmt(p.gold)}</span></div>`).join('');

    this.el('activityLog').innerHTML = st.log.length
      ? st.log.map(l => `<div class="flex gap-2"><span class="text-slate-400 text-xs w-11 shrink-0 pt-0.5">${Utils.clock(l.t)}</span><span>${l.icon} ${Utils.esc(l.text)}</span></div>`).join('')
      : '<div class="text-slate-400">Nothing yet.</div>';
  },

  /* ---------- Auth ---------- */
  showAuth(mode = 'login') {
    if (!Net.available()) { this.toast('Game server unreachable right now.', 'red'); return; }
    const reg = mode === 'register';
    this.showModal(`
      <div class="text-center mb-3">
        <div class="text-5xl">🏝️</div>
        <div class="text-xl font-extrabold text-sky-800">${reg ? 'Create your island' : 'Welcome back, Island Master'}</div>
        <div class="text-xs text-slate-500">Real players only · no ads · no purchases</div>
      </div>
      <div class="space-y-2">
        <input id="authNick" class="input" placeholder="Nickname (3–16, letters/digits/_)" maxlength="16" autocomplete="username" />
        <input id="authPass" class="input" type="password" placeholder="Password (min 6)" autocomplete="${reg ? 'new-password' : 'current-password'}" />
        <div id="authErr" class="text-sm text-rose-600 min-h-[20px]"></div>
        <button class="btn w-full bg-gradient-to-b from-lime-400 to-green-600 text-white text-lg" id="authSubmit" data-mode="${mode}">${reg ? 'Create account' : 'Log in'}</button>
        <button class="btn w-full bg-sky-100 text-sky-700 text-sm" id="authSwitch" data-mode="${reg ? 'login' : 'register'}">${reg ? 'I already have an account' : 'New here? Create an account'}</button>
        <button class="w-full text-xs text-slate-500 underline mt-1" data-close>Play offline for now</button>
      </div>`);
    setTimeout(() => this.el('authNick')?.focus(), 50);
  },

  async submitAuth(mode) {
    const nick = this.el('authNick').value.trim(), pass = this.el('authPass').value;
    const btn = this.el('authSubmit'), err = this.el('authErr');
    btn.disabled = true; err.textContent = '';
    try {
      if (mode === 'register') await Net.register(nick, pass); else await Net.login(nick, pass);
      this.closeModal();
      this.toast(`Welcome, ${Net.profile.nickname}! 🏝️`, 'green');
      Social.log('🔑', `Signed in as ${Net.profile.nickname}`);
      Store.save();
      Island.renderScene(true);
      await Net.refreshSocial();
      this.renderAll();
    } catch (e) {
      err.textContent = e.message || 'Something went wrong';
      btn.disabled = false;
    }
  },

  /* ---------- Render orchestration ---------- */
  tickVisible() {
    if (this.activeTab === 'social') this.renderSocial();
    if (this.activeTab === 'shop') this.el('dealsTimer').textContent = Utils.time(Utils.msToMidnight());
  },

  renderAll() {
    this.renderTop();
    if (this.activeTab === 'slot') this.renderSlot();
    if (this.activeTab === 'island') { Island.renderScene(); this.renderIslandPanel(); }
    if (this.activeTab === 'pets') this.renderPets();
    if (this.activeTab === 'shop') this.renderShop();
    if (this.activeTab === 'social') this.renderSocial();
  },

  bind() {
    document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => this.switchTab(b.dataset.target)));
    this.el('topSocialBtn').addEventListener('click', () => this.switchTab('social'));
    this.el('netBadge').addEventListener('click', () => { if (!Net.online) this.showAuth(); else this.switchTab('social'); });
    this.el('spinBtn').addEventListener('click', () => Slot.spin());
    this.el('buyEggBtn').addEventListener('click', () => Shop.buyEgg());
    this.el('tombolaBtn').addEventListener('click', () => Tombola.buyTicket());
    this.el('travelBtn').addEventListener('click', () => this.showIslandComplete());
    this.el('clearSelBtn').addEventListener('click', () => { this.selectedStack = null; this.renderPets(); });
    this.el('autoMergeBtn').addEventListener('click', () => {
      const n = Collection.autoMergeAll();
      if (n) { this.toast(`✨ Performed ${n} merge${n > 1 ? 's' : ''}!`, 'gold'); Social.log('✨', `Auto-merged ${n} time(s)`); Store.save(); }
      else this.toast('Nothing to merge yet — complete the set first!', 'blue');
      this.selectedStack = null; this.renderAll();
    });
    this.el('addFriendBtn').addEventListener('click', async () => {
      const inp = this.el('friendNick'); const nick = inp.value.trim();
      if (!nick) return;
      try {
        const r = await Net.addFriend(nick);
        if (!r.ok) { this.toast(r.error, 'red'); return; }
        inp.value = '';
        this.toast(`🤝 ${r.nickname} is now your friend!`, 'green');
        Social.log('🤝', `Added ${r.nickname} as a friend`); Store.save();
        await Net.refreshSocial(); this.renderSocial();
      } catch (e) { this.toast('Could not add friend.', 'red'); }
    });
    this.el('resetBtn').addEventListener('click', () => {
      if (confirm('Reset ALL progress? This cannot be undone.')) { Store.reset(); this.selectedStack = null; Island.renderScene(true); this.renderAll(); this.toast('New island, new adventure! 🏝️'); }
    });
    document.querySelectorAll('.share-btn').forEach(b => b.addEventListener('click', () => Social.share(b.dataset.platform)));

    document.body.addEventListener('keydown', e => { if (e.key === 'Enter' && this.el('authSubmit')) this.submitAuth(this.el('authSubmit').dataset.mode); });

    document.body.addEventListener('click', async e => {
      const t = e.target.closest('[data-bet],[data-stack],[data-dex],[data-deal],[data-gift],[data-dexmerge],[data-upgrade],[data-bld],[data-walker],[data-close],#eggAgain,#travelNow,#authSubmit,#authSwitch,#openAuthBtn,#logoutBtn');
      if (!t) { if (e.target.id === 'modal' && !this.el('modal').dataset.locked) this.closeModal(); return; }
      if (t.disabled) return;
      if (t.dataset.bet) { if (!Slot.spinning) { S().bet = +t.dataset.bet; Store.save(); this.renderSlot(); } return; }
      if (t.dataset.upgrade) { if (t.dataset.close !== undefined) this.closeModal(); Island.upgrade(+t.dataset.upgrade); return; }
      if (t.dataset.stack) return this.onStackTap(t.dataset.stack);
      if (t.dataset.dex) return this.showDex(+t.dataset.dex);
      if (t.dataset.deal) return Shop.buyDeal(+t.dataset.deal);
      if (t.dataset.bld) return this.showBuilding(+t.dataset.bld);
      if (t.dataset.walker) return Island.tapPet(+t.dataset.walker);
      if (t.dataset.gift) {
        t.disabled = true;
        try {
          const r = await Net.sendGift(t.dataset.gift);
          const f = Net.friends.find(x => x.id === t.dataset.gift);
          if (r.ok) { this.toast(`🎁 Sent ${CONFIG.GIFT_AMOUNT}⚡ to ${f?.nickname}!`, 'green'); Social.log('🎁', `You sent ${CONFIG.GIFT_AMOUNT}⚡ to ${f?.nickname}`); Store.save(); }
          else this.toast(r.error, 'red');
        } catch (err) { this.toast('Could not send gift.', 'red'); }
        await Net.refreshSocial(); this.renderSocial();
        return;
      }
      if (t.dataset.dexmerge) {
        const [id, stars] = t.dataset.dexmerge.split(':').map(Number);
        if (Collection.merge(id, stars)) { this.toast(`✨ ${CREATURES[id].name} → ${stars + 1}★!`, 'gold'); Social.log('✨', `Merged 2× ${CREATURES[id].name} ${stars}★ → ${stars + 1}★`); Store.save(); this.showDex(id); this.renderAll(); }
        return;
      }
      if (t.id === 'eggAgain') { this.closeModal(); return Shop.buyEgg(); }
      if (t.id === 'travelNow') { this.closeModal(); return Island.travel(); }
      if (t.id === 'authSubmit') return this.submitAuth(t.dataset.mode);
      if (t.id === 'authSwitch') return this.showAuth(t.dataset.mode);
      if (t.id === 'openAuthBtn') return this.showAuth();
      if (t.id === 'logoutBtn') { await Net.logout(); Island.renderScene(true); this.renderAll(); this.toast('Logged out.'); return; }
      if (t.dataset.close !== undefined) this.closeModal();
    });
  },
};
