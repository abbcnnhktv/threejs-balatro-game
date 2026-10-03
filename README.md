# Neon Joker 🃏

A small Balatro-inspired poker roguelike rendered in 3D with [three.js](https://threejs.org).

- Real 3D cards that fan out in your hand, tilt toward your cursor, wobble idly and fly across the table
- Shader-driven card faces with a glossy sheen plus **Foil**, **Holographic** and **Polychrome** joker editions
- A pixelated, psychedelic swirl background that changes colour for each blind and pulses on big scores
- Bloom, particle bursts, screen shake and synthesized sound effects (no asset files)

## Play

```bash
npm install
npm run dev      # open the printed URL
```

`npm run build` produces a static site in `dist/` (relative paths, so it works on GitHub Pages or any static host).
`npm test` runs the game-logic tests.

## How it works

Pick 1–5 cards and **Play Hand** to score poker hands as **Chips × Mult**, or **Discard** to draw new cards.
Beat each blind's target score before you run out of hands. Each ante has a Small Blind, a Big Blind and a
Boss Blind with a twist (debuffed suits, one hand only, no discards…). Clear all 8 antes to win.

Between blinds you visit the **Shop**:

- **Jokers** (up to 5) add chips, mult or ×mult whenever conditions are met. Click an owned joker in the shop to sell it.
- **Planet cards** level up a poker hand permanently.
- Earn interest: $1 for every $5 you hold (max $5), plus $1 per unused hand.

Shortcuts: `Enter` plays the selected hand, `D` discards, `Esc` closes Run Info.

## Code layout

| Path | What |
| --- | --- |
| `src/game/` | Pure game logic: cards, hand evaluation, jokers, planets, scoring, run state (unit tested) |
| `src/render/` | three.js pieces: card mesh + face shader, procedural canvas textures, background shader, particles |
| `src/main.js` | Game controller: layout, input/raycasting, scoring animations, shop and HUD |
| `src/audio.js` | Tiny WebAudio synth for all sound effects |

Adding a joker is one object in `src/game/jokers.js` with an `onCard`, `onHand` or `onRoundEnd` hook.
