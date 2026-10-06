import { describe, expect, it } from 'vitest';
import { blackoutLoss, buy, buyPrice, formatMoney, sell, sellPrice, SHOPS, trainerPrize, VALUE, wildPrize } from '../src/shared/economy';
import { RECIPES } from '../src/shared/crafting';
import { ITEMS } from '../src/shared/items';

describe('money and shops', () => {
  it('every priced item exists, and key items have no price', () => {
    for (const id of Object.keys(VALUE)) expect(ITEMS[id], id).toBeDefined();
    for (const it of Object.values(ITEMS).filter((i) => i.category === 'key')) expect(VALUE[it.id]).toBeUndefined();
    for (const shop of Object.values(SHOPS)) for (const id of shop.stock) expect(buyPrice(id), id).not.toBeNull();
  });

  it('prices are steep: a Poke Ball is 600 and shops pay a quarter back', () => {
    expect(buyPrice('poke-ball')).toBe(600);
    expect(buyPrice('bandage')).toBe(450);
    expect(sellPrice('poke-ball')).toBe(150);
    expect(sellPrice('wood')).toBe(5);
    expect(sellPrice('trainer-journal')).toBeNull();
    // Selling never pays more than buying costs.
    for (const id of Object.keys(VALUE)) expect(sellPrice(id)!).toBeLessThan(buyPrice(id)!);
  });

  it('crafting and selling never beats the shop price of what you made', () => {
    for (const r of RECIPES) {
      const made = (sellPrice(r.out) ?? 0) * r.count;
      const shop = (buyPrice(r.out) ?? Infinity) * r.count;
      expect(made, r.id).toBeLessThan(shop);
    }
  });

  it('buys only what you can afford, and sells only what you have', () => {
    const wallet = { money: 1000 }, bag: Record<string, number> = { wood: 3 };
    expect(buy(wallet, bag, 'poke-ball', 2)).toBe(false);
    expect(wallet.money).toBe(1000);
    expect(buy(wallet, bag, 'poke-ball', 1)).toBe(true);
    expect(wallet.money).toBe(400);
    expect(bag['poke-ball']).toBe(1);
    expect(sell(wallet, bag, 'wood', 10)).toBe(15);
    expect(bag.wood).toBeUndefined();
    expect(sell(wallet, bag, 'wood', 1)).toBe(0);
    expect(wallet.money).toBe(415);
  });

  it('prizes: about 50 a wild Pokemon early on, a few hundred for a trainer', () => {
    expect(wildPrize([5, 5])).toBe(100);
    expect(wildPrize([])).toBe(0);
    expect(wildPrize([15])).toBeGreaterThan(wildPrize([5]));
    expect(trainerPrize(5, false)).toBe(500);
    expect(trainerPrize(5, true)).toBeLessThan(trainerPrize(5, false));
    // A Poke Ball takes several wild wins.
    expect(buyPrice('poke-ball')! / wildPrize([5, 5])).toBeGreaterThanOrEqual(5);
  });

  it('a blackout costs a tenth, and money reads like the games', () => {
    expect(blackoutLoss(1234)).toBe(123);
    expect(blackoutLoss(5)).toBe(0);
    expect(formatMoney(12500)).toBe('₽12,500');
  });
});
