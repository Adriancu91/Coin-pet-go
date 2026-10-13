'use strict';
/* ============================================================================
   NET — Supabase backend: nickname + password accounts, cloud save,
   real-player raids, friends & gifts, tombola, leaderboard. No bots.
   Every call goes through server functions (RPC) that check the session token.
   ========================================================================== */
const TOKEN_KEY = 'pocketIslandMaster_token';

const Net = {
  sb: null,
  token: null,
  profile: null,     // { id, nickname }
  online: false,
  dirty: false,
  syncing: false,
  loopTimer: null,
  tombola: null,
  friends: [],
  leaders: [],
  leaderKind: 'build',     // 'build' = building stars, 'pets' = collection stars

  available() { return !!(window.supabase && window.PIM_CONFIG?.SUPABASE_URL && window.PIM_CONFIG?.SUPABASE_KEY); },
  validNick(n) { return /^[A-Za-z0-9_]{3,16}$/.test(n || ''); },

  async rpc(name, args) {
    const { data, error } = await this.sb.rpc(name, args);
    if (error) {
      if (/invalid session/i.test(error.message)) this.sessionExpired();
      throw error;
    }
    return data;
  },
  /** RPC that needs the signed-in player */
  call(name, args = {}) { return this.rpc(name, { p_token: this.token, ...args }); },

  sessionExpired() {
    if (!this.online) return;
    this.online = false; this.stopLoop();
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    UI.toast('Session expired — please log in again.', 'red');
    UI.showAuth('login');
  },

  /** Restore a saved session on page load */
  async init() {
    if (!this.available()) return false;
    this.sb = window.supabase.createClient(PIM_CONFIG.SUPABASE_URL, PIM_CONFIG.SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    try { this.token = localStorage.getItem(TOKEN_KEY); } catch (e) {}
    if (!this.token) return false;
    try { return await this.afterLogin(); }
    catch (e) { console.warn('Session restore failed', e); this.token = null; try { localStorage.removeItem(TOKEN_KEY); } catch (_) {} return false; }
  },

  async register(nick, password) {
    nick = (nick || '').trim();
    if (!this.validNick(nick)) throw new Error('Nickname: 3–16 letters, digits or _');
    if ((password || '').length < 6) throw new Error('Password: at least 6 characters');
    const r = await this.rpc('register', { p_nick: nick, p_pass: password });
    if (!r.ok) throw new Error(r.error);
    return this.startSession(r.token);
  },

  async login(nick, password) {
    const r = await this.rpc('login', { p_nick: (nick || '').trim(), p_pass: password || '' });
    if (!r.ok) throw new Error(r.error);
    return this.startSession(r.token);
  },

  async startSession(token) {
    this.token = token;
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
    return this.afterLogin();
  },

  async logout() {
    await this.pushSave(true).catch(() => {});
    try { await this.call('logout'); } catch (e) {}
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    this.stopLoop();
    this.online = false; this.token = null; this.profile = null;
    this.tombola = null; this.friends = []; this.leaders = [];
    Store.state = Store.defaults(); Store.save();
  },

  /** Load profile + pick the newest save (cloud vs this device), then start syncing */
  async afterLogin() {
    const me = await this.call('get_me');
    this.profile = { id: me.id, nickname: me.nickname, isAdmin: !!me.is_admin };
    const local = Store.loadLocal();
    const localMine = local && (!local.ownerId || local.ownerId === me.id);
    let chosen = null;
    if (me.save && (!localMine || (me.save.savedAt || 0) >= (local.savedAt || 0))) chosen = me.save;
    else if (localMine) chosen = local;
    Store.state = Store.normalize(chosen);
    Store.state.ownerId = me.id;
    Store.state.shields = me.shields || 0;
    Energy.regen(Date.now());

    this.online = true;
    this.dirty = true;
    Store.save();
    await this.sync();
    this.startLoop();
    return true;
  },

  markDirty() { this.dirty = true; },

  /** Upload save + public card (gold / island / 3 defending pets) */
  async pushSave(force = false) {
    if (!this.online || (!this.dirty && !force)) return;
    this.dirty = false;
    const st = S();
    try {
      await this.call('push_save', {
        p_state: st,
        p_gold: Math.max(0, Math.floor(st.gold)),
        p_island: st.island.level,
        p_pets: Collection.activePets(3),
        p_build_stars: Island.totalBuildStars(),
        p_pet_stars: Collection.petStars(),
      });
    } catch (e) { this.dirty = true; throw e; }
  },

  /** Periodic sync: incoming raids, gifts, tombola draws/payouts, then upload */
  async sync() {
    if (!this.online || this.syncing) return;
    this.syncing = true;
    try {
      const ack = await this.call('ack_attacks');
      const attacks = ack?.attacks || [];
      if (typeof ack?.shields === 'number') S().shields = ack.shields;
      if (attacks?.length) { Raid.applyIncoming(attacks); UI.renderRaidLog(); }

      const gifts = await this.call('claim_gifts');
      for (const g of gifts || []) {
        Energy.add(g.amount, true); // gifts may exceed the 2000 cap
        Sound.play('gift');
        Social.log('💝', `${g.sender_name} sent you ${g.amount}⚡`);
        UI.toast(`💝 ${g.sender_name} sent you ${g.amount}⚡!`, 'pink');
      }

      await this.rpc('draw_tombola');
      const pays = await this.call('claim_tombola');
      if (pays?.length) Tombola.applyPayouts(pays);

      if (attacks?.length || gifts?.length || pays?.length) Store.save();
      await this.refreshTombola();
      this.dirty = true;                 // keeps last_seen fresh for raid targeting
      await this.pushSave();
      if (UI.activeTab === 'social') { await this.refreshSocial(); UI.renderSocial(); }
      UI.renderTop();
    } catch (e) {
      console.warn('Sync failed', e);
    } finally {
      this.syncing = false;
    }
  },

  startLoop() { this.stopLoop(); this.loopTimer = setInterval(() => this.sync(), CONFIG.SYNC_MS); },
  stopLoop() { clearInterval(this.loopTimer); this.loopTimer = null; },

  /* ---------- game calls ---------- */
  raid(bet) { return this.call('raid', { p_bet: bet }); },
  buyTicket() { return this.call('buy_ticket'); },
  addShields(n) { return this.call('add_shields', { p_count: n }); },
  async refreshTombola() { this.tombola = await this.call('tombola_status'); },
  addFriend(nick) { return this.call('add_friend', { p_nick: nick }); },
  sendGift(id) { return this.call('send_gift', { p_to: id }); },

  async refreshSocial() {
    if (!this.online) return;
    try {
      const [f, l] = await Promise.all([this.call('my_friends'), this.rpc('leaderboard_stars', { p_kind: this.leaderKind })]);
      this.friends = f || [];
      this.leaders = l || [];
    } catch (e) { console.warn(e); }
  },
};
