import { CONDITIONS, HERO_TEMPLATES } from './heroes.js'

// "Attack +8 · Damage 1", to compare cards while choosing.
export function cardStats(card) {
  return [card?.attack && `Attack ${card.attack}`, card?.damage && `Damage ${card.damage}`].filter(Boolean).join(' · ')
}

export const POWER_TYPES = ['at-will', 'utility', 'daily']
const HERO_KEYS = HERO_TEMPLATES.map((t) => t.key)

// Checks a card file and keeps the cards that can be used. Problems are listed
// so a typo in cards.json is easy to find instead of silently hiding a card.
export function normalizeCardFile(data) {
  const problems = []
  const powers = []
  const seen = new Set()
  const list = Array.isArray(data?.powers) ? data.powers : null
  if (!list) return { powers, abilities: [], monsters: [], villains: [], encounters: [], adventures: [], chambers: [], treasures: [], problems: ['The file needs a "powers" list.'] }

  list.forEach((card, i) => {
    const label = card?.name ? `"${card.name}"` : `power #${i + 1}`
    if (!card || typeof card !== 'object') return problems.push(`${label} is not a card.`)
    if (!card.id || typeof card.id !== 'string') return problems.push(`${label} needs an "id".`)
    if (seen.has(card.id)) return problems.push(`${label} reuses the id "${card.id}".`)
    if (!card.name || typeof card.name !== 'string') return problems.push(`${label} needs a "name".`)
    if (!HERO_KEYS.includes(card.hero)) {
      return problems.push(`${label} has hero "${card.hero}"; use one of ${HERO_KEYS.join(', ')}.`)
    }
    if (!POWER_TYPES.includes(card.type)) {
      return problems.push(`${label} has type "${card.type}"; use one of ${POWER_TYPES.join(', ')}.`)
    }
    seen.add(card.id)
    powers.push({
      id: card.id,
      hero: card.hero,
      type: card.type,
      name: card.name,
      attack: typeof card.attack === 'string' ? card.attack : '',
      damage: typeof card.damage === 'string' ? card.damage : '',
      text: typeof card.text === 'string' ? card.text : '',
      // Filled in on the setup screen: "always" cards are fixed (Keyleth's Lay on Hands),
      // "suggested" ones are the rulebook's picks and can be swapped.
      always: card.always === true,
      suggested: card.suggested === true,
    })
  })
  return {
    powers,
    abilities: normalizeAbilities(data?.heroes, problems),
    monsters: normalizeMonsters(data?.monsters, problems),
    villains: normalizeVillains(data?.villains, problems),
    encounters: normalizeEncounters(data?.encounters, problems),
    adventures: normalizeAdventures(data?.adventures, problems),
    chambers: normalizeChambers(data?.chambers, problems),
    treasures: normalizeTreasures(data?.treasures, problems),
    problems,
  }
}

// Hero card abilities, such as Keyleth's Healing Hands. Optional; `level` 2 means
// the ability is only on the 2nd-level side of the card.
function normalizeAbilities(list, problems) {
  if (list === undefined) return []
  if (!Array.isArray(list)) {
    problems.push('"heroes" should be a list.')
    return []
  }
  const abilities = []
  list.forEach((entry, i) => {
    if (!HERO_KEYS.includes(entry?.hero)) {
      return problems.push(`Hero entry #${i + 1} has hero "${entry?.hero}"; use one of ${HERO_KEYS.join(', ')}.`)
    }
    for (const ability of Array.isArray(entry.abilities) ? entry.abilities : []) {
      if (!ability?.name || typeof ability.name !== 'string') {
        problems.push(`An ability for ${entry.hero} needs a "name".`)
        continue
      }
      abilities.push({
        hero: entry.hero,
        name: ability.name,
        text: typeof ability.text === 'string' ? ability.text : '',
        level: ability.level === 2 ? 2 : 1,
      })
    }
  })
  return abilities
}

// What a monster's (or villain's) tactics can ask about the board, in the order a card checks them.
export const TACTIC_CHECKS = ['adjacent', 'adjacentMany', 'sameTile', 'tileWithMany', 'within1', 'within2', 'within3', 'aloneByUnexploredEdge']
const MOVES = ['adjacent', 'toward']
// Who a tactic attacks, or moves toward, when more than one hero fits.
const TARGETS = ['closest', 'adjacent', 'mostHp', 'farthest']
// Where a villain goes after its attack.
const THEN_MOVES = ['within1', 'adjacent', 'away']
const wholeNumber = (value, min = 0) => Number.isInteger(value) && value >= min

// A card's attacks. Returns null (and notes the problem) if one is broken. Attacks that
// share a `group` are one table: the Gauth's eye ray rolls a die to pick which one it uses.
function parseAttacks(card, label, problems) {
  const attacks = []
  for (const attack of Array.isArray(card.attacks) ? card.attacks : []) {
    if (!attack?.id || !attack.name || !wholeNumber(attack.bonus) || !wholeNumber(attack.damage ?? 0)) {
      problems.push(`${label} has an attack that needs an "id", a "name", a "bonus" and a "damage".`)
      return null
    }
    const roll = Array.isArray(attack.roll) && attack.roll.length === 2 && attack.roll.every((n) => wholeNumber(n, 1)) ? attack.roll : null
    attacks.push({
      id: String(attack.id),
      name: String(attack.name),
      bonus: attack.bonus,
      damage: attack.damage ?? 0,
      miss: wholeNumber(attack.miss) ? attack.miss : 0,
      conditions: (Array.isArray(attack.conditions) ? attack.conditions : []).filter((c) => CONDITIONS.includes(c)),
      // What else a hit does that the app leaves to the players, such as moving the hero.
      effect: typeof attack.effect === 'string' ? attack.effect : '',
      ...(typeof attack.group === 'string' && roll ? { group: attack.group, roll } : {}),
    })
  }
  return attacks
}

// A card's tactics, as steps: the first step whose `when` is true happens, and a step
// without `when` is the "Otherwise". Returns null (and notes the problem) if one is broken.
function parseTactics(card, attacks, label, problems) {
  const tactics = []
  for (const step of Array.isArray(card.tactics) ? card.tactics : []) {
    const fail = (text) => {
      problems.push(`${label} has a tactic ${text}`)
      return null
    }
    if (step?.when !== undefined && !TACTIC_CHECKS.includes(step.when)) return fail(`with when "${step.when}"; use one of ${TACTIC_CHECKS.join(', ')}.`)
    if (step.attack !== undefined && !attacks.some((a) => a.id === step.attack || a.group === step.attack)) {
      return fail(`that uses the attack "${step.attack}", which isn't on the card.`)
    }
    if (step.move !== undefined && !MOVES.includes(step.move)) return fail(`with move "${step.move}"; use one of ${MOVES.join(', ')}.`)
    if (step.target !== undefined && !TARGETS.includes(step.target)) return fail(`with target "${step.target}"; use one of ${TARGETS.join(', ')}.`)
    if (step.then !== undefined && !THEN_MOVES.includes(step.then)) return fail(`with then "${step.then}"; use one of ${THEN_MOVES.join(', ')}.`)
    tactics.push({
      when: step.when ?? null,
      move: step.move ?? null,
      attack: step.attack ?? null,
      targets: step.targets === 'all' ? 'all' : 'one',
      target: step.target ?? null,
      then: step.then ?? null,
      toward: step.toward === 'mostHp' ? 'mostHp' : 'closest',
      tiles: wholeNumber(step.tiles, 1) ? step.tiles : 1,
      explore: step.explore === true,
      text: typeof step.text === 'string' ? step.text : '',
    })
  }
  if (tactics.length === 0) {
    problems.push(`${label} needs a "tactics" list.`)
    return null
  }
  return tactics
}

// Checks the parts every monster and villain card has: an id, a name and its numbers.
function checkCard(card, label, seen, fields, problems) {
  if (!card || typeof card !== 'object') return problems.push(`${label} is not a card.`) && false
  if (!card.id || typeof card.id !== 'string') return problems.push(`${label} needs an "id".`) && false
  if (seen.has(card.id)) return problems.push(`${label} reuses the id "${card.id}".`) && false
  if (!card.name || typeof card.name !== 'string') return problems.push(`${label} needs a "name".`) && false
  for (const field of fields) {
    if (!wholeNumber(card[field], field === 'xp' ? 0 : 1)) return problems.push(`${label} needs a number for "${field}".`) && false
  }
  return true
}

// Monster cards, for the virtual monster deck and the guided Villain Phase. Optional.
function normalizeMonsters(list, problems) {
  if (list === undefined) return []
  if (!Array.isArray(list)) {
    problems.push('"monsters" should be a list.')
    return []
  }
  const monsters = []
  const seen = new Set()
  list.forEach((card, i) => {
    const label = card?.name ? `"${card.name}"` : `monster #${i + 1}`
    if (!checkCard(card, label, seen, ['ac', 'hp', 'xp'], problems)) return
    const attacks = parseAttacks(card, label, problems)
    const tactics = attacks && parseTactics(card, attacks, label, problems)
    if (!tactics) return
    seen.add(card.id)
    monsters.push({
      id: card.id,
      name: card.name,
      ac: card.ac,
      hp: card.hp,
      xp: card.xp,
      copies: wholeNumber(card.copies, 1) ? card.copies : 1,
      // Legion Devils come in threes: one card, three figures.
      figures: wholeNumber(card.figures, 1) ? card.figures : 1,
      special: typeof card.special === 'string' ? card.special : '',
      // Kinds of monster, such as Orc or Sentry, that some encounter cards look for.
      types: (Array.isArray(card.types) ? card.types : []).filter((t) => typeof t === 'string'),
      attacks,
      tactics,
    })
  })
  return monsters
}

// Villain cards. Optional. An adventure puts a villain on the board, and it takes a turn
// at the start of every Villain Phase. `enraged` is the other side of the card (the
// Rage Drake), which it flips to instead of being defeated the first time.
function normalizeVillains(list, problems) {
  if (list === undefined) return []
  if (!Array.isArray(list)) {
    problems.push('"villains" should be a list.')
    return []
  }
  const villains = []
  const seen = new Set()
  const text = (value) => (typeof value === 'string' ? value : '')
  list.forEach((card, i) => {
    const label = card?.name ? `"${card.name}"` : `villain #${i + 1}`
    if (!checkCard(card, label, seen, ['ac', 'hp'], problems)) return
    const attacks = parseAttacks(card, label, problems)
    const tactics = attacks && parseTactics(card, attacks, label, problems)
    if (!tactics) return
    let enraged = null
    if (card.enraged !== undefined) {
      const side = card.enraged
      const sideLabel = `${label}'s enraged side`
      if (!wholeNumber(side?.ac, 1) || !wholeNumber(side?.hp, 1)) return problems.push(`${sideLabel} needs an "ac" and an "hp".`)
      const sideAttacks = parseAttacks(side, sideLabel, problems)
      const sideTactics = sideAttacks && parseTactics(side, sideAttacks, sideLabel, problems)
      if (!sideTactics) return
      enraged = { name: text(side.name) || `Enraged ${card.name}`, ac: side.ac, hp: side.hp, attacks: sideAttacks, tactics: sideTactics }
    }
    seen.add(card.id)
    villains.push({
      id: card.id,
      name: card.name,
      fullName: text(card.fullName) || card.name,
      level: wholeNumber(card.level, 1) ? card.level : null,
      ac: card.ac,
      hp: card.hp,
      flavor: text(card.flavor),
      special: text(card.special),
      // What to do when it's put on the board (Ashardalon's breath card).
      onPlace: text(card.onPlace),
      // An adventure encounter card (by id) shuffled into the top 3 of the encounter deck when it appears.
      addEncounter: text(card.addEncounter),
      types: (Array.isArray(card.types) ? card.types : []).filter((t) => typeof t === 'string'),
      attacks,
      tactics,
      enraged,
    })
  })
  return villains
}

export const ENCOUNTER_TYPES = ['event', 'curse', 'environment', 'hazard', 'trap']
// Who an encounter or trap attacks: the active hero, the heroes on the active hero's
// tile, the heroes within 1 tile of the active hero, every hero, the heroes on the trap's tile,
// or the heroes within 1 tile of the card's villain (Ashardalon Breathes!).
export const ENCOUNTER_TARGETS = ['active', 'activeTile', 'within1', 'all', 'trapTile', 'villainWithin1']
const CURSE_PHASES = ['hero', 'exploration', 'villain', 'action']
const conditionList = (list) => (Array.isArray(list) ? list : []).filter((c) => CONDITIONS.includes(c))

function encounterAttack(attack) {
  if (!attack || !wholeNumber(attack.bonus) || !ENCOUNTER_TARGETS.includes(attack.targets)) return null
  return {
    bonus: attack.bonus,
    damage: wholeNumber(attack.damage) ? attack.damage : 0,
    miss: wholeNumber(attack.miss) ? attack.miss : 0,
    conditions: conditionList(attack.conditions),
    missConditions: conditionList(attack.missConditions),
    targets: attack.targets,
  }
}

const count = (value) => (wholeNumber(value, 1) ? value : 0)

// Encounter cards, for the virtual encounter deck. Optional. Every card is read out to
// the table; the extra fields say which parts the app can do itself.
function normalizeEncounters(list, problems) {
  if (list === undefined) return []
  if (!Array.isArray(list)) {
    problems.push('"encounters" should be a list.')
    return []
  }
  const encounters = []
  const seen = new Set()
  list.forEach((card, i) => {
    const label = card?.name ? `"${card.name}"` : `encounter #${i + 1}`
    if (!card || typeof card !== 'object') return problems.push(`${label} is not a card.`)
    if (!card.id || typeof card.id !== 'string') return problems.push(`${label} needs an "id".`)
    if (seen.has(card.id)) return problems.push(`${label} reuses the id "${card.id}".`)
    if (!card.name || typeof card.name !== 'string') return problems.push(`${label} needs a "name".`)
    if (!ENCOUNTER_TYPES.includes(card.type)) {
      return problems.push(`${label} has type "${card.type}"; use one of ${ENCOUNTER_TYPES.join(', ')}.`)
    }
    const attack = card.attack === undefined ? null : encounterAttack(card.attack)
    if (card.attack !== undefined && !attack) {
      return problems.push(`${label} has an attack that needs a "bonus" and "targets" (one of ${ENCOUNTER_TARGETS.join(', ')}).`)
    }
    const curse = card.type === 'curse' ? card.curse ?? {} : null
    const removeRoll = curse?.removeRoll
    if (removeRoll && (!CURSE_PHASES.includes(removeRoll.phase) || !wholeNumber(removeRoll.target, 1))) {
      return problems.push(`${label} has a removeRoll that needs a "phase" (${CURSE_PHASES.join(', ')}) and a "target".`)
    }
    const trap = card.type === 'trap' ? card.trap ?? {} : null
    const trapAttack = trap?.attack === undefined ? null : encounterAttack(trap.attack)
    if (trap?.attack !== undefined && !trapAttack) return problems.push(`${label} has a trap attack that needs a "bonus" and "targets".`)
    seen.add(card.id)
    encounters.push({
      id: card.id,
      name: card.name,
      type: card.type,
      copies: wholeNumber(card.copies, 1) ? card.copies : 1,
      flavor: typeof card.flavor === 'string' ? card.flavor : '',
      text: typeof card.text === 'string' ? card.text : '',
      attack,
      drawAnother: card.drawAnother === true,
      drawMonster: card.drawMonster === true,
      damageEach: count(card.damageEach),
      damagePoisoned: count(card.damagePoisoned),
      healMonster: count(card.healMonster),
      refreshDaily: card.refreshDaily === true,
      passMonsters: card.passMonsters === true,
      filterMonsters: typeof card.filterMonsters === 'string' ? card.filterMonsters : '',
      trapPenalty: count(card.trapPenalty),
      // Adventure cards stay out of the deck until something puts them in (a villain arriving).
      adventure: card.adventure === true,
      noCancel: card.noCancel === true,
      // The villain the card is about (by id): when it isn't in play, the card is just discarded.
      villain: typeof card.villain === 'string' ? card.villain : '',
      // Shuffled back in among the top cards of the deck instead of discarded.
      returnToTop: count(card.returnToTop),
      curse: curse && {
        acPenalty: count(curse.acPenalty),
        attackPenalty: count(curse.attackPenalty),
        startDamage: count(curse.startDamage),
        extraEncounter: count(curse.extraEncounter),
        removeOnDefeat: curse.removeOnDefeat === true,
        removeRoll: removeRoll
          ? { phase: removeRoll.phase, target: removeRoll.target, label: typeof removeRoll.label === 'string' ? removeRoll.label : '' }
          : null,
      },
      trap: trap && {
        attack: trapAttack,
        damage: count(trap.damage),
        disable: wholeNumber(trap.disable, 1) ? trap.disable : 10,
      },
    })
  })
  return encounters
}

// What a treasure item does when it's used, for the ones the app can do itself.
export const ITEM_USES = ['heal', 'endCondition', 'refreshPower', 'refreshAny', 'reduceDamage', 'levelUp', 'polymorph', 'reroll', 'caltrops', 'monsterControl', 'note']
export const ITEM_RANGES = ['adjacent', 'within1']
const ITEM_AFTER = ['flip', 'discard']

// Treasure cards, for the virtual treasure deck. Optional. Every card is an item the hero
// keeps: `inPlay` items work all the time, the rest wait until they're used. The extra
// fields say which parts the app can do itself.
function normalizeTreasures(list, problems) {
  if (list === undefined) return []
  if (!Array.isArray(list)) {
    problems.push('"treasures" should be a list.')
    return []
  }
  const treasures = []
  const seen = new Set()
  list.forEach((card, i) => {
    const label = card?.name ? `"${card.name}"` : `treasure #${i + 1}`
    if (!card || typeof card !== 'object') return problems.push(`${label} is not a card.`)
    if (!card.id || typeof card.id !== 'string') return problems.push(`${label} needs an "id".`)
    if (seen.has(card.id)) return problems.push(`${label} reuses the id "${card.id}".`)
    if (!card.name || typeof card.name !== 'string') return problems.push(`${label} needs a "name".`)
    if (card.use !== undefined && !ITEM_USES.includes(card.use)) {
      return problems.push(`${label} has use "${card.use}"; use one of ${ITEM_USES.join(', ')}.`)
    }
    if (card.after !== undefined && !ITEM_AFTER.includes(card.after)) {
      return problems.push(`${label} has after "${card.after}"; use flip or discard.`)
    }
    for (const field of ['attackRange', 'damageRange']) {
      if (card[field] !== undefined && !ITEM_RANGES.includes(card[field])) {
        return problems.push(`${label} has ${field} "${card[field]}"; use one of ${ITEM_RANGES.join(', ')}.`)
      }
    }
    const attackOf = (attack) =>
      attack && wholeNumber(attack.bonus) ? { bonus: attack.bonus, damage: wholeNumber(attack.damage) ? attack.damage : 1 } : null
    const attack = attackOf(card.attack)
    if (card.attack !== undefined && !attack) return problems.push(`${label} has an attack that needs a "bonus".`)
    const monsterAttack = attackOf(card.monsterAttack)
    if (card.monsterAttack !== undefined && !monsterAttack) return problems.push(`${label} has a monsterAttack that needs a "bonus".`)
    seen.add(card.id)
    treasures.push({
      id: card.id,
      name: card.name,
      copies: wholeNumber(card.copies, 1) ? card.copies : 1,
      flavor: typeof card.flavor === 'string' ? card.flavor : '',
      text: typeof card.text === 'string' ? card.text : '',
      inPlay: card.inPlay === true,
      after: card.after ?? null,
      attackBonus: count(card.attackBonus),
      attackRange: card.attackRange ?? null,
      stillBonus: count(card.stillBonus),
      damageBonus: count(card.damageBonus),
      damageRange: card.damageRange ?? null,
      critFrom: wholeNumber(card.critFrom, 2) && card.critFrom <= 20 ? card.critFrom : 0,
      acBonus: count(card.acBonus),
      tileAcBonus: count(card.tileAcBonus),
      speedBonus: count(card.speedBonus),
      trapBonus: count(card.trapBonus),
      attack,
      freeAttack: card.freeAttack === true,
      monsterAttack,
      use: card.use ?? null,
      heal: count(card.heal),
      tokens: wholeNumber(card.tokens, 1) ? card.tokens : 0,
      note: typeof card.note === 'string' ? card.note : '',
    })
  })
  return treasures
}

// What an adventure can do when its special tile is revealed. "placeVillain" is
// handled by the villain rules (PLACE_VILLAIN); the rest by the adventure rules in state/adventure.js.
export const REVEAL_ACTIONS = ['drawGuardians', 'placeToken', 'extraEncounters', 'placeVillain', 'chamber']
const strings = (list) => (Array.isArray(list) ? list : []).filter((s) => typeof s === 'string' && s.trim() !== '')
const text = (value) => (typeof value === 'string' ? value : '')

// Adventures from the adventure book, for the adventure picker. Optional. The book's
// words stay in cards.json on your own server, like the card text.
function normalizeAdventures(list, problems) {
  if (list === undefined) return []
  if (!Array.isArray(list)) {
    problems.push('"adventures" should be a list.')
    return []
  }
  const adventures = []
  const seen = new Set()
  list.forEach((adv, i) => {
    const label = adv?.title ? `"${adv.title}"` : `adventure #${i + 1}`
    if (!adv || typeof adv !== 'object') return problems.push(`${label} is not an adventure.`)
    if (!adv.id || typeof adv.id !== 'string') return problems.push(`${label} needs an "id".`)
    if (seen.has(adv.id)) return problems.push(`${label} reuses the id "${adv.id}".`)
    if (!adv.title || typeof adv.title !== 'string') return problems.push(`${label} needs a "title".`)
    const reveals = []
    for (const reveal of Array.isArray(adv.reveals) ? adv.reveals : []) {
      if (!reveal?.tile || typeof reveal.tile !== 'string') return problems.push(`${label} has a reveal that needs a "tile".`)
      const actions = []
      for (const action of Array.isArray(reveal.actions) ? reveal.actions : []) {
        if (!REVEAL_ACTIONS.includes(action?.type)) {
          return problems.push(`${label} has a reveal action "${action?.type}"; use one of ${REVEAL_ACTIONS.join(', ')}.`)
        }
        actions.push({ type: action.type, count: wholeNumber(action.count, 1) ? action.count : 1, name: text(action.name) })
      }
      // `door`: it happens when a door opens (the Hero Phase), not when a tile turns up.
      // `after`: it can't happen until that other reveal has.
      reveals.push({ tile: reveal.tile, story: text(reveal.story), steps: strings(reveal.steps), actions, door: reveal.door === true, after: text(reveal.after) })
    }
    const win = adv.win ?? {}
    seen.add(adv.id)
    adventures.push({
      id: adv.id,
      number: wholeNumber(adv.number, 1) ? adv.number : null,
      title: adv.title,
      blurb: text(adv.blurb),
      goal: text(adv.goal),
      players: text(adv.players),
      setup: strings(adv.setup),
      rules: (Array.isArray(adv.rules) ? adv.rules : [])
        .filter((r) => typeof r?.text === 'string')
        .map((r) => ({ name: text(r.name), text: r.text })),
      victoryText: text(adv.victoryText),
      defeatText: text(adv.defeatText),
      story: { start: text(adv.story?.start), victory: text(adv.story?.victory) },
      reveals,
      // What the app checks to call the victory. Every listed part has to be done.
      win: {
        figures: wholeNumber(win.figures, 1) ? win.figures : 0,
        guardians: win.guardians === true,
        tokens: strings(win.tokens),
        villains: strings(win.villains),
        escape: win.escape === true,
        chamber: win.chamber === true,
      },
      // Monster cards that come out once per game; later copies are discarded with no replacement.
      onceOnly: strings(adv.onceOnly),
      // Bigger features the adventure needs, such as "villains" or "chambers".
      needs: strings(adv.needs),
    })
  })
  return adventures
}

// Chamber cards: what fills a chamber when its entrance turns up, and the goal that
// wins the adventure. Optional; the card text stays in cards.json like the rest.
function normalizeChambers(list, problems) {
  if (list === undefined) return []
  if (!Array.isArray(list)) {
    problems.push('"chambers" should be a list.')
    return []
  }
  const chambers = []
  const seen = new Set()
  list.forEach((card, i) => {
    const label = card?.name ? `"${card.name}"` : `chamber #${i + 1}`
    if (!card || typeof card !== 'object') return problems.push(`${label} is not a chamber card.`)
    if (!card.id || typeof card.id !== 'string') return problems.push(`${label} needs an "id".`)
    if (seen.has(card.id)) return problems.push(`${label} reuses the id "${card.id}".`)
    if (!card.name || typeof card.name !== 'string') return problems.push(`${label} needs a "name".`)
    const objective = card.objective
    if (objective !== undefined && !(typeof objective?.name === 'string' && wholeNumber(objective.hp, 1) && wholeNumber(objective.ac, 1))) {
      return problems.push(`${label} has an "objective" that needs a "name", "hp" and "ac".`)
    }
    const monsters = card.monsters ?? {}
    const win = card.win ?? {}
    seen.add(card.id)
    chambers.push({
      id: card.id,
      name: card.name,
      setup: strings(card.setup),
      goal: text(card.goal),
      villain: text(card.villain),
      // Unknown Overlord: one of these, picked at random.
      villainFrom: strings(card.villainFrom),
      monsters: {
        perPlayer: wholeNumber(monsters.perPlayer, 0) ? monsters.perPlayer : 1,
        // A monster without one of these types is discarded once and another drawn.
        types: strings(monsters.types),
        // Same for a monster worth one of these XP values.
        redrawXp: (Array.isArray(monsters.redrawXp) ? monsters.redrawXp : []).filter((n) => wholeNumber(n, 0)),
      },
      objective: objective ? { name: objective.name, hp: objective.hp, ac: objective.ac } : null,
      win: {
        chamberMonsters: win.chamberMonsters === true,
        villain: win.villain === true,
        objective: win.objective === true,
        escape: win.escape === true,
        // A goal the app can't check: the players tap when it's done.
        manual: text(win.manual),
      },
      needs: strings(card.needs),
    })
  })
  return chambers
}
