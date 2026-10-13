# 🏝️ Pocket Island Master

A 100% free-to-play island creature game. **No ads, no real-money purchases, no bots — only real players.**
HTML5 + Tailwind CSS (CDN) + Vanilla JavaScript, backend on **Supabase** (project `coin-pet-go`).

## Play / deploy
1. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `(root)` → Save.
2. Open `https://adriancu91.github.io/coin-pet-go/`.
3. Create an account (nickname + password). Progress is saved in the cloud and on the device.

Without signing in you can still play offline (slots, eggs, island, merges); raids, tombola and friends need an account because they only involve real players.

## Files
| File | What it is |
|---|---|
| `index.html` | Page layout (5 tabs: Island, Spin, Pets, Shop, Social) |
| `css/style.css` | All visuals: tier effects, animated island, slots |
| `config.js` | Supabase URL + publishable key |
| `js/data.js` | Economy numbers (`CONFIG`), 50 pets, island themes |
| `js/core.js` | Energy, collection & merge rules, slots, raids, shop |
| `js/island.js` | Coin-Master-style island: buildings + walking animated pets |
| `js/net.js` | Accounts, cloud save, raids, friends, gifts, tombola |
| `js/ui.js` / `js/main.js` | Rendering and the game loop |
| `js/admin.js` | Admin testing panel (Social tab, admin accounts only) |
| `promo/` | TikTok ad: `ad.html` (animated source), screenshots, rendered `pocket-island-tiktok.mp4` |
| `supabase.sql` | Full database schema + server rules |

## Game rules
| System | Rule |
|---|---|
| Energy | Cap 2000 · +3 every 60 s (also offline) · friend gifts & Tombola prizes can exceed the cap |
| Island | 5 buildings × 4★ each, paid with Gold. Fully built → reward + sail to the next island (5 themes, then they repeat II, III…) |
| Animated pets | Your strongest pet of each species (up to 10) walks around the island; tap one to play |
| Slots | 1⚡ × bet (x1/x3/x10/x50): Coins, Big Bag, Jackpot, Energy, Free Egg, **Shield**, **Raid** |
| Shields | 🛡️🛡️🛡️ on the slots = +1 shield (max 3; when full you get Gold). Each shield blocks one raid on your island — the attacker gets only a small consolation. Gold spent on buildings can never be stolen |
| Merge | 2 × identical N★ → 1 × (N+1)★ — **only after the full 50-pet set at N★ is complete**. Before that, keep the duplicates |
| Rewards | New species +10⚡ · full set at tier T = 100 × T ⚡ (and unlocks merging that tier) |
| Egg gacha | 500 Gold · 50% hatch 1★ / 50% empty · 3 empties in a row → next egg guaranteed |
| Daily deals | 3 pets per day for Gold, reset at midnight |
| Raids | A random **real player** (bet up to x50 counts): steal 10–30% × bet/2 of their Gold (blocked by a shield) · 5% chance to capture one of their 3 defending pets · above your average tier (or 3★+) → three 1★ copies. The victim sees the raid next time they play |
| Invite | Real WhatsApp / share link, +50⚡ every 2 h |
| Friends | Add by nickname · send 10⚡ to each friend every 12 h |
| Tombola | Every 5 h · ticket 3⚡ · pool ÷ 3 winners × 10 · needs at least 3 real players, otherwise tickets are refunded |

## Admin
Accounts with `is_admin = true` see an **🛠️ Admin panel** at the top of the Social tab (gold, energy, pets at any tier, complete/skip islands, force the next spin). Admin accounts are hidden from the leaderboard and can't be raided.
```sql
update public.players set is_admin = true where nickname = 'Adrian91';
```

## Moderation
Ban a cheater (Supabase → SQL Editor):
```sql
update public.players set banned = true where nickname = 'TheirNick';
```
