// Joker editions: shiny variants with a bonus and a pricier tag.
export const EDITIONS = [
  { id: 'foil', chance: 0.12, chips: 50, label: 'Foil', desc: '+50 Chips', extra: 2 },
  { id: 'holo', chance: 0.08, mult: 10, label: 'Holographic', desc: '+10 Mult', extra: 3 },
  { id: 'poly', chance: 0.04, xmult: 1.5, label: 'Polychrome', desc: 'X1.5 Mult', extra: 5 },
];
export const EDITION_BY_ID = Object.fromEntries(EDITIONS.map((e) => [e.id, e]));
