'use strict';
/* ============================================================================
   CORE GAME LOGIC — state, energy, collection/merge, slots, raids, shop, log
   ========================================================================== */

/* =============================== STORE =============================== */
const Store = {
  state: null,

  defaults() {
    const now = Date.now();
    return {
      version: 2,
      ownerId: null,          // Supabase user id that owns this save
      savedAt: 0,
      energy: CONFIG.START_ENERGY,
      gold: CONFIG.START_GOLD,
      lastRegenAt: now,
      bet: 1,
      inventory: {},          // "speciesId:stars" -> count
      discovered: {},         // speciesId -> first discovery time
      maxStar: {},            // speciesId -> highest tier ever reached
      setClaims: {},          // tier -> true once the full 50-set was completed (also unlocks merging that tier)
      pity: 0,
      shields: 0,             // 0–3 (server copy is authoritative when online)
      eggsOpened: 0,
      deals: { day: '', items: [], bought: [] },
      shareReadyAt: 0,
      island: { level: 1, buildings: [0, 0, 0, 0, 0] },
      raids: [],              // recent raids, both directions
      log: [],
      stats: { spins: 0, raids: 0, captures: 0 },
    };
  },

  /** Merge an object onto defaults so saves from older versions keep working */
  normalize(obj) {
    const st = Object.assign(this.defaults(), obj || {});
    if (!st.island || !Array.isArray(st.island.buildings)) st.island = { level: 1, buildings: [0, 0, 0, 0, 0] };
    return st;
  },

  loadLocal() {
    try { const raw = localStorage.getItem(CONFIG.SAVE_KEY); if (raw) return JSON.parse(raw); }
    catch (e) { console.warn('Local save unreadable', e); }
    return null;
  },

  load() { this.state = this.normalize(this.loadLocal()); },

  save() {
    this.state.savedAt = Date.now();
    try { localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(this.state)); } catch (e) { console.warn('Could not save', e); }
    if (typeof Net !== 'undefined') Net.markDirty();
  },

  reset() {
    const owner = this.state?.ownerId || null;
    this.state = this.defaults();
    this.state.ownerId = owner;
    this.save();
  },
};
const S = () => Store.state;

/* =============================== ENERGY =============================== */
const Energy = {
  /**
   * Rewards (spins, achievements, friends, tombola, refunds...) are NOT capped.
   * Only passive regeneration stops at MAX_ENERGY (500) — see regen().
   */
  add(amount) {
    S().energy += amount;
  },
  spend(amount) {
    if (S().energy < amount) return false;
    S().energy -= amount;
    return true;
  },
  /** +3 per full minute elapsed (offline included) */
  regen(now) {
    const st = S();
    if (st.energy >= CONFIG.MAX_ENERGY) { st.lastRegenAt = now; return; }
    const ticks = Math.floor((now - st.lastRegenAt) / CONFIG.REGEN_INTERVAL_MS);
    if (ticks > 0) {
      st.energy = Math.min(CONFIG.MAX_ENERGY, st.energy + ticks * CONFIG.REGEN_AMOUNT);
      st.lastRegenAt += ticks * CONFIG.REGEN_INTERVAL_MS;
      if (st.energy >= CONFIG.MAX_ENERGY) st.lastRegenAt = now;
    }
  },
  msToNext(now) { return CONFIG.REGEN_INTERVAL_MS - (now - S().lastRegenAt); },
};

/* ============================= COLLECTION ============================= */
const Collection = {
  key: (id, stars) => `${id}:${stars}`,
  count(id, stars) { return S().inventory[this.key(id, stars)] || 0; },
  setCount(id, stars, n) {
    const k = this.key(id, stars);
    if (n <= 0) delete S().inventory[k]; else S().inventory[k] = n;
  },
  totalOf(id) { let n = 0; for (let t = 1; t <= CONFIG.MAX_STARS; t++) n += this.count(id, t); return n; },

  stacks() {
    return Object.entries(S().inventory)
      .map(([k, count]) => { const [id, stars] = k.split(':').map(Number); return { id, stars, count }; })
      .filter(s => s.count > 0 && CREATURES[s.id])
      .sort((a, b) => a.id - b.id || b.stars - a.stars);
  },
  total() { return this.stacks().reduce((s, x) => s + x.count, 0); },

  averageTier() {
    let n = 0, sum = 0;
    for (const s of this.stacks()) { n += s.count; sum += s.count * s.stars; }
    return n ? sum / n : 1;
  },

  bestOwned(id) {
    for (let t = CONFIG.MAX_STARS; t >= 1; t--) if (this.count(id, t) > 0) return t;
    return 0;
  },

  /** Strongest owned pets (one per species) — they walk on the island & defend it */
  activePets(limit) {
    return CREATURES.map(c => ({ id: c.id, stars: this.bestOwned(c.id) }))
      .filter(p => p.stars > 0)
      .sort((a, b) => b.stars - a.stars || a.id - b.id)
      .slice(0, limit);
  },

  add(id, stars = 1, qty = 1) {
    const st = S();
    this.setCount(id, stars, this.count(id, stars) + qty);
    let isNew = false;
    if (!st.discovered[id]) {
      st.discovered[id] = Date.now();
      isNew = true;
      Energy.add(CONFIG.DISCOVERY_ENERGY);
      UI.toast(`🆕 New discovery: ${CREATURES[id].emoji} ${CREATURES[id].name}! +${CONFIG.DISCOVERY_ENERGY}⚡`, 'green');
      Social.log('🆕', `Discovered ${CREATURES[id].name} (+${CONFIG.DISCOVERY_ENERGY}⚡)`);
    }
    this.reachTier(id, stars);
    return { isNew };
  },

  reachTier(id, stars) {
    const st = S();
    if ((st.maxStar[id] || 0) < stars) st.maxStar[id] = stars;
    this.checkSets();
  },

  /** Collection stars for the leaderboard: highest tier ever reached per species (max 50 × 5 = 250) */
  petStars() { return CREATURES.reduce((s, c) => s + (S().maxStar[c.id] || 0), 0); },

  /** Species that reached at least tier t */
  setProgress(t) { return CREATURES.filter(c => (S().maxStar[c.id] || 0) >= t).length; },

  /** Full 50-set at tier T → +100×T energy, and it UNLOCKS merging T★ duplicates into (T+1)★ */
  checkSets() {
    const st = S();
    for (let t = 1; t <= CONFIG.MAX_STARS; t++) {
      if (!st.setClaims[t] && this.setProgress(t) === CREATURES.length) {
        st.setClaims[t] = true;
        const reward = CONFIG.SET_ENERGY_PER_TIER * t;
        Energy.add(reward);
        UI.toast(`🏆 FULL ${t}★ SET COMPLETE! +${reward}⚡`, 'gold');
        if (t < CONFIG.MAX_STARS) UI.toast(`🔓 ${t}★ → ${t + 1}★ merging unlocked! Use your duplicates.`, 'pink');
        UI.confetti(); Sound.play('jackpot');
        Social.log('🏆', `Completed all 50 at ${t}★ (+${reward}⚡) — ${t}★ merges unlocked`);
      }
    }
  },

  /** Merging tier t is allowed only after the full 50-set at tier t is complete */
  mergeUnlocked(t) { return !!S().setClaims[t]; },

  merge(id, stars, silent = false) {
    if (stars >= CONFIG.MAX_STARS) { if (!silent) UI.toast('5★ is the maximum tier!', 'red'); return false; }
    if (!this.mergeUnlocked(stars)) {
      if (!silent) UI.toast(`🔒 Complete the full ${stars}★ set first (${this.setProgress(stars)}/50). Keep the duplicates!`, 'red');
      return false;
    }
    if (this.count(id, stars) < 2) { if (!silent) UI.toast('You need two identical copies to merge.', 'red'); return false; }
    this.setCount(id, stars, this.count(id, stars) - 2);
    this.setCount(id, stars + 1, this.count(id, stars + 1) + 1);
    this.reachTier(id, stars + 1);
    return true;
  },

  /** Merge every possible pair in unlocked tiers, cascading upward */
  autoMergeAll() {
    let merges = 0;
    for (let t = 1; t < CONFIG.MAX_STARS; t++) {
      if (!this.mergeUnlocked(t)) continue;
      for (const c of CREATURES) while (this.count(c.id, t) >= 2 && this.merge(c.id, t, true)) merges++;
    }
    return merges;
  },

  randomSpecies() { return Utils.pick(CREATURES).id; },
};

/* ================================ SLOT ================================ */
const Slot = {
  spinning: false,
  forced: null,          // admin testing: force the next outcome id

  reelsFor(outcome) {
    if (outcome.sym) return [outcome.sym, outcome.sym, outcome.sym];
    let r;
    do { r = [0, 0, 0].map(() => Utils.pick(DATA.SLOT_SYMBOLS)); } while (r[0] === r[1] && r[1] === r[2]);
    return r;
  },

  async spin() {
    if (this.spinning) return;
    const st = S();
    const cost = CONFIG.SPIN_COST * st.bet;
    if (!Energy.spend(cost)) { UI.toast(`Not enough energy! Need ${cost}⚡`, 'red'); return; }

    this.spinning = true;
    st.stats.spins++;
    UI.renderTop(); UI.setSpinEnabled(false);
    UI.el('slotResult').textContent = 'Spinning...';

    const outcome = (this.forced && DATA.SLOT_OUTCOMES.find(o => o.id === this.forced)) || Utils.weighted(DATA.SLOT_OUTCOMES);
    this.forced = null;
    await UI.animateReels(this.reelsFor(outcome));
    await this.resolve(outcome, st.bet);

    this.spinning = false;
    UI.setSpinEnabled(true);
    Store.save();
  },

  async resolve(outcome, bet) {
    const res = UI.el('slotResult');
    const win = g => { S().gold += g; UI.flashReels(); };
    switch (outcome.id) {
      case 'coins':   { const g = Utils.randInt(50, 90) * bet; win(g); Sound.play('coin'); res.textContent = `🪙 +${Utils.fmt(g)} Gold!`; break; }
      case 'bag':     { const g = Utils.randInt(180, 260) * bet; win(g); Sound.play('bigwin'); res.textContent = `💰 Big Bag! +${Utils.fmt(g)} Gold!`; break; }
      case 'jackpot': { const g = 1000 * bet; win(g); res.textContent = `💎 JACKPOT! +${Utils.fmt(g)} Gold!`; UI.confetti(); Sound.play('jackpot'); Social.log('💎', `Jackpot +${Utils.fmt(g)} Gold`); break; }
      case 'energy':  { const e = 3 * bet; Energy.add(e); UI.flashReels(); Sound.play('energy'); res.textContent = `⚡ +${e} Energy!`; break; }
      case 'egg':     { UI.flashReels(); res.textContent = bet > 1 ? `🥚 ${bet} Free Eggs!` : '🥚 Free Egg!'; if (bet > 1) Shop.openEggs(bet, true); else Shop.openEgg(true); break; }
      case 'raid':    { UI.flashReels(); res.textContent = '⚔️ RAID TIME!'; await Raid.start(bet); break; }
      case 'shield':  { UI.flashReels(); await Raid.gainShield(bet); break; }
      default:        res.textContent = 'So close... spin again! 🌴';
    }
    UI.renderTop();
  },
};

/* ================================ RAID ================================ */
/* Raids only hit REAL players stored on the server — there are no bots. */
const Raid = {
  record(entry) {
    const st = S();
    st.raids.unshift({ t: Date.now(), ...entry });
    st.raids = st.raids.slice(0, 10);
  },

  /**
   * 🛡️🛡️🛡️ on the slots gives as many shields as the bet (x50 → 50).
   * Shields fill up to 3; every shield that doesn't fit comes back as 1⚡.
   * e.g. x50 with 0 shields → 3 shields + 47⚡ · x3 with 1 shield → 2 shields + 1⚡
   */
  async gainShield(bet) {
    const st = S(); const res = UI.el('slotResult');
    let added = null, total = null;
    if (Net.online) {
      try { const r = await Net.addShields(bet); added = r.added; total = r.shields; } catch (e) { console.warn(e); }
    } else {
      added = Math.max(0, Math.min(CONFIG.MAX_SHIELDS - st.shields, bet));
      total = st.shields + added;
    }
    if (added === null) {          // server unreachable: give the whole bet back as energy
      Energy.add(bet);
      res.textContent = `🛡️ Server busy — +${bet}⚡ refunded`;
      UI.renderTop(); return;
    }
    st.shields = total;
    const refund = bet - added;
    if (refund > 0) Energy.add(refund);
    const parts = [];
    if (added) parts.push(`+${added} 🛡️ (${total}/${CONFIG.MAX_SHIELDS})`);
    if (refund) parts.push(`+${refund}⚡ back`);
    res.textContent = `🛡️ ${parts.join(' · ')}`;
    Sound.play(added ? 'shield' : 'energy');
    if (added) UI.toast(`🛡️ +${added} shield${added > 1 ? 's' : ''} — ${total}/${CONFIG.MAX_SHIELDS}${refund ? ` · ${refund}⚡ returned` : ''}`, 'blue');
    else UI.toast(`🛡️ Shields already full — ${refund}⚡ returned`, 'blue');
    Social.log('🛡️', `Shield spin x${bet}: +${added} shields, +${refund}⚡ back`);
    UI.renderTop();
  },

  /** Consolation when there is nobody to raid / offline */
  consolation(bet, why) {
    const g = CONFIG.NO_TARGET_GOLD * bet;
    S().gold += g;
    UI.el('slotResult').textContent = `⚔️ ${why} +${Utils.fmt(g)} Gold`;
    UI.toast(`${why} Consolation +${Utils.fmt(g)}🪙`, 'blue');
    UI.renderTop();
  },

  async start(bet) {
    const st = S();
    if (!Net.online) return this.consolation(bet, 'Sign in to raid real players!');
    let res = null;
    try { res = await Net.raid(bet); } catch (e) { console.warn(e); }
    if (!res) return this.consolation(bet, 'Raid failed (connection).');
    if (!res.found) return this.consolation(bet, 'No other islands yet — invite friends!');

    st.stats.raids++;
    const isle0 = Island.nameFor(res.island_level || 1);
    if (res.blocked) {
      const g = CONFIG.NO_TARGET_GOLD * bet;
      st.gold += g;
      this.record({ dir: 'out', name: `${res.nickname}'s ${isle0}`, stolen: g, capText: '🛡️ blocked' });
      Social.log('🛡️', `${res.nickname}'s shield blocked your raid (+${g} Gold consolation)`);
      UI.showRaidBlocked(res.nickname, isle0, res.shields_left || 0, g);
      Sound.play('raid'); setTimeout(() => Sound.play('blocked'), 350);
      UI.renderTop(); UI.renderRaidLog(); Store.save();
      return;
    }
    const stolen = Math.max(0, Math.floor(res.stolen || 0));
    st.gold += stolen;
    const pets = (Array.isArray(res.pets) ? res.pets : []).filter(p => CREATURES[p?.id] && p.stars >= 1 && p.stars <= 5);

    // 5% capture (rolled on the server). De-level rule:
    // above my average tier OR any 3★+  -> converts into THREE independent 1★ copies
    let capture = null;
    const cap = res.captured;
    if (cap && CREATURES[cap.id] && cap.stars >= 1 && cap.stars <= 5) {
      const avg = Collection.averageTier();
      const delevel = cap.stars > avg || cap.stars >= CONFIG.HIGH_TIER_CAPTURE;
      if (delevel) Collection.add(cap.id, 1, CONFIG.CAPTURE_COPIES);
      else Collection.add(cap.id, cap.stars, 1);
      capture = { id: cap.id, stars: cap.stars, delevel };
      st.stats.captures++;
    }

    const isle = Island.nameFor(res.island_level || 1);
    const name = `${res.nickname}'s ${isle}`;
    const capText = capture
      ? `captured ${CREATURES[capture.id].name} ${capture.stars}★${capture.delevel ? ' → 3× 1★' : ''}` : '';
    this.record({ dir: 'out', name, stolen, capText });
    Social.log('⚔️', `Raided ${name}: +${Utils.fmt(stolen)} Gold${capText ? ' · ' + capText : ''}`);

    UI.showRaid({ owner: res.nickname, island: isle, gold: res.gold, pets }, stolen, capture);
    Sound.play('raid');
    UI.renderTop(); UI.renderRaidLog();
    Store.save();
  },

  /** Raids other players made on MY island while I was away */
  applyIncoming(rows) {
    const st = S();
    for (const r of rows) {
      if (r.blocked) {
        Sound.play('shield');
        this.record({ dir: 'in', name: r.attacker_name, stolen: 0, capText: 'blocked' });
        Social.log('🛡️', `${r.attacker_name} attacked you — your shield blocked it!`);
        UI.toast(`🛡️ ${r.attacker_name} attacked — your shield blocked it!`, 'blue');
        continue;
      }
      Sound.play('raid');
      const loss = Math.min(st.gold, Math.max(0, Number(r.stolen) || 0));
      st.gold -= loss;
      this.record({ dir: 'in', name: r.attacker_name, stolen: loss, capText: '' });
      Social.log('🛡️', `${r.attacker_name} raided your island and stole ${Utils.fmt(loss)} Gold`);
      UI.toast(`⚔️ ${r.attacker_name} raided you! -${Utils.fmt(loss)}🪙`, 'red');
    }
  },
};

/* ================================ SHOP ================================ */
const Shop = {
  buyEgg() {
    const st = S();
    if (st.gold < CONFIG.EGG_PRICE) { UI.toast(`Not enough Gold! Need ${CONFIG.EGG_PRICE} 🪙`, 'red'); return; }
    st.gold -= CONFIG.EGG_PRICE;
    UI.renderTop();
    this.openEgg(false);
  },

  /** 50% hatch / 50% empty; 3 empties in a row → next egg guaranteed; pity resets on hatch */
  openEgg(free) {
    const st = S();
    st.eggsOpened++;
    const guaranteed = st.pity >= CONFIG.PITY_THRESHOLD;
    const hatched = guaranteed || Math.random() < CONFIG.EGG_HATCH_CHANCE;
    let id = null, isNew = false;
    if (hatched) { id = Collection.randomSpecies(); st.pity = 0; isNew = !st.discovered[id]; }
    else st.pity++;
    Store.save();
    UI.showEgg({ hatched, id, guaranteed, free, isNew });
  },

  /**
   * Open several eggs at once (slot egg × bet). Same rules per egg: 50% hatch,
   * pity guarantee after 3 empties in a row. Shows one summary instead of N popups.
   */
  openEggs(n, free) {
    const st = S();
    const hatched = []; let empties = 0, pityHits = 0;
    for (let i = 0; i < n; i++) {
      st.eggsOpened++;
      const guaranteed = st.pity >= CONFIG.PITY_THRESHOLD;
      if (guaranteed || Math.random() < CONFIG.EGG_HATCH_CHANCE) {
        const id = Collection.randomSpecies();
        const isNew = !st.discovered[id];
        Collection.add(id, 1);
        hatched.push({ id, isNew });
        st.pity = 0;
        if (guaranteed) pityHits++;
      } else { st.pity++; empties++; }
    }
    Social.log('🐣', `Opened ${n} eggs: ${hatched.length} pets, ${empties} empty`);
    Store.save();
    UI.showEggBatch({ n, hatched, empties, pityHits, free });
  },

  deals() {
    const st = S();
    const day = Utils.dayKey();
    if (st.deals.day !== day) {
      const rng = Utils.seeded(Utils.hash('deals-' + day));
      const ids = new Set();
      while (ids.size < CONFIG.DEAL_COUNT) ids.add(Math.floor(rng() * CREATURES.length));
      st.deals = { day, items: [...ids].map(id => ({ id, price: Math.round((4000 + rng() * 6000) / 100) * 100 })), bought: [] };
      Store.save();
    }
    return st.deals;
  },

  buyDeal(idx) {
    const st = S(); const d = this.deals(); const item = d.items[idx];
    if (!item || d.bought.includes(idx)) return;
    if (st.gold < item.price) { UI.toast(`Not enough Gold! Need ${Utils.fmt(item.price)} 🪙`, 'red'); return; }
    st.gold -= item.price;
    d.bought.push(idx);
    Collection.add(item.id, 1);
    Sound.play('coin');
    UI.toast(`Bought ${CREATURES[item.id].emoji} ${CREATURES[item.id].name} 1★!`, 'green');
    Social.log('🛒', `Bought deal: ${CREATURES[item.id].name} for ${Utils.fmt(item.price)} Gold`);
    Store.save(); UI.renderAll();
  },
};

/* =============================== SOCIAL =============================== */
const Social = {
  log(icon, text) {
    const st = S();
    st.log.unshift({ t: Date.now(), icon, text });
    st.log = st.log.slice(0, CONFIG.LOG_LIMIT);
  },

  gameUrl() { return location.href.split('#')[0].split('?')[0]; },

  /** Real share (WhatsApp link / native share sheet) — +50 energy, 2h cooldown */
  async share(platform) {
    const st = S(); const now = Date.now();
    const nick = Net.profile?.nickname;
    const text = `🏝️ Join me on Pocket Island Master — free, no ads! ${nick ? `Add me as a friend: ${nick} ` : ''}${this.gameUrl()}`;
    if (platform === 'WhatsApp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    } else {
      try {
        if (navigator.share) await navigator.share({ title: 'Pocket Island Master', text, url: this.gameUrl() });
        else { await navigator.clipboard.writeText(text); UI.toast('Invite copied — paste it on TikTok!', 'blue'); }
      } catch (e) { /* user closed the share sheet */ }
    }
    if (now < st.shareReadyAt) { UI.toast(`Shared! Bonus ready again in ${Utils.time(st.shareReadyAt - now)}`, 'blue'); return; }
    st.shareReadyAt = now + CONFIG.SHARE_COOLDOWN_MS;
    Energy.add(CONFIG.SHARE_ENERGY);
    UI.toast(`Shared to ${platform}! +${CONFIG.SHARE_ENERGY}⚡`, 'green');
    this.log('📣', `Shared to ${platform} (+${CONFIG.SHARE_ENERGY}⚡)`);
    Store.save(); UI.renderAll();
  },
};

/* =============================== TOMBOLA =============================== */
/* Real players only — tickets, draws and payouts live on the server. */
const Tombola = {
  roundId(now = Date.now()) { return Math.floor(now / CONFIG.TOMBOLA_INTERVAL_MS); },
  msLeft(now = Date.now()) { return (this.roundId(now) + 1) * CONFIG.TOMBOLA_INTERVAL_MS - now; },

  /** Pool = players × 3; each of the 3 winners gets pool ÷ 3 × 10 */
  prizeFor(players) { return Math.floor((players * CONFIG.TOMBOLA_TICKET) / CONFIG.TOMBOLA_WINNERS) * CONFIG.TOMBOLA_MULT; },

  async buyTicket() {
    if (!Net.online) { UI.toast('Sign in to play the Tombola with real players!', 'red'); return; }
    if (Net.tombola?.entered) { UI.toast('You already have a ticket for this draw!', 'red'); return; }
    if (!Energy.spend(CONFIG.TOMBOLA_TICKET)) { UI.toast('Not enough energy!', 'red'); return; }
    let ok = false;
    try { ok = await Net.buyTicket(); } catch (e) { console.warn(e); }
    if (!ok) { Energy.add(CONFIG.TOMBOLA_TICKET); UI.toast('Could not buy the ticket — energy refunded.', 'red'); UI.renderAll(); return; }
    Social.log('🎟️', `Bought a Tombola ticket (-${CONFIG.TOMBOLA_TICKET}⚡)`);
    UI.toast('🎟️ Ticket bought! Good luck!', 'green');
    Store.save();
    await Net.refreshTombola();
    UI.renderAll();
  },

  applyPayouts(rows) {
    for (const p of rows) {
      Energy.add(p.amount);
      if (p.kind === 'win') {
        UI.toast(`🎉 You WON the Tombola! +${p.amount}⚡`, 'gold'); UI.confetti(); Sound.play('jackpot');
        Social.log('🎉', `Won the Tombola: +${p.amount}⚡`);
      } else {
        UI.toast(`🎟️ Tombola needed ${CONFIG.TOMBOLA_MIN_PLAYERS}+ players — ticket refunded (+${p.amount}⚡)`, 'blue');
        Social.log('🎟️', `Tombola refunded (+${p.amount}⚡)`);
      }
    }
  },
};
