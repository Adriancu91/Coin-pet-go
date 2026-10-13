'use strict';
/* ============================================================================
   ADMIN — testing panel, visible only for accounts with is_admin = true on the
   server (set in Supabase). Admin accounts are hidden from the leaderboard and
   can't be raided, so test resources never leak into the real economy.
   ========================================================================== */
const Admin = {
  tier: 1,

  isAdmin() { return Net.online && !!Net.profile?.isAdmin; },

  render() {
    const box = UI.el('adminBox');
    if (!box) return;
    box.classList.toggle('hidden', !this.isAdmin());
    if (!this.isAdmin()) return;
    // Rebuild only when needed so buttons don't flicker every second
    const sig = `${this.tier}|${S().island.level}|${Slot.forced}`;
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    const btn = (action, label, arg = '', cls = 'bg-amber-400 text-white') =>
      `<button class="btn text-xs !px-2 !py-2 ${cls}" data-admin="${action}" data-arg="${arg}">${label}</button>`;
    const section = (title, body) => `<div class="mt-3"><div class="text-xs font-extrabold text-slate-500 mb-1">${title}</div><div class="flex flex-wrap gap-1">${body}</div></div>`;
    box.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="font-extrabold text-amber-600 text-lg">🛠️ Admin panel</div>
        <div class="text-[10px] text-slate-500 text-right">only you see this ·<br>hidden from leaderboard & raids</div>
      </div>
      ${section('🪙 Gold', btn('gold', '+10K', 10000) + btn('gold', '+100K', 100000) + btn('gold', '+1M', 1000000))}
      ${section('⚡ Energy', btn('energy', '+500', 500) + btn('fill', 'Fill 2000') + btn('energyx', '+5000 (over cap)', 5000))}
      ${section(`🐾 Pets — tier ${'★'.repeat(this.tier)}`,
        [1, 2, 3, 4, 5].map(t => btn('tier', '★' + t, t, t === this.tier ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-700')).join('') +
        btn('allpets', `All 50 at ${this.tier}★`, '', 'bg-violet-500 text-white') +
        btn('dupes', `2× each at ${this.tier}★ (merge test)`, '', 'bg-violet-500 text-white') +
        btn('random', '10 random 1★', '', 'bg-violet-500 text-white'))}
      ${section(`🏝️ Island (now ${S().island.level})`,
        btn('island', 'Complete island', '', 'bg-sky-500 text-white') +
        btn('nextisland', 'Skip to next island', '', 'bg-sky-500 text-white'))}
      ${section('🎰 Force next spin' + (Slot.forced ? ` — <b class="text-pink-600">${Slot.forced}</b>` : ''),
        ['raid', 'shield', 'jackpot', 'bag', 'egg', 'energy'].map(o => btn('force', o, o, Slot.forced === o ? 'bg-pink-600 text-white' : 'bg-pink-100 text-pink-700')).join(''))}
      ${section('🧪 Misc',
        btn('pity', 'Next egg guaranteed', '', 'bg-emerald-500 text-white') +
        btn('share', 'Reset share cooldown', '', 'bg-emerald-500 text-white') +
        btn('deals', 'Free daily deals', '', 'bg-emerald-500 text-white'))}`;
  },

  run(action, arg) {
    if (!this.isAdmin()) return;
    const st = S(); const n = Number(arg);
    switch (action) {
      case 'gold':    st.gold += n; UI.toast(`🛠️ +${Utils.fmt(n)} Gold`, 'gold'); break;
      case 'energy':  Energy.add(n); UI.toast(`🛠️ +${n}⚡`, 'gold'); break;
      case 'fill':    st.energy = Math.max(st.energy, CONFIG.MAX_ENERGY); UI.toast('🛠️ Energy full', 'gold'); break;
      case 'energyx': Energy.add(n, true); UI.toast(`🛠️ +${n}⚡ (over cap)`, 'gold'); break;
      case 'tier':    this.tier = n; break;
      case 'allpets': CREATURES.forEach(c => Collection.add(c.id, this.tier, 1)); UI.toast(`🛠️ Added all 50 pets at ${this.tier}★`, 'gold'); break;
      case 'dupes':   CREATURES.forEach(c => Collection.add(c.id, this.tier, 2)); UI.toast(`🛠️ Added 2× each pet at ${this.tier}★`, 'gold'); break;
      case 'random':  for (let i = 0; i < 10; i++) Collection.add(Collection.randomSpecies(), 1); UI.toast('🛠️ Added 10 random pets', 'gold'); break;
      case 'island':
        st.island.buildings = st.island.buildings.map(() => CONFIG.BUILDING_MAX);
        Island.renderScene(true); UI.showIslandComplete(); break;
      case 'nextisland':
        st.island.level++; st.island.buildings = [0, 0, 0, 0, 0];
        Island.renderScene(true); UI.toast(`🛠️ Now on ${Island.nameFor(st.island.level)}`, 'gold'); break;
      case 'force':   Slot.forced = Slot.forced === arg ? null : arg; if (Slot.forced) UI.toast(`🛠️ Next spin: ${arg} — go to Spin`, 'gold'); break;
      case 'pity':    st.pity = CONFIG.PITY_THRESHOLD; UI.toast('🛠️ Next egg is guaranteed', 'gold'); break;
      case 'share':   st.shareReadyAt = 0; UI.toast('🛠️ Share bonus ready', 'gold'); break;
      case 'deals':   Shop.deals().items.forEach(it => { it.price = 0; }); UI.toast('🛠️ Today\'s deals cost 0', 'gold'); break;
      default: return;
    }
    Social.log('🛠️', `Admin: ${action}${arg ? ' ' + arg : ''}`);
    Store.save();
    UI.el('adminBox').dataset.sig = '';
    UI.renderAll();
  },
};
