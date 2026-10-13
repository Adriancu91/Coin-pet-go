'use strict';
/* ============================================================================
   GAME — boot sequence + 1-second loop
   ========================================================================== */
const Game = {
  lastRound: Tombola.roundId(),

  async init() {
    Store.load();
    Energy.regen(Date.now());
    UI.bind();
    UI.switchTab('island');

    let loggedIn = false;
    try { loggedIn = await Net.init(); } catch (e) { console.warn('Server unavailable', e); }

    if (!S().log.length) Social.log('🏝️', 'Welcome to Pocket Island Master!');
    Shop.deals();
    Store.save();

    if (loggedIn) {
      UI.toast(`Welcome back, ${Net.profile.nickname}! 🌴`, 'green');
      Island.renderScene(true);
      await Net.refreshSocial();
    } else if (Net.available()) {
      UI.showAuth('register');
    }
    UI.renderAll();

    let ticks = 0;
    setInterval(() => {
      const now = Date.now();
      Energy.regen(now);
      if (S().deals.day !== Utils.dayKey()) { Shop.deals(); if (UI.activeTab === 'shop') UI.renderShop(); }
      // New tombola round started → let the server draw the old one right away
      const r = Tombola.roundId(now);
      if (r !== this.lastRound) { this.lastRound = r; Net.sync(); }
      UI.renderTop();
      UI.tickVisible();
      if (++ticks % 10 === 0) Store.save();
    }, 1000);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { Store.save(); Net.pushSave(true).catch(() => {}); }
      else { Energy.regen(Date.now()); Net.sync(); UI.renderAll(); }
    });
    window.addEventListener('beforeunload', () => Store.save());

    // Auto-update: GitHub Pages caches files for ~10 min, so check version.txt and offer a reload
    const vl = document.getElementById('verLabel'); if (vl) vl.textContent = window.APP_VERSION || 'dev';
    const checkUpdate = async () => {
      if (!window.APP_VERSION) return;
      try {
        const r = await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) return;
        const live = (await r.text()).trim();
        if (live && live !== window.APP_VERSION) document.getElementById('updateBar').classList.remove('hidden');
      } catch (e) { /* offline */ }
    };
    document.getElementById('updateBar').addEventListener('click', () => { Store.save(); Net.pushSave(true).catch(() => {}).finally(() => location.reload()); });
    checkUpdate();
    setInterval(checkUpdate, 3 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
  },
};

Game.init();
