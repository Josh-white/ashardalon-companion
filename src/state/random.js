// Dice and shuffles use the browser's crypto randomness. The device rolls and sends
// the numbers with its action, so the server and Undo replay the same result.
export function randomNumbers(count) {
  const values = new Uint32Array(count)
  crypto.getRandomValues(values)
  return Array.from(values, (v) => v / 2 ** 32)
}

export const rollD20 = () => Math.floor(randomNumbers(1)[0] * 20) + 1

// Random numbers for one shuffle, enough for the biggest deck (the encounter deck).
export const SHUFFLE_NUMBERS = 128
export const shuffleNumbers = () => randomNumbers(SHUFFLE_NUMBERS)
