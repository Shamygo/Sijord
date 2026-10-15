import type { TypeName } from './battle/types';
import type { FoodValue } from './survival';

export type ItemCategory = 'items' | 'food' | 'balls' | 'battle' | 'materials' | 'tools' | 'gear' | 'key';

/** Where a piece of armour is worn (DESIGN §6.2; the two accessory slots come later). */
export type ArmourSlot = 'head' | 'body' | 'legs';

export interface ItemInfo {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  /** Short glyph shown in the bag grid until item art exists. */
  icon: string;
  sprite?: string;
  heal?: number;
  /** Eaten or drunk by the trainer (hunger and thirst, DESIGN §6.1). */
  food?: FoodValue;
  /**
   * Worn by the trainer (DESIGN §5.4): Defence softens hits from charging Pokemon, `resist` takes
   * a share off hits of a type, Calm makes wild Pokemon slower to turn on you, and Warmth (°C)
   * keeps out the cold. Added up in `armour.ts`.
   */
  armour?: { slot: ArmourSlot; defence: number; warmth?: number; calm?: number; resist?: Partial<Record<TypeName, number>> };
  /** Given to a Pokémon to hold in battle (the effect lives in the battle engine). */
  held?: true;
}

export const ITEM_CATEGORIES: { id: ItemCategory; label: string }[] = [
  { id: 'items', label: 'Items' },
  { id: 'food', label: 'Food' },
  { id: 'balls', label: 'Balls' },
  { id: 'battle', label: 'Battle' },
  { id: 'materials', label: 'Materials' },
  { id: 'tools', label: 'Tools' },
  { id: 'gear', label: 'Gear' },
  { id: 'key', label: 'Key items' },
];

export const ITEMS: Record<string, ItemInfo> = {
  'bramble-berry': {
    id: 'bramble-berry', name: 'Oran Berry', category: 'items', icon: '🫐', sprite: 'oran-berry', heal:10, food: { hunger: 6, thirst: 2 },
    description: 'A berry that restores 10 HP to one Pokémon. A trainer can eat it too, though it barely takes the edge off.',
  },
  'water-flask': {
    id: 'water-flask', name: 'Fresh Water', category: 'items', icon: '💧', sprite:'fresh-water', heal:30, food: { thirst: 40 },
    description: 'Clean, boiled drinking water. Quenches your thirst, or restores 30 HP to one Pokémon.',
  },
  'bandage': {
    id: 'bandage', name: 'Potion', category: 'items', icon: '🩹', sprite:'potion', heal:20,
    description: 'A spray medicine that restores 20 HP to one Pokémon. In a pinch it also patches up a trainer (30 HP).',
  },
  'treat': {
    id: 'treat', name: 'Treat', category: 'items', icon: '🍪', sprite: 'lava-cookie',
    description: 'A crumbly honey biscuit Pokémon can\'t resist. Throw it while aiming: an angry Pokémon calms down to eat it, and a calm one is too busy eating to notice you.',
  },
  'river-water': {
    id: 'river-water', name: 'River Water', category: 'food', icon: '💧', sprite: 'mystic-water', food: { thirst: 30, queasy: 0.35 },
    description: 'Water scooped into your canteen from a river or lake. Drinkable, but it may leave you queasy. Boil it at a campfire to be safe.',
  },
  'wild-mushroom': {
    id: 'wild-mushroom', name: 'Wild Mushroom', category: 'food', icon: '🍄', sprite: 'tiny-mushroom', food: { hunger: 6, queasy: 0.3 },
    description: 'Picked from the forest floor. Edible raw if you must, but it may leave you queasy. Much better grilled at a campfire.',
  },
  'mushroom-skewer': {
    id: 'mushroom-skewer', name: 'Mushroom Skewer', category: 'food', icon: '🍢', food: { hunger: 35 },
    description: 'Wild mushrooms grilled over a campfire on a stick. A proper meal.',
  },
  'hearty-stew': {
    id: 'hearty-stew', name: 'Hearty Stew', category: 'food', icon: '🍲', food: { hunger: 60, thirst: 20 },
    description: "Gudrun's stew: wild mushrooms and Oran Berries simmered in river water. It sticks to your ribs and wets your whistle.",
  },
  'poke-ball': {
    id: 'poke-ball', name: 'Poke Ball', category: 'balls', icon: '◓', sprite:'poke-ball',
    description: 'A standard ball. Works best on Pokemon weakened in battle and close to your level.',
  },
  'great-ball': {
    id: 'great-ball', name: 'Great Ball', category: 'balls', icon: '◓', sprite: 'great-ball',
    description: 'A better ball with a stronger seal. Half again as likely to hold as a Poke Ball.',
  },
  'ultra-ball': {
    id: 'ultra-ball', name: 'Ultra Ball', category: 'balls', icon: '◓', sprite: 'ultra-ball',
    description: 'A high-grade ball. Twice as likely to hold as a Poke Ball.',
  },
  'wood': {
    id: 'wood', name: 'Wood', category: 'materials', icon: '🪵',
    description: 'Gathered from trees: fallen branches by hand, more with a hatchet. Used for tools.',
  },
  'stone': {
    id: 'stone', name: 'Stone', category: 'materials', icon: '🪨', sprite: 'common-stone',
    description: 'Picked up from the ground, or broken off boulders with a pick. Used for tools.',
  },
  'fiber': {
    id: 'fiber', name: 'Plant Fiber', category: 'materials', icon: '🌾',
    description: 'Pulled from bushes. Twisted into rope and springs for tools and Poke Balls.',
  },
  'woven-cloth': {
    id: 'woven-cloth', name: 'Woven Cloth', category: 'materials', icon: '🧵',
    description: 'Plant fibre twisted and woven by hand into a coarse cloth. Sewn into clothes at the workbench.',
  },
  'red-apricorn': {
    id: 'red-apricorn', name: 'Red Apricorn', category: 'materials', icon: '🍎', sprite: 'red-apricorn',
    description: 'A hard red fruit from apricorn trees. Hollowed out, it becomes the shell of a Poke Ball.',
  },
  'copper-ore': {
    id: 'copper-ore', name: 'Copper Ore', category: 'materials', icon: '🟠', sprite: 'relic-copper',
    description: 'Mined from copper veins with a pick. Hammered into the clasp of a Poke Ball.',
  },
  'stone-hatchet': {
    id: 'stone-hatchet', name: 'Stone Hatchet', category: 'tools', icon: '🪓',
    description: 'A sharpened stone lashed to a handle. Chops a tree for 2-3 Wood instead of a fallen branch. Wears out after 30 uses.',
  },
  'stone-pick': {
    id: 'stone-pick', name: 'Stone Pick', category: 'tools', icon: '⛏',
    description: 'A heavy stone point on a handle. Mines copper veins and breaks stone off boulders. Wears out after 30 uses.',
  },
  'stone-sickle': {
    id: 'stone-sickle', name: 'Stone Sickle', category: 'tools', icon: '🌙',
    description: 'A curved flake of stone on a short handle. Cuts 2-3 Plant Fiber from a bush instead of 1-2, and quicker. Wears out after 30 uses.',
  },
  'cloth-cap': {
    id: 'cloth-cap', name: 'Cloth Cap', category: 'gear', icon: '🧢', armour: { slot: 'head', defence: 3, warmth: 1 },
    description: 'A padded cloth cap. Takes a little of the sting out of a charging Pokémon, and a little of the chill out of the night.',
  },
  'cloth-tunic': {
    id: 'cloth-tunic', name: 'Cloth Tunic', category: 'gear', icon: '👕', armour: { slot: 'body', defence: 7, warmth: 2 },
    description: 'A quilted tunic of woven cloth, worn under your jacket. Warm enough for a mild night.',
  },
  'cloth-trousers': {
    id: 'cloth-trousers', name: 'Cloth Trousers', category: 'gear', icon: '👖', armour: { slot: 'legs', defence: 5, warmth: 1 },
    description: 'Hard-wearing trousers with padded knees.',
  },
  'leather-hood': {
    id: 'leather-hood', name: 'Leather Hood', category: 'gear', icon: '🪖', armour: { slot: 'head', defence: 6, warmth: 2, calm: 0.03, resist: { poison: 0.1, bug: 0.1 } },
    description: 'A lined hood of hide leather. It smells of the wild, so wild Pokémon are slower to take you for a threat, and fangs and stings struggle to get through.',
  },
  'leather-vest': {
    id: 'leather-vest', name: 'Leather Vest', category: 'gear', icon: '🦺', armour: { slot: 'body', defence: 12, warmth: 4, calm: 0.05, resist: { poison: 0.2, bug: 0.2 } },
    description: 'A thick vest of stitched hide, fleece side in. Keeps out the night cold, Zubat fangs and Weedle stings alike.',
  },
  'leather-leggings': {
    id: 'leather-leggings', name: 'Leather Leggings', category: 'gear', icon: '🥾', armour: { slot: 'legs', defence: 9, warmth: 3, calm: 0.04, resist: { poison: 0.1, bug: 0.1 } },
    description: 'Hide leggings over your trousers, laced at the side, with boots to match. Snakes and stingers aim low.',
  },
  'hide': {
    id: 'hide', name: 'Hide', category: 'materials', icon: '🟫',
    description: 'A tough scrap of shed hide. Furred and scaly wild Pokémon sometimes leave one behind when you beat them in battle. Sewn into leather at the workbench.',
  },
  'canteen': {
    id: 'canteen', name: 'Canteen', category: 'tools', icon: '🍶',
    description: 'A copper-lined flask. Each one carries three drinks: fill it at any river, lake or pond.',
  },
  'lantern': {
    id: 'lantern', name: 'Lantern', category: 'tools', icon: '🏮',
    description: 'A copper lantern that hangs from your belt. Press L to light it after dark, and again to put it out. It holds about 20 minutes of oil, then it\'s spent. By its light you can find fallen stardust.',
  },
  'stardust': {
    id: 'stardust', name: 'Stardust', category: 'materials', icon: '✨', sprite: 'stardust',
    description: 'Fine red sand that falls on the meadows at night and glitters in the grass. Only found by lantern light, and gone by dawn. The shops pay well for it.',
  },
  'star-piece': {
    id: 'star-piece', name: 'Star Piece', category: 'materials', icon: '⭐', sprite: 'star-piece',
    description: 'A shard of a fallen star, found by lantern light on rare nights. Worth a great deal at the shops.',
  },
  'trainer-journal': {
    id: 'trainer-journal', name: 'Trainer Journal', category: 'key', icon: '📓', sprite:'fashion-case',
    description: 'Your notes on the journey so far. Quests are tracked here.',
  },
  'region-map': {
    id: 'region-map', name: 'Sijord Map', category: 'key', icon: '🗺', sprite:'town-map',
    description: 'A hand-drawn map of the Sijord region from Professor Hazel. Fills in as you explore.',
  },
  'leftovers': {
    id: 'leftovers', name: 'Leftovers', category: 'battle', icon: '🍎', sprite: 'leftovers', held: true,
    description: 'The held Pokémon restores 1/16 of its max HP at the end of every turn.',
  },
  'life-orb': {
    id: 'life-orb', name: 'Life Orb', category: 'battle', icon: '🔮', sprite: 'life-orb', held: true,
    description: 'Moves hit 30% harder, but every hit costs the holder 1/10 of its max HP.',
  },
  'focus-sash': {
    id: 'focus-sash', name: 'Focus Sash', category: 'battle', icon: '🎗', sprite: 'focus-sash', held: true,
    description: 'If the holder is at full HP, it survives a hit that would knock it out with 1 HP. Used up.',
  },
  'expert-belt': {
    id: 'expert-belt', name: 'Expert Belt', category: 'battle', icon: '🥋', sprite: 'expert-belt', held: true,
    description: 'Super-effective moves hit 20% harder.',
  },
  'muscle-band': {
    id: 'muscle-band', name: 'Muscle Band', category: 'battle', icon: '💪', sprite: 'muscle-band', held: true,
    description: 'Physical moves hit 10% harder.',
  },
  'wise-glasses': {
    id: 'wise-glasses', name: 'Wise Glasses', category: 'battle', icon: '👓', sprite: 'wise-glasses', held: true,
    description: 'Special moves hit 10% harder.',
  },
  'assault-vest': {
    id: 'assault-vest', name: 'Assault Vest', category: 'battle', icon: '🦺', sprite: 'assault-vest', held: true,
    description: 'Raises the holder\'s Special Defence by half.',
  },
  'lum-berry': {
    id: 'lum-berry', name: 'Lum Berry', category: 'battle', icon: '🍈', sprite: 'lum-berry', held: true,
    description: 'Eaten the moment the holder gets a status condition, curing it.',
  },
  'sitrus-berry': {
    id: 'sitrus-berry', name: 'Sitrus Berry', category: 'battle', icon: '🍋', sprite: 'sitrus-berry', held: true,
    description: 'Eaten when the holder drops below half HP, restoring a quarter of its max HP.',
  },
  'rocky-helmet': {
    id: 'rocky-helmet', name: 'Rocky Helmet', category: 'battle', icon: '⛑', sprite: 'rocky-helmet', held: true,
    description: 'A Pokémon that makes contact with the holder loses 1/6 of its max HP.',
  },
  'eviolite': {
    id: 'eviolite', name: 'Eviolite', category: 'battle', icon: '💎', sprite: 'eviolite', held: true,
    description: 'A Pokémon that can still evolve takes far less damage while holding it.',
  },
  'charcoal': {
    id: 'charcoal', name: 'Charcoal', category: 'battle', icon: '✦', sprite: 'charcoal', held: true,
    description: 'A held item that makes Fire-type moves hit 20% harder.',
  },
  'mystic-water': {
    id: 'mystic-water', name: 'Mystic Water', category: 'battle', icon: '✦', sprite: 'mystic-water', held: true,
    description: 'A held item that makes Water-type moves hit 20% harder.',
  },
  'miracle-seed': {
    id: 'miracle-seed', name: 'Miracle Seed', category: 'battle', icon: '✦', sprite: 'miracle-seed', held: true,
    description: 'A held item that makes Grass-type moves hit 20% harder.',
  },
  'magnet': {
    id: 'magnet', name: 'Magnet', category: 'battle', icon: '✦', sprite: 'magnet', held: true,
    description: 'A held item that makes Electric-type moves hit 20% harder.',
  },
  'never-melt-ice': {
    id: 'never-melt-ice', name: 'Never-Melt Ice', category: 'battle', icon: '✦', sprite: 'never-melt-ice', held: true,
    description: 'A held item that makes Ice-type moves hit 20% harder.',
  },
  'black-belt': {
    id: 'black-belt', name: 'Black Belt', category: 'battle', icon: '✦', sprite: 'black-belt', held: true,
    description: 'A held item that makes Fighting-type moves hit 20% harder.',
  },
  'poison-barb': {
    id: 'poison-barb', name: 'Poison Barb', category: 'battle', icon: '✦', sprite: 'poison-barb', held: true,
    description: 'A held item that makes Poison-type moves hit 20% harder.',
  },
  'soft-sand': {
    id: 'soft-sand', name: 'Soft Sand', category: 'battle', icon: '✦', sprite: 'soft-sand', held: true,
    description: 'A held item that makes Ground-type moves hit 20% harder.',
  },
  'sharp-beak': {
    id: 'sharp-beak', name: 'Sharp Beak', category: 'battle', icon: '✦', sprite: 'sharp-beak', held: true,
    description: 'A held item that makes Flying-type moves hit 20% harder.',
  },
  'twisted-spoon': {
    id: 'twisted-spoon', name: 'Twisted Spoon', category: 'battle', icon: '✦', sprite: 'twisted-spoon', held: true,
    description: 'A held item that makes Psychic-type moves hit 20% harder.',
  },
  'silver-powder': {
    id: 'silver-powder', name: 'Silver Powder', category: 'battle', icon: '✦', sprite: 'silver-powder', held: true,
    description: 'A held item that makes Bug-type moves hit 20% harder.',
  },
  'hard-stone': {
    id: 'hard-stone', name: 'Hard Stone', category: 'battle', icon: '✦', sprite: 'hard-stone', held: true,
    description: 'A held item that makes Rock-type moves hit 20% harder.',
  },
  'spell-tag': {
    id: 'spell-tag', name: 'Spell Tag', category: 'battle', icon: '✦', sprite: 'spell-tag', held: true,
    description: 'A held item that makes Ghost-type moves hit 20% harder.',
  },
  'dragon-fang': {
    id: 'dragon-fang', name: 'Dragon Fang', category: 'battle', icon: '✦', sprite: 'dragon-fang', held: true,
    description: 'A held item that makes Dragon-type moves hit 20% harder.',
  },
  'black-glasses': {
    id: 'black-glasses', name: 'Black Glasses', category: 'battle', icon: '✦', sprite: 'black-glasses', held: true,
    description: 'A held item that makes Dark-type moves hit 20% harder.',
  },
  'metal-coat': {
    id: 'metal-coat', name: 'Metal Coat', category: 'battle', icon: '✦', sprite: 'metal-coat', held: true,
    description: 'A held item that makes Steel-type moves hit 20% harder.',
  },
  'silk-scarf': {
    id: 'silk-scarf', name: 'Silk Scarf', category: 'battle', icon: '✦', sprite: 'silk-scarf', held: true,
    description: 'A held item that makes Normal-type moves hit 20% harder.',
  },
  'fairy-feather': {
    id: 'fairy-feather', name: 'Fairy Feather', category: 'battle', icon: '✦', held: true,
    description: 'A held item that makes Fairy-type moves hit 20% harder.',
  },
};

/**
 * Saddles (DESIGN §8.1): one per species that can be ridden, made at the workbench (riding.ts has
 * the recipes). Keep this list in step with RIDE_PROFILES.
 */
const SADDLES: [string, string, 'land' | 'water' | 'air'][] = [
  ['shepherion', 'Shepherion', 'land'], ['rapidash', 'Rapidash', 'land'], ['tauros', 'Tauros', 'land'], ['rhyhorn', 'Rhyhorn', 'land'], ['dodrio', 'Dodrio', 'land'],
  ['dewgong', 'Dewgong', 'water'], ['seaking', 'Seaking', 'water'], ['lapras', 'Lapras', 'water'],
  ['forgelynx', 'Forgelynx', 'air'], ['dragonite', 'Dragonite', 'air'], ['skjaldhawk', 'Skjaldhawk', 'air'], ['aerodactyl', 'Aerodactyl', 'air'],
];
for (const [species, name, mode] of SADDLES) {
  const id = `saddle-${species}`;
  ITEMS[id] = {
    id, name: `${name} Saddle`, category: 'tools', icon: mode === 'water' ? '🛶' : mode === 'air' ? '🪽' : '🐎',
    description: mode === 'water'
      ? `A harness of oiled hide shaped to a ${name}'s back. With it, your ${name} carries you across water. Press R facing the water to ride.`
      : mode === 'air'
        ? `A strapped flying saddle shaped to a ${name}'s back. With it, your ${name} takes off with you: Space climbs, C dives, sprint flies flat out. It tires in the air and glides down when spent.`
        : `A hide saddle shaped to a ${name}'s back. With it, your ${name} carries you: hold sprint to gallop. Press R to ride.`,
  };
}

/** Most creatures a trainer carries; the rest go to the PC box. */
export const PARTY_MAX = 6;

/** What a new trainer leaves home with. Supplies are thin on purpose. */
export const STARTING_BAG: Record<string, number> = {
  'bramble-berry': 3,
  'water-flask': 1,
  'bandage': 1,
  'trainer-journal': 1,
  'region-map': 1,
};
