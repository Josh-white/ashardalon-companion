import { previouslyLine } from '../audio/narration.js'
import { heroArt } from '../data/art.js'
import { templateFor } from '../data/heroes.js'
import { useCards } from '../state/useCards.js'
import Art from './Art.jsx'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI']
const roman = (n) => ROMAN[n - 1] ?? String(n)
// The narrator's words without the stage directions.
const spoken = (line) => line.text.replace(/\[[^\]]*\]\s*/g, '')

// "The Chronicle", on the projector between a campaign's adventures: an open book with
// the chapters so far (each chamber beaten), how the last adventure went, and the
// heroes with their levels. The narrator reads the "Previously…" line as it opens.
export default function Chronicle({ campaign }) {
  const { chambers } = useCards()
  if (!campaign || campaign.games === 0) return null
  const chamberName = (id) => chambers.find((c) => c.id === id)?.name ?? id
  const chapter = campaign.games + 1
  return (
    <section className="grid gap-0 rounded-xl bg-[#5b2c14] p-[0.8vw] text-[#2b1a0e] shadow-[0_30px_80px_rgb(0_0_0/0.8)] sm:grid-cols-2">
      <div className="flex flex-col gap-[1vh] rounded-l-md bg-gradient-to-r from-[#e9d8b4] via-[#f3e6c8] to-[#cdb88f] p-[2.2vw]">
        <p className="text-[1vw] font-bold uppercase tracking-[0.3em] text-[#7c2d12]">The Chronicle of</p>
        <h2 className="font-display text-[2.6vw] font-black leading-tight text-[#7c2d12]">{campaign.card.title}</h2>
        <ul className="mt-[1vh] space-y-[0.6vh] font-display text-[1.4vw]">
          {campaign.beaten.map((id) => (
            <li key={id}>
              <span className="text-[#7c2d12]">✓</span> {chamberName(id)}
            </li>
          ))}
          <li className="font-bold text-[#991b1b]">
            ★ Chapter {roman(chapter)}: tonight, the next chamber
          </li>
        </ul>
      </div>
      <div className="flex flex-col gap-[1.4vh] rounded-r-md bg-gradient-to-r from-[#cdb88f] via-[#f3e6c8] to-[#e9d8b4] p-[2.2vw]">
        <p className="text-[1vw] font-bold uppercase tracking-[0.3em] text-[#7c2d12]">Previously</p>
        {campaign.last && <p className="font-display text-[1.6vw] italic leading-snug">“{spoken(previouslyLine(campaign.last)).replace(/^Previously…\s*/, '')}”</p>}
        {campaign.event && (
          <>
            <p className="text-[1vw] font-bold uppercase tracking-[0.3em] text-[#7c2d12]">A night in town</p>
            <div className="rounded-md border-2 border-[#7c2d12]/60 bg-[#f7ecd2] p-[1vw]">
              <p className="font-display text-[1.6vw] font-black text-[#7c2d12]">
                {campaign.event.icon} {campaign.event.title}
              </p>
              <p className="text-[1.2vw] leading-snug">{campaign.event.text}</p>
              <p className="mt-[0.4vh] text-[1.1vw] font-bold text-[#991b1b]">{campaign.event.effect}</p>
            </div>
          </>
        )}
        <p className="text-[1vw] font-bold uppercase tracking-[0.3em] text-[#7c2d12]">The party</p>
        <div className="grid grid-cols-5 gap-[1vw]">
          {campaign.heroes.map((h) => (
            <div key={h.key} className="flex flex-col items-center gap-1">
              <Art name={heroArt(h.key)} className="w-[5vw]" />
              <span className="font-display text-[1.2vw] font-bold">{templateFor(h.key)?.name ?? h.key}</span>
              <span className="text-[1vw]">Level {h.level}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
