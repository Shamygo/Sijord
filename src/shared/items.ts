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
  /** Worn by the trainer: softens hits from charging Pokemon (DESIGN §5.4). */
  armour?: { slot: ArmourSlot; defence: number };
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
    id: 'cloth-cap', name: 'Cloth Cap', category: 'gear', icon: '🧢', armour: { slot: 'head', defence: 3 },
    description: 'A padded cloth cap. Takes a little of the sting out of a charging Pokémon. Defence 3.',
  },
  'cloth-tunic': {
    id: 'cloth-tunic', name: 'Cloth Tunic', category: 'gear', icon: '👕', armour: { slot: 'body', defence: 7 },
    description: 'A quilted tunic of woven cloth, worn under your jacket. Defence 7.',
  },
  'cloth-trousers': {
    id: 'cloth-trousers', name: 'Cloth Trousers', category: 'gear', icon: '👖', armour: { slot: 'legs', defence: 5 },
    description: 'Hard-wearing trousers with padded knees. Defence 5.',
  },
  'canteen': {
    id: 'canteen', name: 'Canteen', category: 'tools', icon: '🍶',
    description: 'A copper-lined flask. Each one carries three drinks: fill it at any river, lake or pond.',
  },
  'trainer-journal': {
    id: 'trainer-journal', name: 'Trainer Journal', category: 'key', icon: '📓', sprite:'fashion-case',
    description: 'Your notes on the journey so far. Quests are tracked here.',
  },
  'region-map': {
    id: 'region-map', name: 'Sijord Map', category: 'key', icon: '🗺', sprite:'town-map',
    description: 'A hand-drawn map of the Sijord region from Professor Hazel. Fills in as you explore.',
  },
};

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
