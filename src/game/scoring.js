import { evaluateHand, handBase, HAND_TYPES } from './hands.js';
import { cardChips } from './cards.js';
import { JOKER_BY_ID } from './jokers.js';
import { EDITION_BY_ID } from './editions.js';

/**
 * Pure scoring: returns the final numbers plus an ordered list of steps the
 * renderer can replay as animations.
 *
 * step = { kind: 'base'|'card'|'joker'|'debuff', ref, chips?, mult?, xmult?, money?, total: {chips, mult} }
 */
export function scoreHand(state, played, held) {
  const { type, scoring } = evaluateHand(played);
  const level = state.handLevels[type] ?? 1;
  let { chips, mult } = handBase(type, level);

  const boss = state.blind?.boss;
  if (boss?.id === 'flint') {
    chips = Math.max(1, Math.round(chips / 2));
    mult = Math.max(1, Math.round(mult / 2));
  }

  const steps = [{ kind: 'base', ref: type, chips, mult, total: { chips, mult } }];
  let money = 0;

  const apply = (kind, ref, eff, on = null) => {
    if (!eff) return;
    if (eff.chips) chips += eff.chips;
    if (eff.mult) mult += eff.mult;
    if (eff.xmult) mult *= eff.xmult;
    if (eff.money) money += eff.money;
    steps.push({ kind, ref, on, ...eff, total: { chips, mult } });
  };

  const ctx = { state, played, held, scoring, type };
  const jokers = state.jokers.map((j) => ({ inst: j, def: JOKER_BY_ID[j.id] }));

  for (const card of scoring) {
    if (isDebuffed(state, card)) {
      steps.push({ kind: 'debuff', ref: card, total: { chips, mult } });
      continue;
    }
    apply('card', card, { chips: cardChips(card) });
    for (const { inst, def } of jokers) {
      if (def.onCard) apply('joker', inst, def.onCard(card, ctx), card);
    }
  }

  for (const { inst, def } of jokers) {
    if (def.onHand) apply('joker', inst, def.onHand(ctx));
    const ed = inst.edition && EDITION_BY_ID[inst.edition];
    if (ed) apply('joker', inst, { chips: ed.chips, mult: ed.mult, xmult: ed.xmult });
  }

  mult = Math.round(mult * 100) / 100;
  return {
    type,
    name: HAND_TYPES[type].name,
    level,
    scoring,
    steps,
    chips,
    mult,
    money,
    total: Math.floor(chips * mult),
  };
}

export function isDebuffed(state, card) {
  const boss = state.blind?.boss;
  return !!boss?.debuffSuit && card.suit === boss.debuffSuit;
}

/** Preview of the base hand only (shown while selecting cards). */
export function previewHand(state, cards) {
  if (!cards.length) return null;
  const { type } = evaluateHand(cards);
  const level = state.handLevels[type] ?? 1;
  return { type, name: HAND_TYPES[type].name, level, ...handBase(type, level) };
}
