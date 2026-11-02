import { createContext, useContext } from 'react'

// The narrator ({ available, say, quiet }) for parts of the game screen deep down the tree
// (the first-game helper in the turn guide), so it needn't be passed through every screen.
export const VoiceContext = createContext(null)
export const useVoice = () => useContext(VoiceContext)
