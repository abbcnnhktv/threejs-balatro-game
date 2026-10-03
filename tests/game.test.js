import { describe, it, expect } from 'vitest';
import { evaluateHand, handContains } from '../src/game/hands.js';
import { scoreHand } from '../src/game/scoring.js';
import { newRun, startBlind, drawToHand, cashOut, advanceBlind, openShop, buyItem, sellJoker } from '../src/game/state.js';
import { makeJokerInstance, JOKER_BY_ID } from '../src/game/jokers.js';

const c = (rank, suit = 'spades') => ({ id: `${rank}${suit}${Math.random()}`, rank, suit });

describe('evaluateHand', () => {
  it.each([
    [[c(14), c(13), c(12), c(11), c(10)], 'straight_flush'],
    [[c(9), c(9, 'hearts'), c(9, 'clubs'), c(9, 'diamonds'), c(2)], 'four_kind'],
    [[c(9), c(9, 'hearts'), c(9, 'clubs'), c(4, 'diamonds'), c(4)], 'full_house'],
    [[c(2), c(5), c(9), c(11), c(13)], 'flush'],
    [[c(14), c(2, 'hearts'), c(3), c(4), c(5)], 'straight'],
    [[c(7), c(7, 'hearts'), c(7, 'clubs')], 'three_kind'],
    [[c(7), c(7, 'hearts'), c(3, 'clubs'), c(3)], 'two_pair'],
    [[c(7), c(7, 'hearts')], 'pair'],
    [[c(7), c(13, 'hearts'), c(2)], 'high_card'],
  ])('%#: detects %s', (cards, type) => {
    expect(evaluateHand(cards).type).toBe(type);
  });

  it('only scores the relevant cards for a pair', () => {
    const pair = [c(7), c(7, 'hearts')];
    const res = evaluateHand([...pair, c(2, 'clubs'), c(13, 'hearts')]);
    expect(res.scoring).toEqual(expect.arrayContaining(pair));
    expect(res.scoring).toHaveLength(2);
  });

  it('a full house contains a pair', () => {
    expect(handContains([c(9), c(9, 'hearts'), c(9, 'clubs'), c(4), c(4, 'hearts')], 'pair')).toBe(true);
  });
});

describe('scoreHand', () => {
  it('scores a plain pair of aces: (10 + 11 + 11) x 2', () => {
    const state = newRun();
    const res = scoreHand(state, [c(14), c(14, 'hearts')], []);
    expect(res.chips).toBe(32);
    expect(res.mult).toBe(2);
    expect(res.total).toBe(64);
  });

  it('applies jokers in order (+mult before xmult)', () => {
    const state = newRun();
    state.jokers = [makeJokerInstance(JOKER_BY_ID.joker), makeJokerInstance(JOKER_BY_ID.duo)];
    const res = scoreHand(state, [c(14), c(14, 'hearts')], []);
    expect(res.mult).toBe((2 + 4) * 2);
    expect(res.total).toBe(32 * 12);
  });

  it('debuffs cards of the boss suit', () => {
    const state = newRun();
    state.blind = { boss: { id: 'club', debuffSuit: 'clubs' } };
    const res = scoreHand(state, [c(14, 'clubs'), c(14, 'hearts')], []);
    expect(res.chips).toBe(10 + 11);
  });

  it('applies joker editions', () => {
    const state = newRun();
    state.jokers = [makeJokerInstance(JOKER_BY_ID.joker, 'foil')];
    const res = scoreHand(state, [c(2)], []);
    expect(res.chips).toBe(5 + 2 + 50);
  });
});

describe('run flow', () => {
  it('plays through a blind and into the shop', () => {
    const state = newRun(() => 0.3);
    startBlind(state);
    expect(drawToHand(state)).toHaveLength(8);
    expect(state.drawPile).toHaveLength(44);
    state.hands = 2;
    const before = state.money;
    const { total } = cashOut(state);
    expect(total).toBe(3 + 2);
    expect(state.money).toBe(before + total);
    expect(advanceBlind(state)).toBe('shop');
    openShop(state);
    state.money = 100;
    const joker = state.shop.items.find((i) => i.type === 'joker');
    expect(buyItem(state, joker)).toBe(true);
    expect(state.jokers).toHaveLength(1);
    expect(sellJoker(state, state.jokers[0])).toBeGreaterThan(0);
    expect(state.jokers).toHaveLength(0);
  });
});
