// Poker hand definitions & evaluation.
export const HAND_TYPES = {
  straight_flush: { name: 'Straight Flush', chips: 100, mult: 8, lvChips: 40, lvMult: 4 },
  four_kind: { name: 'Four of a Kind', chips: 60, mult: 7, lvChips: 30, lvMult: 3 },
  full_house: { name: 'Full House', chips: 40, mult: 4, lvChips: 25, lvMult: 2 },
  flush: { name: 'Flush', chips: 35, mult: 4, lvChips: 15, lvMult: 2 },
  straight: { name: 'Straight', chips: 30, mult: 4, lvChips: 30, lvMult: 3 },
  three_kind: { name: 'Three of a Kind', chips: 30, mult: 3, lvChips: 20, lvMult: 2 },
  two_pair: { name: 'Two Pair', chips: 20, mult: 2, lvChips: 20, lvMult: 1 },
  pair: { name: 'Pair', chips: 10, mult: 2, lvChips: 15, lvMult: 1 },
  high_card: { name: 'High Card', chips: 5, mult: 1, lvChips: 10, lvMult: 1 },
};

export const HAND_ORDER = Object.keys(HAND_TYPES);

export function handBase(type, level = 1) {
  const h = HAND_TYPES[type];
  return { chips: h.chips + h.lvChips * (level - 1), mult: h.mult + h.lvMult * (level - 1) };
}

function groupByRank(cards) {
  const map = new Map();
  for (const c of cards) {
    if (!map.has(c.rank)) map.set(c.rank, []);
    map.get(c.rank).push(c);
  }
  // biggest groups first, then highest rank
  return [...map.values()].sort((a, b) => b.length - a.length || b[0].rank - a[0].rank);
}

function isFlush(cards) {
  return cards.length === 5 && cards.every((c) => c.suit === cards[0].suit);
}

function isStraight(cards) {
  if (cards.length !== 5) return false;
  const ranks = [...new Set(cards.map((c) => c.rank))].sort((a, b) => a - b);
  if (ranks.length !== 5) return false;
  if (ranks[4] - ranks[0] === 4) return true;
  // A-2-3-4-5 wheel
  return ranks.join() === '2,3,4,5,14';
}

/**
 * Evaluate 1-5 played cards.
 * @returns {{ type: string, scoring: object[] }} scoring = cards that count toward the hand
 */
export function evaluateHand(cards) {
  if (!cards.length) return { type: null, scoring: [] };
  const groups = groupByRank(cards);
  const flush = isFlush(cards);
  const straight = isStraight(cards);

  if (flush && straight) return { type: 'straight_flush', scoring: [...cards] };
  if (groups[0].length === 4) return { type: 'four_kind', scoring: groups[0] };
  if (groups[0].length === 3 && groups[1]?.length === 2)
    return { type: 'full_house', scoring: [...cards] };
  if (flush) return { type: 'flush', scoring: [...cards] };
  if (straight) return { type: 'straight', scoring: [...cards] };
  if (groups[0].length === 3) return { type: 'three_kind', scoring: groups[0] };
  if (groups[0].length === 2 && groups[1]?.length === 2)
    return { type: 'two_pair', scoring: [...groups[0], ...groups[1]] };
  if (groups[0].length === 2) return { type: 'pair', scoring: groups[0] };
  return { type: 'high_card', scoring: [groups[0][0]] };
}

/** True if the hand "contains" a given type (e.g. a Full House contains a Pair). */
export function handContains(cards, type) {
  const groups = groupByRank(cards);
  const sizes = groups.map((g) => g.length);
  switch (type) {
    case 'pair':
      return sizes[0] >= 2;
    case 'two_pair':
      return sizes[0] >= 2 && sizes[1] >= 2;
    case 'three_kind':
      return sizes[0] >= 3;
    case 'four_kind':
      return sizes[0] >= 4;
    case 'straight':
      return isStraight(cards);
    case 'flush':
      return isFlush(cards);
    default:
      return evaluateHand(cards).type === type;
  }
}
