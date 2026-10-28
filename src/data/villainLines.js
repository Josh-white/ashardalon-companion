// What each villain says when it arrives and when it falls, keyed by its card name,
// and which narrator voice says it (server/narrator.js picks the ElevenLabs voice for
// each). Beasts that can't talk get a line from the danger voice instead.
// Stage directions in square brackets ([menacing], [laughs]) are acted out by the
// expressive voices; the Pi drops them for older models.
export const VILLAIN_LINES = {
  'Kobold Dragonlord': {
    voice: 'meerak',
    arrive: "[shouting] Intruders in the Great Wyrm's halls! I am Meerak, and Ashardalon's flame guides my blade. [menacing] Kneel… or burn!",
    fall: '[weakly] My master… will avenge me…',
  },
  'Duergar Captain': {
    voice: 'margrath',
    arrive: '[menacing] Surface-dwellers, so far from the sun. I am Margrath, captain of the duergar of Firestorm Peak. Your bones will pave our road to the Underdark.',
    fall: '[weakly] The Underdark… does not forget…',
  },
  'Orc Storm Shaman': {
    voice: 'kraash',
    arrive: '[shouting] Hear the mountain roar! I am Kraash, and the storms of Firestorm Peak answer to me. [laughs] Let the lightning take you!',
    fall: '[weakly] The storm… is silent…',
  },
  Ashardalon: {
    voice: 'ashardalon',
    arrive: '[menacing] Who dares trespass in the lair of Ashardalon? I have burned kingdoms older than your bloodlines. [laughs] Come closer, little thieves… and become ash.',
    fall: '[angry] This is not… the end… of Ashardalon!',
  },
  Gauth: {
    voice: 'bellax',
    arrive: '[whispers] Ahh… more eyes to gaze upon me. I am Bellax. Soon the portal opens, and madness will drink this world dry. [laughs]',
    fall: '[weakly] The portal… was so close…',
  },
  Otyugh: {
    voice: 'danger',
    arrive: 'A stench rises from the refuse. Tentacles uncoil from the filth as the otyugh rises, hungry for fresh meat!',
    fall: 'The otyugh sinks back into the filth, never to rise again.',
  },
  'Rage Drake': {
    voice: 'danger',
    arrive: 'Claws scrape on stone. The rage drake lowers its horned head and charges!',
    enraged: 'Bloodied and furious, the rage drake rears up with a deafening roar!',
    fall: 'With a final shriek, the rage drake crashes to the ground.',
  },
}
export const VILLAIN_DEFAULT = {
  voice: 'villain',
  arrive: '[menacing] So, heroes… you have come far into my domain. You will go no farther.',
  enraged: '[shouting] Enough! Now you will see my true power!',
  fall: '[weakly] This… cannot be…',
}
