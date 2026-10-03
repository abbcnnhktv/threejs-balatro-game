export const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
export const SUIT_SYMBOL = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
export const SUIT_COLOR = { spades: '#2b2d5c', hearts: '#e2384d', clubs: '#1f7a6d', diamonds: '#f08a24' };

// rank value 2..14 (14 = Ace)
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function rankLabel(rank) {
  return RANK_LABEL[rank] ?? String(rank);
}

export function cardChips(card) {
  if (card.rank === 14) return 11;
  if (card.rank >= 10) return 10;
  return card.rank;
}

export function isFace(card) {
  return card.rank >= 11 && card.rank <= 13;
}

let nextId = 1;

export function makeCard(rank, suit) {
  return { id: `c${nextId++}`, rank, suit };
}

export function makeDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(makeCard(rank, suit));
  return deck;
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function sortCards(cards, mode = 'rank') {
  const suitIdx = (c) => SUITS.indexOf(c.suit);
  return [...cards].sort((a, b) =>
    mode === 'rank'
      ? b.rank - a.rank || suitIdx(a) - suitIdx(b)
      : suitIdx(a) - suitIdx(b) || b.rank - a.rank,
  );
}
