import { handContains } from './hands.js';
import { isFace } from './cards.js';

// Each joker may define:
//   onCard(card, ctx)  -> effect, triggered for every scoring card
//   onHand(ctx)        -> effect, triggered once after all cards scored
//   onRoundEnd(state)  -> dollars earned at cash-out
// An effect is { chips?, mult?, xmult?, money? }.
// `art` drives the procedural joker portrait: [emoji, bgColorA, bgColorB].

const suitJoker = (id, name, suit, emoji, a, b) => ({
  id,
  name,
  desc: `+3 Mult for each scored ${suit[0].toUpperCase() + suit.slice(1, -1)}`,
  cost: 5,
  rarity: 'common',
  art: [emoji, a, b],
  onCard: (card) => (card.suit === suit ? { mult: 3 } : null),
});

const handJoker = (id, name, type, label, eff, emoji, a, b, cost = 4) => ({
  id,
  name,
  desc: `${eff.mult ? `+${eff.mult} Mult` : eff.chips ? `+${eff.chips} Chips` : `X${eff.xmult} Mult`} if hand contains a ${label}`,
  cost,
  rarity: eff.xmult ? 'rare' : 'common',
  art: [emoji, a, b],
  onHand: (ctx) => (handContains(ctx.played, type) ? eff : null),
});

export const JOKERS = [
  {
    id: 'joker',
    name: 'Joker',
    desc: '+4 Mult',
    cost: 2,
    rarity: 'common',
    art: ['🃏', '#ff4d6d', '#ffb703'],
    onHand: () => ({ mult: 4 }),
  },
  suitJoker('greedy', 'Greedy Joker', 'diamonds', '💰', '#f08a24', '#ffd166'),
  suitJoker('lusty', 'Lusty Joker', 'hearts', '💋', '#e2384d', '#ff8fab'),
  suitJoker('wrathful', 'Wrathful Joker', 'spades', '😠', '#2b2d5c', '#7b6cf6'),
  suitJoker('gluttonous', 'Gluttonous Joker', 'clubs', '🍗', '#1f7a6d', '#80ed99'),
  handJoker('jolly', 'Jolly Joker', 'pair', 'Pair', { mult: 8 }, '😄', '#ff595e', '#ffca3a', 3),
  handJoker('zany', 'Zany Joker', 'three_kind', 'Three of a Kind', { mult: 12 }, '🤪', '#8338ec', '#ff006e'),
  handJoker('mad', 'Mad Joker', 'two_pair', 'Two Pair', { mult: 10 }, '😡', '#d00000', '#ffba08'),
  handJoker('crazy', 'Crazy Joker', 'straight', 'Straight', { mult: 12 }, '🌀', '#3a86ff', '#8338ec'),
  handJoker('droll', 'Droll Joker', 'flush', 'Flush', { mult: 10 }, '🎭', '#06d6a0', '#118ab2'),
  handJoker('sly', 'Sly Joker', 'pair', 'Pair', { chips: 50 }, '😏', '#4361ee', '#4cc9f0', 3),
  handJoker('duo', 'The Duo', 'pair', 'Pair', { xmult: 2 }, '👯', '#f72585', '#7209b7', 8),
  handJoker('trio', 'The Trio', 'three_kind', 'Three of a Kind', { xmult: 3 }, '🔱', '#ff9e00', '#ff0054', 8),
  {
    id: 'half',
    name: 'Half Joker',
    desc: '+20 Mult if played hand has 3 or fewer cards',
    cost: 5,
    rarity: 'common',
    art: ['🌗', '#5a189a', '#e0aaff'],
    onHand: (ctx) => (ctx.played.length <= 3 ? { mult: 20 } : null),
  },
  {
    id: 'banner',
    name: 'Banner',
    desc: '+30 Chips for each remaining discard',
    cost: 5,
    rarity: 'common',
    art: ['🚩', '#c1121f', '#fdf0d5'],
    onHand: (ctx) => (ctx.state.discards > 0 ? { chips: 30 * ctx.state.discards } : null),
  },
  {
    id: 'summit',
    name: 'Mystic Summit',
    desc: '+15 Mult when 0 discards remaining',
    cost: 5,
    rarity: 'common',
    art: ['🏔️', '#48cae4', '#023e8a'],
    onHand: (ctx) => (ctx.state.discards === 0 ? { mult: 15 } : null),
  },
  {
    id: 'fibonacci',
    name: 'Fibonacci',
    desc: 'Each scored A, 2, 3, 5 or 8 gives +8 Mult',
    cost: 8,
    rarity: 'uncommon',
    art: ['🐚', '#e9c46a', '#e76f51'],
    onCard: (card) => ([14, 2, 3, 5, 8].includes(card.rank) ? { mult: 8 } : null),
  },
  {
    id: 'scary',
    name: 'Scary Face',
    desc: 'Scored face cards give +30 Chips',
    cost: 4,
    rarity: 'common',
    art: ['👻', '#212529', '#adb5bd'],
    onCard: (card) => (isFace(card) ? { chips: 30 } : null),
  },
  {
    id: 'even',
    name: 'Even Steven',
    desc: 'Scored 10, 8, 6, 4, 2 give +4 Mult',
    cost: 4,
    rarity: 'common',
    art: ['⚖️', '#2a9d8f', '#e9f5db'],
    onCard: (card) => (card.rank <= 10 && card.rank % 2 === 0 ? { mult: 4 } : null),
  },
  {
    id: 'odd',
    name: 'Odd Todd',
    desc: 'Scored A, 9, 7, 5, 3 give +31 Chips',
    cost: 4,
    rarity: 'common',
    art: ['🎩', '#6a4c93', '#ffd6ff'],
    onCard: (card) => (card.rank === 14 || (card.rank <= 9 && card.rank % 2 === 1) ? { chips: 31 } : null),
  },
  {
    id: 'photo',
    name: 'Photograph',
    desc: 'First scored face card gives X2 Mult',
    cost: 5,
    rarity: 'uncommon',
    art: ['📸', '#343a40', '#ffd60a'],
    onCard: (card, ctx) => (isFace(card) && ctx.scoring.find(isFace) === card ? { xmult: 2 } : null),
  },
  {
    id: 'blackboard',
    name: 'Blackboard',
    desc: 'X3 Mult if all held cards are ♠ or ♣',
    cost: 6,
    rarity: 'uncommon',
    art: ['🖤', '#111111', '#495057'],
    onHand: (ctx) =>
      ctx.held.every((c) => c.suit === 'spades' || c.suit === 'clubs') ? { xmult: 3 } : null,
  },
  {
    id: 'abstract',
    name: 'Abstract Joker',
    desc: '+3 Mult for each Joker you own',
    cost: 4,
    rarity: 'common',
    art: ['🔷', '#00b4d8', '#f72585'],
    onHand: (ctx) => ({ mult: 3 * ctx.state.jokers.length }),
  },
  {
    id: 'bull',
    name: 'Bull',
    desc: '+2 Chips for each $1 you have',
    cost: 6,
    rarity: 'uncommon',
    art: ['🐂', '#9d0208', '#f48c06'],
    onHand: (ctx) => (ctx.state.money > 0 ? { chips: 2 * ctx.state.money } : null),
  },
  {
    id: 'cavendish',
    name: 'Cavendish',
    desc: 'X3 Mult',
    cost: 9,
    rarity: 'rare',
    art: ['🍌', '#ffe066', '#3a5a40'],
    onHand: () => ({ xmult: 3 }),
  },
  {
    id: 'golden',
    name: 'Golden Joker',
    desc: 'Earn $4 at end of round',
    cost: 6,
    rarity: 'common',
    art: ['🏆', '#ffbe0b', '#fb5607'],
    onRoundEnd: () => 4,
  },
];

export const JOKER_BY_ID = Object.fromEntries(JOKERS.map((j) => [j.id, j]));

let jokerUid = 1;
export function makeJokerInstance(def, edition = null) {
  return { uid: `j${jokerUid++}`, id: def.id, edition };
}
