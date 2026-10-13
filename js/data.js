'use strict';
/* ============================================================================
   DATA — economy constants, creatures, islands, slot table, helpers
   ========================================================================== */
const HOUR = 3600 * 1000;

const CONFIG = {
  SAVE_KEY: 'pocketIslandMaster_save_v2',
  MAX_ENERGY: 2000,                 // cap for passive regeneration
  REGEN_AMOUNT: 3,                  // +3 energy ...
  REGEN_INTERVAL_MS: 60 * 1000,     // ... every 60 seconds
  START_ENERGY: 300,
  START_GOLD: 1500,

  SPIN_COST: 1,                     // energy per spin (× bet) — 1 like Coin Master
  BETS: [1, 3, 10, 50],

  EGG_PRICE: 500,
  EGG_HATCH_CHANCE: 0.5,            // 50% hatch / 50% empty
  PITY_THRESHOLD: 3,                // 3 empties in a row -> next egg guaranteed

  DISCOVERY_ENERGY: 10,             // +10 energy per new species
  SET_ENERGY_PER_TIER: 100,         // full 50-set at tier T -> 100 × T energy
  MAX_STARS: 5,

  CAPTURE_COPIES: 3,                // captured "too strong" pet -> THREE 1★ copies
  HIGH_TIER_CAPTURE: 3,
  NO_TARGET_GOLD: 50,                // consolation gold (× bet) when nobody can be raided

  SHARE_ENERGY: 50,
  SHARE_COOLDOWN_MS: 2 * HOUR,
  GIFT_AMOUNT: 10,
  GIFT_COOLDOWN_MS: 12 * HOUR,

  TOMBOLA_INTERVAL_MS: 5 * HOUR,
  TOMBOLA_TICKET: 3,
  TOMBOLA_WINNERS: 3,
  TOMBOLA_MULT: 10,
  TOMBOLA_MIN_PLAYERS: 3,

  BUILDING_MAX: 4,                  // each island building has 4 upgrade stars
  ISLAND_PETS: 10,                  // max animated pets walking on the island
  DEAL_COUNT: 3,
  LOG_LIMIT: 80,
  SYNC_MS: 15000,                   // server sync interval
};

const DATA = {
  ELEMENTS: {
    Fire:     { icon: '🔥', c1: '#ffb347', c2: '#ef4444', biome: 'Volcano Ridge' },
    Water:    { icon: '💧', c1: '#60a5fa', c2: '#1d4ed8', biome: 'Coral Lagoon' },
    Grass:    { icon: '🍃', c1: '#86efac', c2: '#15803d', biome: 'Jungle Grove' },
    Electric: { icon: '⚡', c1: '#fde047', c2: '#ea580c', biome: 'Storm Peaks' },
    Psychic:  { icon: '🔮', c1: '#f5d0fe', c2: '#9333ea', biome: 'Mystic Ruins' },
  },

  /** 50 original creatures (10 per element) */
  RAW_CREATURES: {
    Fire:     [['Embrix','🦊'],['Pyrowl','🦉'],['Cindrake','🐉'],['Blazepup','🐕'],['Magmole','🐹'],['Scorchick','🐤'],['Flarecat','🐈'],['Ignibat','🦇'],['Volcarox','🦏'],['Solmane','🦁']],
    Water:    [['Aquapup','🦭'],['Bubblefin','🐟'],['Tidalotl','🦎'],['Coralisk','🐚'],['Splashell','🐢'],['Krakenling','🐙'],['Wavewhale','🐳'],['Frostfin','🐧'],['Mistdolph','🐬'],['Pinchwave','🦀']],
    Grass:    [['Sproutle','🌱'],['Mossaur','🦕'],['Thornhog','🦔'],['Leafawn','🦌'],['Vinesnek','🐍'],['Bloomby','🐝'],['Caterleaf','🐛'],['Oakling','🌳'],['Shroomp','🍄'],['Lilyhop','🐸']],
    Electric: [['Voltmouse','🐭'],['Sparkit','🐰'],['Joltwing','🦅'],['Shockshark','🦈'],['Statikket','🦗'],['Thundox','🐺'],['Boltigon','🐯'],['Plasmoth','🦋'],['Voltgator','🐊'],['Kangazap','🦘']],
    Psychic:  [['Mindmew','🐱'],['Unimystic','🦄'],['Dreamlamb','🐑'],['Oracub','🐻'],['Zenpanda','🐼'],['Astrabbit','🐇'],['Peacosmic','🦚'],['Hypnosnail','🐌'],['Telepup','🐩'],['Auraloth','🦥']],
  },

  /** Island themes (cycle after the 5th island: "Palm Beach II", ...) */
  ISLANDS: [
    { name: 'Palm Beach',   sand: ['#fef3c7', '#fcd34d'], grass: ['#bbf7d0', '#4ade80'], deco: ['🌺', '🐚', '🌴', '🪨'],
      buildings: [['🛖', 'Beach Hut'], ['⛵', 'Sailboat'], ['🌴', 'Palm Grove'], ['🗿', 'Tiki Totem'], ['🏰', 'Sandcastle']] },
    { name: 'Volcano Isle', sand: ['#fed7aa', '#fb923c'], grass: ['#a8a29e', '#57534e'], deco: ['🔥', '🪨', '🌵', '💎'],
      buildings: [['🏕️', 'Lava Camp'], ['⛩️', 'Fire Shrine'], ['🌋', 'Volcano'], ['⚓', 'Ember Dock'], ['🏯', 'Ember Fort']] },
    { name: 'Frost Isle',   sand: ['#f0f9ff', '#bae6fd'], grass: ['#ffffff', '#e0f2fe'], deco: ['❄️', '🌲', '🧊', '⛄'],
      buildings: [['🏠', 'Snow Cabin'], ['⛄', 'Big Snowman'], ['🎄', 'Pine Grove'], ['🛷', 'Sled Run'], ['🏔️', 'Ice Peak']] },
    { name: 'Jungle Isle',  sand: ['#fde68a', '#d97706'], grass: ['#86efac', '#15803d'], deco: ['🌿', '🍌', '🦜', '🌳'],
      buildings: [['🛕', 'Lost Temple'], ['🌉', 'Rope Bridge'], ['🌳', 'Giant Tree'], ['🐘', 'Elephant Rock'], ['🎪', 'Tribe Tent']] },
    { name: 'Candy Isle',   sand: ['#fce7f3', '#f9a8d4'], grass: ['#f5d0fe', '#e879f9'], deco: ['🍬', '🍩', '🍓', '🧁'],
      buildings: [['🧁', 'Cupcake Hut'], ['🍭', 'Lollipop Grove'], ['🎡', 'Ferris Wheel'], ['🎠', 'Carousel'], ['🏰', 'Candy Castle']] },
  ],
  /** Building spots on the island scene (% left, % top = where the building stands) */
  BUILDING_SPOTS: [[24, 42], [74, 36], [50, 60], [22, 82], [76, 80]],
  DECO_SPOTS: [[12, 62], [88, 58], [40, 26], [62, 92]],

  SLOT_OUTCOMES: [
    { id: 'coins',   weight: 34, sym: '🪙' },
    { id: 'bag',     weight: 13, sym: '💰' },
    { id: 'jackpot', weight: 2,  sym: '💎' },
    { id: 'raid',    weight: 18, sym: '⚔️' },
    { id: 'energy',  weight: 10, sym: '⚡' },
    { id: 'egg',     weight: 4,  sym: '🥚' },
    { id: 'miss',    weight: 19, sym: null },
  ],
  SLOT_SYMBOLS: ['🪙', '💰', '💎', '⚔️', '⚡', '🥚', '🍒', '🌴'],
  TIER_NAMES: ['Base look', 'Larger badge', 'Shiny palette', 'Neon glow border', 'Cosmic particles'],
};

/** Final 50-creature list with stable ids 0..49 */
const CREATURES = Object.entries(DATA.RAW_CREATURES)
  .flatMap(([element, list]) => list.map(([name, emoji]) => ({ element, name, emoji })))
  .map((c, id) => ({ ...c, id }));

/* =============================== UTILS =============================== */
const Utils = {
  seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; },
  rand(min, max) { return min + Math.random() * (max - min); },
  randInt(min, max) { return Math.floor(Utils.rand(min, max + 1)); },
  pick(arr, rng = Math.random) { return arr[Math.floor(rng() * arr.length)]; },
  weighted(items, rng = Math.random) {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let r = rng() * total;
    for (const i of items) { if ((r -= i.weight) < 0) return i; }
    return items[items.length - 1];
  },
  fmt(n) { return Math.floor(n).toLocaleString('en-US'); },
  time(ms) {
    ms = Math.max(0, ms); const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const pad = v => String(v).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  },
  dayKey(d = new Date()) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; },
  msToMidnight() { const n = new Date(); const m = new Date(n); m.setHours(24, 0, 0, 0); return m - n; },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  clock(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  roman(n) { return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n); },
  ago(ts) {
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 2) return 'online';
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    return `${Math.floor(m / 1440)}d ago`;
  },
};
