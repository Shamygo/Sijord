export type ItemCategory = 'items' | 'balls' | 'battle' | 'materials' | 'key';

export interface ItemInfo {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  /** Short glyph shown in the bag grid until item art exists. */
  icon: string;
}

export const ITEM_CATEGORIES: { id: ItemCategory; label: string }[] = [
  { id: 'items', label: 'Items' },
  { id: 'balls', label: 'Balls' },
  { id: 'battle', label: 'Battle' },
  { id: 'materials', label: 'Materials' },
  { id: 'key', label: 'Key items' },
];

export const ITEMS: Record<string, ItemInfo> = {
  'bramble-berry': {
    id: 'bramble-berry', name: 'Bramble Berry', category: 'items', icon: '🫐',
    description: 'A tart berry from the hedges around Bramblewick. Restores a little hunger.',
  },
  'water-flask': {
    id: 'water-flask', name: 'Water Flask', category: 'items', icon: '💧',
    description: 'A refillable flask. Drink to restore thirst; refill at any river or well.',
  },
  'bandage': {
    id: 'bandage', name: 'Bandage', category: 'items', icon: '🩹',
    description: 'Patches you up after a wild Pokemon gets rough. Restores some of your HP.',
  },
  'poke-ball': {
    id: 'poke-ball', name: 'Poke Ball', category: 'balls', icon: '◓',
    description: 'A standard ball. Works best on Pokemon weakened in battle and close to your level.',
  },
  'great-ball': {
    id: 'great-ball', name: 'Great Ball', category: 'balls', icon: '◓',
    description: 'A better ball with a stronger seal. Half again as likely to hold as a Poke Ball.',
  },
  'ultra-ball': {
    id: 'ultra-ball', name: 'Ultra Ball', category: 'balls', icon: '◓',
    description: 'A high-grade ball. Twice as likely to hold as a Poke Ball.',
  },
  'wood': {
    id: 'wood', name: 'Wood', category: 'materials', icon: '🪵',
    description: 'Gathered from trees. Used for tools, fences and your first workbench.',
  },
  'stone': {
    id: 'stone', name: 'Stone', category: 'materials', icon: '🪨',
    description: 'Gathered from rocks. Used for tools and sturdier buildings.',
  },
  'fiber': {
    id: 'fiber', name: 'Plant Fiber', category: 'materials', icon: '🌾',
    description: 'Pulled from tall grass. Used for rope, bandages and basic clothing.',
  },
  'trainer-journal': {
    id: 'trainer-journal', name: 'Trainer Journal', category: 'key', icon: '📓',
    description: 'Your notes on the journey so far. Quests are tracked here.',
  },
  'region-map': {
    id: 'region-map', name: 'Sijord Map', category: 'key', icon: '🗺',
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
