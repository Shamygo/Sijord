import type { MoveData } from '../battle/types';

type Def = Omit<MoveData, 'id' | 'priority' | 'target'> & Partial<Pick<MoveData, 'priority' | 'target'>>;

/**
 * Moves the Pokémon of the wider region need (Ice, Ghost, Dark, Dragon, Rock and more),
 * using only mechanics the engine already models. Numbers follow the latest mainline games.
 * Where a move's full effect isn't modelled yet, its description says what it does here.
 */
export const REGION_MOVE_DEFS: Record<string, Def> = {
  // ---- Normal ----
  'mega-punch': { name: 'Mega Punch', type: 'normal', category: 'physical', power: 80, accuracy: 85, pp: 20, contact: true, description: 'A punch thrown with tremendous force.' },
  'mega-kick': { name: 'Mega Kick', type: 'normal', category: 'physical', power: 120, accuracy: 75, pp: 5, contact: true, description: 'A wildly powerful kick that often misses.' },
  'comet-punch': { name: 'Comet Punch', type: 'normal', category: 'physical', power: 18, accuracy: 85, pp: 15, contact: true, multihit: [2, 5], description: 'Punches 2-5 times in a row.' },
  'dizzy-punch': { name: 'Dizzy Punch', type: 'normal', category: 'physical', power: 70, accuracy: 100, pp: 10, contact: true, secondary: { chance: 20, confuse: true }, description: '20% chance to confuse.' },
  'egg-bomb': { name: 'Egg Bomb', type: 'normal', category: 'physical', power: 100, accuracy: 75, pp: 10, description: 'Hurls a large egg at the target.' },
  'tri-attack': { name: 'Tri Attack', type: 'normal', category: 'special', power: 80, accuracy: 100, pp: 10, secondary: { chance: 20, status: 'par' }, description: '20% chance to paralyse (burn and freeze come later).' },
  'crush-claw': { name: 'Crush Claw', type: 'normal', category: 'physical', power: 75, accuracy: 95, pp: 10, contact: true, secondary: { chance: 50, boosts: { def: -1 } }, description: '50% chance to lower Defense.' },
  'soft-boiled': { name: 'Soft-Boiled', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 5, target: 'self', heal: 0.5, description: 'Restores half its max HP.' },
  'recover': { name: 'Recover', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 5, target: 'self', heal: 0.5, description: 'Restores half its max HP.' },
  'slack-off': { name: 'Slack Off', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 5, target: 'self', heal: 0.5, description: 'Lazes about, restoring half its max HP.' },
  'minimize': { name: 'Minimize', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 10, target: 'self', selfBoosts: { evasion: 2 }, description: 'Shrinks, sharply raising evasion.' },
  'splash': { name: 'Splash', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 40, target: 'self', description: 'Flops about. Nothing happens at all.' },
  'lovely-kiss': { name: 'Lovely Kiss', type: 'normal', category: 'status', power: 0, accuracy: 75, pp: 10, status: 'slp', description: 'A kiss with a scary face that puts the target to sleep.' },
  'thrash': { name: 'Thrash', type: 'normal', category: 'physical', power: 120, accuracy: 100, pp: 10, contact: true, selfBoosts: { def: -1 }, description: 'A rampage. Here it lowers the user\'s Defense instead of locking it in.' },
  'barrage': { name: 'Barrage', type: 'normal', category: 'physical', power: 15, accuracy: 85, pp: 20, multihit: [2, 5], description: 'Hurls round objects 2-5 times.' },
  // ---- Fire ----
  'fire-punch': { name: 'Fire Punch', type: 'fire', category: 'physical', power: 75, accuracy: 100, pp: 15, contact: true, secondary: { chance: 10, status: 'brn' }, description: '10% chance to burn.' },
  'blaze-kick': { name: 'Blaze Kick', type: 'fire', category: 'physical', power: 85, accuracy: 90, pp: 10, contact: true, critStage: 1, secondary: { chance: 10, status: 'brn' }, description: 'High critical-hit ratio. 10% chance to burn.' },
  'lava-plume': { name: 'Lava Plume', type: 'fire', category: 'special', power: 80, accuracy: 100, pp: 15, target: 'all-adjacent', secondary: { chance: 30, status: 'brn' }, description: 'Scarlet flames hit everyone around the user. 30% chance to burn.' },
  // ---- Water ----
  'bubble': { name: 'Bubble', type: 'water', category: 'special', power: 40, accuracy: 100, pp: 30, target: 'all-adjacent-foes', secondary: { chance: 10, boosts: { spe: -1 } }, description: 'Bubbles hit both foes. 10% chance to lower Speed.' },
  'waterfall': { name: 'Waterfall', type: 'water', category: 'physical', power: 80, accuracy: 100, pp: 15, contact: true, secondary: { chance: 20, flinch: true }, description: '20% chance to make the target flinch.' },
  'crabhammer': { name: 'Crabhammer', type: 'water', category: 'physical', power: 100, accuracy: 90, pp: 10, contact: true, critStage: 1, description: 'Hammers with a huge claw. High critical-hit ratio.' },
  'scald': { name: 'Scald', type: 'water', category: 'special', power: 80, accuracy: 100, pp: 15, secondary: { chance: 30, status: 'brn' }, description: 'Boiling water. 30% chance to burn.' },
  'clamp': { name: 'Clamp', type: 'water', category: 'physical', power: 35, accuracy: 85, pp: 15, contact: true, special: 'bind', description: 'Clamps the target for 4-5 turns, hurting it each turn.' },
  'razor-shell': { name: 'Razor Shell', type: 'water', category: 'physical', power: 75, accuracy: 95, pp: 10, contact: true, secondary: { chance: 50, boosts: { def: -1 } }, description: '50% chance to lower Defense.' },
  'acid-armor': { name: 'Acid Armor', type: 'poison', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', selfBoosts: { def: 2 }, description: 'Turns to liquid, sharply raising Defense.' },
  // ---- Electric ----
  'thunder-fang': { name: 'Thunder Fang', type: 'electric', category: 'physical', power: 65, accuracy: 95, pp: 15, contact: true, secondary: { chance: 10, status: 'par' }, description: '10% chance to paralyse.' },
  'charge-beam': { name: 'Charge Beam', type: 'electric', category: 'special', power: 50, accuracy: 90, pp: 10, secondary: { chance: 70, self: { spa: 1 } }, description: "70% chance to raise the user's Sp. Atk." },
  'zap-cannon': { name: 'Zap Cannon', type: 'electric', category: 'special', power: 120, accuracy: 50, pp: 5, secondary: { chance: 100, status: 'par' }, description: 'Always paralyses, if it hits.' },
  // ---- Ice ----
  'powder-snow': { name: 'Powder Snow', type: 'ice', category: 'special', power: 40, accuracy: 100, pp: 25, target: 'all-adjacent-foes', secondary: { chance: 10, status: 'frz' }, description: 'Freezing snow on both foes. 10% chance to freeze.' },
  'ice-fang': { name: 'Ice Fang', type: 'ice', category: 'physical', power: 65, accuracy: 95, pp: 15, contact: true, secondary: { chance: 10, status: 'frz' }, description: '10% chance to freeze.' },
  'ice-punch': { name: 'Ice Punch', type: 'ice', category: 'physical', power: 75, accuracy: 100, pp: 15, contact: true, secondary: { chance: 10, status: 'frz' }, description: '10% chance to freeze.' },
  'aurora-beam': { name: 'Aurora Beam', type: 'ice', category: 'special', power: 65, accuracy: 100, pp: 20, secondary: { chance: 10, boosts: { atk: -1 } }, description: '10% chance to lower Attack.' },
  'ice-beam': { name: 'Ice Beam', type: 'ice', category: 'special', power: 90, accuracy: 100, pp: 10, secondary: { chance: 10, status: 'frz' }, description: '10% chance to freeze.' },
  'blizzard': { name: 'Blizzard', type: 'ice', category: 'special', power: 110, accuracy: 70, pp: 5, target: 'all-adjacent-foes', secondary: { chance: 10, status: 'frz' }, description: 'A howling storm on both foes. 10% chance to freeze.' },
  'icicle-spear': { name: 'Icicle Spear', type: 'ice', category: 'physical', power: 25, accuracy: 100, pp: 30, multihit: [2, 5], description: 'Fires icicles 2-5 times.' },
  'icicle-crash': { name: 'Icicle Crash', type: 'ice', category: 'physical', power: 85, accuracy: 90, pp: 10, secondary: { chance: 30, flinch: true }, description: '30% chance to make the target flinch.' },
  // ---- Fighting ----
  'karate-chop': { name: 'Karate Chop', type: 'fighting', category: 'physical', power: 50, accuracy: 100, pp: 25, contact: true, critStage: 1, description: 'High critical-hit ratio.' },
  'low-sweep': { name: 'Low Sweep', type: 'fighting', category: 'physical', power: 65, accuracy: 100, pp: 20, contact: true, secondary: { chance: 100, boosts: { spe: -1 } }, description: "Lowers the target's Speed." },
  'mach-punch': { name: 'Mach Punch', type: 'fighting', category: 'physical', power: 40, accuracy: 100, pp: 30, priority: 1, contact: true, description: 'A blindingly fast punch. Almost always strikes first.' },
  'rolling-kick': { name: 'Rolling Kick', type: 'fighting', category: 'physical', power: 60, accuracy: 85, pp: 15, contact: true, secondary: { chance: 30, flinch: true }, description: '30% chance to make the target flinch.' },
  'submission': { name: 'Submission', type: 'fighting', category: 'physical', power: 80, accuracy: 80, pp: 20, contact: true, recoil: 1 / 4, description: 'The user takes 1/4 of the damage dealt.' },
  'dynamic-punch': { name: 'Dynamic Punch', type: 'fighting', category: 'physical', power: 100, accuracy: 50, pp: 5, contact: true, secondary: { chance: 100, confuse: true }, description: 'Always confuses, if it hits.' },
  'focus-blast': { name: 'Focus Blast', type: 'fighting', category: 'special', power: 120, accuracy: 70, pp: 5, secondary: { chance: 10, boosts: { spd: -1 } }, description: '10% chance to lower Sp. Def.' },
  'vacuum-wave': { name: 'Vacuum Wave', type: 'fighting', category: 'special', power: 40, accuracy: 100, pp: 30, priority: 1, description: 'A wave of vacuum. Almost always strikes first.' },
  'drain-punch': { name: 'Drain Punch', type: 'fighting', category: 'physical', power: 75, accuracy: 100, pp: 10, contact: true, drain: 0.5, description: 'Restores half the damage dealt.' },
  // ---- Poison ----
  'smog': { name: 'Smog', type: 'poison', category: 'special', power: 30, accuracy: 70, pp: 20, secondary: { chance: 40, status: 'psn' }, description: '40% chance to poison.' },
  'sludge': { name: 'Sludge', type: 'poison', category: 'special', power: 65, accuracy: 100, pp: 20, secondary: { chance: 30, status: 'psn' }, description: '30% chance to poison.' },
  'sludge-wave': { name: 'Sludge Wave', type: 'poison', category: 'special', power: 95, accuracy: 100, pp: 10, target: 'all-adjacent', secondary: { chance: 10, status: 'psn' }, description: 'Hits everyone around the user. 10% chance to poison.' },
  'poison-gas': { name: 'Poison Gas', type: 'poison', category: 'status', power: 0, accuracy: 90, pp: 40, target: 'all-adjacent-foes', status: 'psn', description: 'Poisons both foes.' },
  'cross-poison': { name: 'Cross Poison', type: 'poison', category: 'physical', power: 70, accuracy: 100, pp: 20, contact: true, critStage: 1, secondary: { chance: 10, status: 'psn' }, description: 'High critical-hit ratio. 10% chance to poison.' },
  // ---- Ground ----
  'bone-club': { name: 'Bone Club', type: 'ground', category: 'physical', power: 65, accuracy: 85, pp: 20, secondary: { chance: 10, flinch: true }, description: '10% chance to make the target flinch.' },
  'bonemerang': { name: 'Bonemerang', type: 'ground', category: 'physical', power: 50, accuracy: 90, pp: 10, multihit: [2, 2], description: 'Throws a bone that hits twice.' },
  'mud-bomb': { name: 'Mud Bomb', type: 'ground', category: 'special', power: 65, accuracy: 85, pp: 10, secondary: { chance: 30, boosts: { accuracy: -1 } }, description: '30% chance to lower accuracy.' },
  'high-horsepower': { name: 'High Horsepower', type: 'ground', category: 'physical', power: 95, accuracy: 95, pp: 10, contact: true, description: 'A fierce full-body charge.' },
  'sky-uppercut': { name: 'Sky Uppercut', type: 'fighting', category: 'physical', power: 85, accuracy: 90, pp: 15, contact: true, description: 'An uppercut thrown as if leaping skyward.' },
  // ---- Psychic ----
  'psycho-cut': { name: 'Psycho Cut', type: 'psychic', category: 'physical', power: 70, accuracy: 100, pp: 20, critStage: 1, description: 'Psychic blades. High critical-hit ratio.' },
  'calm-mind': { name: 'Calm Mind', type: 'psychic', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', selfBoosts: { spa: 1, spd: 1 }, description: 'Raises Sp. Atk and Sp. Def.' },
  'barrier': { name: 'Barrier', type: 'psychic', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', selfBoosts: { def: 2 }, description: 'Sharply raises Defense.' },
  'kinesis': { name: 'Kinesis', type: 'psychic', category: 'status', power: 0, accuracy: 80, pp: 15, boosts: { accuracy: -1 }, description: 'Bends a spoon to distract the target, lowering accuracy.' },
  'psywave': { name: 'Psywave', type: 'psychic', category: 'special', power: 0, accuracy: 100, pp: 15, special: 'seismic-toss', description: "Damage equal to the user's level (a steadier wave than the games')." },
  // ---- Rock ----
  'rock-slide': { name: 'Rock Slide', type: 'rock', category: 'physical', power: 75, accuracy: 90, pp: 10, target: 'all-adjacent-foes', secondary: { chance: 30, flinch: true }, description: 'Boulders hit both foes. 30% chance to make them flinch.' },
  'ancient-power': { name: 'Ancient Power', type: 'rock', category: 'special', power: 60, accuracy: 100, pp: 5, secondary: { chance: 10, self: { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 } }, description: "10% chance to raise all the user's stats." },
  'power-gem': { name: 'Power Gem', type: 'rock', category: 'special', power: 80, accuracy: 100, pp: 20, description: 'A ray of light from gemstones.' },
  'head-smash': { name: 'Head Smash', type: 'rock', category: 'physical', power: 150, accuracy: 80, pp: 5, contact: true, recoil: 1 / 2, description: 'A full-power headbutt. The user takes 1/2 of the damage dealt.' },
  'rock-wrecker': { name: 'Rock Wrecker', type: 'rock', category: 'physical', power: 150, accuracy: 90, pp: 5, selfBoosts: { spe: -1 }, description: 'Launches a huge boulder. Here it lowers the user\'s Speed instead of a recharge turn.' },
  // ---- Bug ----
  'x-scissor': { name: 'X-Scissor', type: 'bug', category: 'physical', power: 80, accuracy: 100, pp: 15, contact: true, description: 'Slashes with crossed scythes or claws.' },
  'signal-beam': { name: 'Signal Beam', type: 'bug', category: 'special', power: 75, accuracy: 100, pp: 15, secondary: { chance: 10, confuse: true }, description: '10% chance to confuse.' },
  'spore': { name: 'Spore', type: 'grass', category: 'status', power: 0, accuracy: 100, pp: 15, status: 'slp', powder: true, description: 'Scatters spores that always put the target to sleep.' },
  'vise-grip': { name: 'Vise Grip', type: 'normal', category: 'physical', power: 55, accuracy: 100, pp: 30, contact: true, description: 'Grips the target from both sides.' },
  'fell-stinger': { name: 'Fell Stinger', type: 'bug', category: 'physical', power: 50, accuracy: 100, pp: 25, contact: true, description: 'Stabs with a stinger.' },
  // ---- Ghost ----
  'lick': { name: 'Lick', type: 'ghost', category: 'physical', power: 30, accuracy: 100, pp: 30, contact: true, secondary: { chance: 30, status: 'par' }, description: '30% chance to paralyse.' },
  'night-shade': { name: 'Night Shade', type: 'ghost', category: 'special', power: 0, accuracy: 100, pp: 15, special: 'seismic-toss', description: "Damage equal to the user's level." },
  'shadow-sneak': { name: 'Shadow Sneak', type: 'ghost', category: 'physical', power: 40, accuracy: 100, pp: 30, priority: 1, contact: true, description: 'Strikes from the shadows. Almost always strikes first.' },
  'shadow-punch': { name: 'Shadow Punch', type: 'ghost', category: 'physical', power: 60, accuracy: true, pp: 20, contact: true, description: 'A punch from the shadows that never misses.' },
  'shadow-claw': { name: 'Shadow Claw', type: 'ghost', category: 'physical', power: 70, accuracy: 100, pp: 15, contact: true, critStage: 1, description: 'High critical-hit ratio.' },
  'hex': { name: 'Hex', type: 'ghost', category: 'special', power: 65, accuracy: 100, pp: 10, description: 'A cruel curse. (Its bonus against a target with a status problem is not in Sijord yet.)' },
  'shadow-ball': { name: 'Shadow Ball', type: 'ghost', category: 'special', power: 80, accuracy: 100, pp: 15, secondary: { chance: 20, boosts: { spd: -1 } }, description: '20% chance to lower Sp. Def.' },
  // ---- Dark ----
  'night-slash': { name: 'Night Slash', type: 'dark', category: 'physical', power: 70, accuracy: 100, pp: 15, contact: true, critStage: 1, description: 'Slashes at a vital spot. High critical-hit ratio.' },
  'dark-pulse': { name: 'Dark Pulse', type: 'dark', category: 'special', power: 80, accuracy: 100, pp: 15, secondary: { chance: 20, flinch: true }, description: '20% chance to make the target flinch.' },
  'throat-chop': { name: 'Throat Chop', type: 'dark', category: 'physical', power: 80, accuracy: 100, pp: 15, contact: true, description: 'Chops the throat.' },
  'feint-attack': { name: 'Feint Attack', type: 'dark', category: 'physical', power: 60, accuracy: true, pp: 20, contact: true, description: 'Draws close innocently, then strikes. Never misses.' },
  // ---- Dragon ----
  'dragon-pulse': { name: 'Dragon Pulse', type: 'dragon', category: 'special', power: 85, accuracy: 100, pp: 10, description: 'A shock wave from the mouth.' },
  'dragon-dance': { name: 'Dragon Dance', type: 'dragon', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', selfBoosts: { atk: 1, spe: 1 }, description: 'A mystic dance that raises Attack and Speed.' },
  'dragon-rush': { name: 'Dragon Rush', type: 'dragon', category: 'physical', power: 100, accuracy: 75, pp: 10, contact: true, secondary: { chance: 20, flinch: true }, description: '20% chance to make the target flinch.' },
  'outrage': { name: 'Outrage', type: 'dragon', category: 'physical', power: 120, accuracy: 100, pp: 10, contact: true, selfBoosts: { def: -1 }, description: 'A rampage. Here it lowers the user\'s Defense instead of locking it in.' },
  'dragon-tail': { name: 'Dragon Tail', type: 'dragon', category: 'physical', power: 60, accuracy: 90, pp: 10, priority: -6, contact: true, description: 'A heavy tail strike that always goes last.' },
  // ---- Steel ----
  'magnet-bomb': { name: 'Magnet Bomb', type: 'steel', category: 'physical', power: 60, accuracy: true, pp: 20, description: 'Launches steel bombs that never miss.' },
  'mirror-shot': { name: 'Mirror Shot', type: 'steel', category: 'special', power: 65, accuracy: 85, pp: 10, secondary: { chance: 30, boosts: { accuracy: -1 } }, description: '30% chance to lower accuracy.' },
  'gyro-ball': { name: 'Gyro Ball', type: 'steel', category: 'physical', power: 60, accuracy: 100, pp: 5, contact: true, description: 'A high-speed spin. (Its power does not yet depend on speed.)' },
  // ---- Grass / Fairy extras ----
  'bullet-seed': { name: 'Bullet Seed', type: 'grass', category: 'physical', power: 25, accuracy: 100, pp: 30, multihit: [2, 5], description: 'Shoots seeds 2-5 times.' },
  'leaf-storm': { name: 'Leaf Storm', type: 'grass', category: 'special', power: 130, accuracy: 90, pp: 5, selfBoosts: { spa: -2 }, description: "A storm of leaves that harshly lowers the user's Sp. Atk." },
  'energy-ball': { name: 'Energy Ball', type: 'grass', category: 'special', power: 90, accuracy: 100, pp: 10, secondary: { chance: 10, boosts: { spd: -1 } }, description: '10% chance to lower Sp. Def.' },
  'ingrain': { name: 'Ingrain', type: 'grass', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', heal: 0.25, description: 'Roots down and draws in nutrients, restoring a quarter of its HP.' },
};
