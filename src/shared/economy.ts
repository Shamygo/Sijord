/**
 * Money and shops (DESIGN §6.7). Prices sit at two to three times the mainline games and shops
 * buy back at a quarter of an item's value, so supplies never come easily: a Poke Ball costs
 * about six wild wins. Money is per player, like the bag.
 */
export const CURRENCY = '₽';

/** What a new trainer (or an older save) starts with. */
export const STARTING_MONEY = 500;

/** Shops buy anything (but key items) back at this share of its value. */
export const SELL_RATE = 0.25;

/** Each item's value: shops charge this, and pay SELL_RATE of it. Missing: it can't be sold. */
export const VALUE: Record<string, number> = {
  'poke-ball': 600,
  'great-ball': 1500,
  'ultra-ball': 3600,
  bandage: 450,
  treat: 350,
  'bramble-berry': 120,
  'water-flask': 120,
  'mushroom-skewer': 180,
  'hearty-stew': 320,
  canteen: 1200,
  lantern: 1600,
  stardust: 1200,
  'star-piece': 4800,
  'woven-cloth': 80,
  'cloth-cap': 500,
  'cloth-trousers': 800,
  'cloth-tunic': 1100,
  'stone-sickle': 280,
  'stone-hatchet': 300,
  'stone-pick': 320,
  'red-apricorn': 120,
  'copper-ore': 200,
  'wild-mushroom': 30,
  'river-water': 8,
  wood: 20,
  stone: 20,
  fiber: 16,
};

export type ShopId = 'field-supplies' | 'apothecary' | 'wayfarer-inn' | 'clothier';

export interface Shop {
  id: ShopId;
  name: string;
  /** The E prompt at the door. */
  prompt: string;
  /** One line from behind the counter. */
  greeting: string;
  /** Item ids for sale, in display order. */
  stock: string[];
}

export const SHOPS: Record<ShopId, Shop> = {
  'field-supplies': {
    id: 'field-supplies', name: 'Field Supplies', prompt: 'Shop at Field Supplies',
    greeting: 'Balls and gear for the road. Prices are what they are: the supply carts don\'t come often.',
    stock: ['poke-ball', 'treat', 'canteen', 'lantern'],
  },
  apothecary: {
    id: 'apothecary', name: 'Apothecary', prompt: 'Visit the Apothecary',
    greeting: 'Potions brewed fresh, berries from the hedgerows. Mind your Pokemon out there.',
    stock: ['bandage', 'bramble-berry'],
  },
  clothier: {
    id: 'clothier', name: 'The Clothier', prompt: 'Visit The Clothier',
    greeting: 'Padded cloth, stitched to last. It won\'t stop a charging Pokemon, but it\'ll soften the blow.',
    stock: ['cloth-cap', 'cloth-trousers', 'cloth-tunic', 'woven-cloth'],
  },
  'wayfarer-inn': {
    id: 'wayfarer-inn', name: 'Wayfarer Inn', prompt: 'Order food at the Wayfarer Inn',
    greeting: 'Hot food and clean water for travellers. Eat before you head out.',
    stock: ['mushroom-skewer', 'water-flask'],
  },
};

export function buyPrice(id: string): number | null {
  return VALUE[id] ?? null;
}

export function sellPrice(id: string): number | null {
  const v = VALUE[id];
  return v === undefined ? null : Math.max(1, Math.floor(v * SELL_RATE));
}

/** Buy `n` of an item into the bag. Returns false (and changes nothing) if you can't afford it. */
export function buy(wallet: { money: number }, bag: Record<string, number>, id: string, n = 1): boolean {
  const price = buyPrice(id);
  if (price === null || n < 1 || wallet.money < price * n) return false;
  wallet.money -= price * n;
  bag[id] = (bag[id] ?? 0) + n;
  return true;
}

/** Sell `n` of an item from the bag. Returns the money made (0 if nothing was sold). */
export function sell(wallet: { money: number }, bag: Record<string, number>, id: string, n = 1): number {
  const price = sellPrice(id), have = bag[id] ?? 0;
  const k = Math.min(n, have);
  if (price === null || k < 1) return 0;
  bag[id] = have - k;
  if (!bag[id]) delete bag[id];
  wallet.money += price * k;
  return price * k;
}

/** Prize money for a won wild battle: a little per Pokemon beaten, more for higher levels. */
export function wildPrize(levels: number[]): number {
  return levels.reduce((sum, l) => sum + 10 + 8 * l, 0);
}

/** Prize money for beating a trainer: their best Pokemon's level, scaled; less for a rematch. */
export function trainerPrize(topLevel: number, rematch: boolean): number {
  return Math.round((rematch ? 30 : 100) * topLevel);
}

/** A blackout costs a tenth of what you carry. */
export function blackoutLoss(money: number): number {
  return Math.floor(money * 0.1);
}

/** "₽1,250" */
export function formatMoney(n: number): string {
  return `${CURRENCY}${Math.floor(n).toLocaleString('en-US')}`;
}
