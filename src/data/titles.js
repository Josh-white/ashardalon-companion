// The titles a player earns across all their games, shown in the lobby, on the recap and
// in the Hall of Records. The first one a player has earned, top to bottom, is the one
// shown next to their name, so the hardest titles go at the top.
//
// To add a title, add a line: `earned` gets the player's record (state/records.js
// playerRecords) and says whether they have it; `how` tells a player who hasn't earned it
// yet what to do. A record has: games, wins, losses, kills, damageDealt, biggestHit,
// nat20s, nat1s, damageTaken, downs, treasure, mvps, heroes (hero keys played),
// villains (villain names beaten), flawlessWins (won without being knocked down).
export const TITLES = [
  { key: 'dragon-slayer', emoji: '🐉', title: 'Dragon-Slayer', how: 'Defeat Ashardalon himself', earned: (r) => r.villains.some((v) => /ashardalon/i.test(v)) },
  { key: 'legend', emoji: '🌟', title: 'Legend', how: 'Win 10 games', earned: (r) => r.wins >= 10 },
  { key: 'untouchable', emoji: '🛡️', title: 'Untouchable', how: 'Win a game without getting knocked down', earned: (r) => r.flawlessWins >= 1 },
  { key: 'villain-vanquisher', emoji: '😈', title: 'Villain Vanquisher', how: 'Beat a villain', earned: (r) => r.villains.length > 0 },
  { key: 'champion', emoji: '🏆', title: 'Champion', how: 'Win 3 games', earned: (r) => r.wins >= 3 },
  { key: 'monster-masher', emoji: '⚔️', title: 'Monster Masher', how: 'Defeat 25 monsters', earned: (r) => r.kills >= 25 },
  { key: 'mvp-star', emoji: '👑', title: 'MVP Star', how: 'Be MVP of 3 games', earned: (r) => r.mvps >= 3 },
  { key: 'lucky', emoji: '🍀', title: 'Lucky', how: 'Roll 5 natural 20s', earned: (r) => r.nat20s >= 5 },
  { key: 'big-hitter', emoji: '💥', title: 'Big Hitter', how: 'Deal 4 damage with one hit', earned: (r) => r.biggestHit >= 4 },
  { key: 'treasure-hoarder', emoji: '💰', title: 'Treasure Hoarder', how: 'Find 10 treasures', earned: (r) => r.treasure >= 10 },
  { key: 'many-faces', emoji: '🎭', title: 'Hero of Many Faces', how: 'Play all five heroes', earned: (r) => r.heroes.length >= 5 },
  { key: 'never-gives-up', emoji: '🔥', title: 'Never Gives Up', how: 'Get knocked down 5 times and keep fighting', earned: (r) => r.downs >= 5 },
  { key: 'dice-gremlin', emoji: '🙈', title: 'Dice Gremlin', how: 'Roll 10 natural 1s (oops)', earned: (r) => r.nat1s >= 10 },
  { key: 'adventurer', emoji: '🗺️', title: 'Adventurer', how: 'Play 5 games', earned: (r) => r.games >= 5 },
  { key: 'first-quest', emoji: '🌱', title: 'First Quest', how: 'Finish your first game', earned: (r) => r.games >= 1 },
]
