# 🏝️ Pocket Island Master

A 100% free-to-play island creature-collecting web game. **No ads, no real-money purchases.**
Single file (`index.html`) — HTML5 + Tailwind CSS (CDN) + Vanilla JavaScript. Progress is saved in `localStorage`.

## Play / deploy
1. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `(root)` → Save.
2. Open `https://adriancu91.github.io/coin-pet-go/` (or just open `index.html` locally).

## Game rules
| System | Rule |
|---|---|
| Energy | Cap 2000 · +3 every 60 s (also offline) · friend gifts & Tombola prizes can exceed the cap |
| Slots | 10⚡ × bet (x1/x3/x10) · Coins, Big Bag, Jackpot, Energy, Free Egg, **Raid** |
| Creatures | 50 originals in 5 elements (Fire, Water, Grass, Electric, Psychic) |
| Merge | 2 × identical N★ → 1 × (N+1)★, up to 5★ (tap a stack twice, the habitat sheet, or Auto-Merge) |
| Tier visuals | 1★ base · 2★ larger badge · 3★ shiny palette · 4★ neon animated border · 5★ cosmic particles |
| Rewards | New species +10⚡ · full 50-set at tier T = 100 × T ⚡ (once per tier) |
| Egg gacha | 500 Gold · 50% hatch 1★ / 50% empty · 3 empties in a row → 4th egg guaranteed |
| Daily deals | 3 random creatures per day for Gold, resets at midnight |
| Raids | Steal 10–30% of target's Gold · 5% capture · captured creature above your average tier (or any 3★+) becomes **three 1★ copies** |
| Share | +50⚡, 2-hour cooldown (simulated WhatsApp/TikTok) |
| Friends | Send 10⚡ to each friend every 12 h; simulated friends gift you back |
| Tombola | Draw every 5 h · ticket 3⚡ · pool ÷ 3 winners × 10 (10 players → 100⚡ each) · bots join during the round |

All numbers live in the `CONFIG` object at the top of the script.
