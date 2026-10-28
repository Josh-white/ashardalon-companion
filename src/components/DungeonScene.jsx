// A picture of where the party is in the dungeon (state/area.js), drawn behind
// everything: stone halls, caves, lava, the chambers. It's all drawn here as shapes,
// so there are no image files to copy around, and it's dim enough to read over.

const W = 1600
const H = 900

// The same "random" stones every time a scene is drawn.
function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// Rows of stone blocks, each a slightly different shade.
function Bricks({ y = 0, height = H, size = 64, colors, seed = 1 }) {
  const rand = seeded(seed)
  const rows = []
  for (let row = 0; row * size < height; row++) {
    const offset = row % 2 ? -size : 0
    for (let x = offset; x < W; x += size * 2) {
      const c = colors[Math.floor(rand() * colors.length)]
      rows.push(<rect key={`${row}-${x}`} x={x + 3} y={y + row * size + 3} width={size * 2 - 6} height={size - 6} rx={6} fill={c} />)
    }
  }
  return <g>{rows}</g>
}

function Torch({ x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle r={170} fill="url(#torch-glow)" className="scene-flicker" />
      <rect x={-7} y={0} width={14} height={60} rx={3} fill="#3f2a18" />
      <path d="M-20 0 h40 l-8 14 h-24 z" fill="#57534e" />
      <path d="M0 -55 C18 -30 20 -12 0 0 C-20 -12 -18 -30 0 -55 Z" fill="#f59e0b" className="scene-flame" />
      <path d="M0 -30 C9 -18 9 -8 0 0 C-9 -8 -9 -18 0 -30 Z" fill="#fde68a" className="scene-flame" />
    </g>
  )
}

// A doorway into the dark, with a few steps going down.
function Archway({ x, w, h, fill = '#030303', glow }) {
  const top = H - 130 - h
  return (
    <g>
      <path d={`M${x - 30} ${H - 130} V${top + w / 2} A${w / 2 + 30} ${w / 2 + 30} 0 0 1 ${x + w + 30} ${top + w / 2} V${H - 130} Z`} fill="#44403c" />
      <path d={`M${x} ${H - 130} V${top + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${top + w / 2} V${H - 130} Z`} fill={glow ? 'url(#daylight)' : fill} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={x - 20 + i * 12} y={H - 130 + i * 20} width={w + 40 - i * 24} height={20} fill={['#57534e', '#44403c', '#292524'][i]} />
      ))}
    </g>
  )
}

// A flagstone floor in perspective.
function Floor({ top = H - 130, color = '#1c1917', line = '#0c0a09' }) {
  return (
    <g>
      <rect x={0} y={top} width={W} height={H - top} fill={color} />
      {[0, 1, 2, 3].map((i) => (
        <line key={`h${i}`} x1={0} x2={W} y1={top + 12 + i * i * 10 + i * 14} y2={top + 12 + i * i * 10 + i * 14} stroke={line} strokeWidth={4} />
      ))}
      {Array.from({ length: 13 }, (_, i) => (
        <line key={`v${i}`} x1={W / 2 + (i - 6) * 70} y1={top} x2={W / 2 + (i - 6) * 260} y2={H} stroke={line} strokeWidth={4} />
      ))}
    </g>
  )
}

// Jagged rock: stalactites hanging from the top, walls at the sides, stalagmites below.
function Cave({ color = '#0f172a', seed = 3, floor = true }) {
  const rand = seeded(seed)
  const spikes = (y, dir, count, maxLen) => {
    let d = `M0 ${y}`
    for (let i = 0; i <= count; i++) {
      const x = (i / count) * W
      const len = 20 + rand() * maxLen
      d += ` L${x - W / count / 2} ${y} L${x} ${y + dir * len}`
    }
    return `${d} L${W} ${y} Z`
  }
  return (
    <g fill={color}>
      <path d={spikes(0, 1, 26, 170)} />
      {floor && <path d={spikes(H, -1, 18, 110)} />}
      <path d={`M0 0 L170 0 C120 200 210 330 140 470 C90 600 200 700 120 ${H} L0 ${H} Z`} />
      <path d={`M${W} 0 L${W - 160} 0 C${W - 110} 220 ${W - 220} 320 ${W - 130} 500 C${W - 70} 640 ${W - 200} 760 ${W - 120} ${H} L${W} ${H} Z`} />
    </g>
  )
}

// Rough cave rock: overlapping boulders in a few shades.
function Rock({ colors, seed = 13 }) {
  const rand = seeded(seed)
  return (
    <g>
      <rect width={W} height={H} fill={colors[0]} />
      {Array.from({ length: 70 }, (_, i) => (
        <ellipse
          key={i}
          cx={rand() * W}
          cy={rand() * H}
          rx={60 + rand() * 140}
          ry={40 + rand() * 80}
          fill={colors[1 + Math.floor(rand() * (colors.length - 1))]}
          opacity={0.9}
        />
      ))}
    </g>
  )
}

function Crystal({ x, y, size = 1, color }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`} className="scene-glow">
      <circle r={70} fill={color} opacity={0.18} />
      <path d="M0 0 L-14 -60 L0 -90 L14 -60 Z" fill={color} />
      <path d="M-10 0 L-36 -40 L-28 -58 L-14 -30 Z" fill={color} opacity={0.75} />
      <path d="M10 0 L34 -46 L26 -62 L14 -30 Z" fill={color} opacity={0.75} />
    </g>
  )
}

// Sparks or bubbles drifting up from below.
function Rising({ count = 24, color, seed = 9, size = 5 }) {
  const rand = seeded(seed)
  return (
    <g fill={color}>
      {Array.from({ length: count }, (_, i) => (
        <circle
          key={i}
          cx={rand() * W}
          cy={H - 40 - rand() * 120}
          r={size * (0.5 + rand())}
          className="scene-rise"
          style={{ animationDelay: `${-rand() * 8}s`, animationDuration: `${6 + rand() * 6}s` }}
        />
      ))}
    </g>
  )
}

function Lava({ top = H - 150 }) {
  return (
    <g>
      <path d={`M0 ${top} C200 ${top - 30} 400 ${top + 30} 600 ${top} S1000 ${top - 25} 1200 ${top} S1500 ${top + 20} ${W} ${top} V${H} H0 Z`} fill="url(#lava)" className="scene-glow" />
      <path d={`M0 ${top + 50} C300 ${top + 30} 500 ${top + 70} 800 ${top + 50} S1300 ${top + 30} ${W} ${top + 55}`} stroke="#fde047" strokeWidth={4} fill="none" opacity={0.6} />
      <Rising color="#fb923c" count={36} />
    </g>
  )
}

function Pillar({ x, w = 90, color = '#292524', cap = '#44403c' }) {
  return (
    <g>
      <rect x={x} y={60} width={w} height={H - 190} fill={color} />
      {[0.25, 0.5, 0.75].map((f) => (
        <rect key={f} x={x + w * f - 3} y={70} width={6} height={H - 210} fill="#0c0a09" opacity={0.4} />
      ))}
      <rect x={x - 18} y={40} width={w + 36} height={30} fill={cap} />
      <rect x={x - 18} y={H - 150} width={w + 36} height={30} fill={cap} />
    </g>
  )
}

// A glowing circle of runes on the floor.
function RuneCircle({ color }) {
  const cx = W / 2
  const cy = H - 70
  return (
    <g stroke={color} fill="none" strokeWidth={4} className="scene-glow">
      <ellipse cx={cx} cy={cy} rx={360} ry={60} />
      <ellipse cx={cx} cy={cy} rx={300} ry={46} strokeDasharray="18 14" />
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2
        const x = cx + Math.cos(a) * 330
        const y = cy + Math.sin(a) * 53
        return <path key={i} d={`M${x - 8} ${y - 8} L${x + 8} ${y + 8} M${x + 8} ${y - 8} L${x} ${y}`} />
      })}
    </g>
  )
}

function Bones({ x, y, color = '#d6d3d1' }) {
  return (
    <g fill={color} opacity={0.8} transform={`translate(${x} ${y})`}>
      <circle cx={0} cy={0} r={26} />
      <rect x={-14} y={14} width={28} height={16} rx={4} />
      <circle cx={-9} cy={-2} r={7} fill="#0c0a09" />
      <circle cx={9} cy={-2} r={7} fill="#0c0a09" />
      <rect x={40} y={10} width={90} height={12} rx={6} transform="rotate(-12 40 10)" />
      <rect x={-130} y={18} width={90} height={12} rx={6} transform="rotate(10 -130 18)" />
    </g>
  )
}

function Drips({ color, seed = 5 }) {
  const rand = seeded(seed)
  return (
    <g fill={color}>
      {Array.from({ length: 22 }, (_, i) => {
        const x = rand() * W
        const len = 40 + rand() * 160
        return <path key={i} d={`M${x - 14} 0 L${x - 6} ${len} A6 6 0 0 0 ${x + 6} ${len} L${x + 14} 0 Z`} />
      })}
    </g>
  )
}

function Gold({ x, y, size = 1 }) {
  const rand = seeded(Math.round(x))
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <ellipse cx={0} cy={0} rx={190} ry={70} fill="#a16207" />
      <ellipse cx={0} cy={-20} rx={140} ry={60} fill="#ca8a04" />
      <ellipse cx={0} cy={-40} rx={80} ry={45} fill="#eab308" />
      {Array.from({ length: 18 }, (_, i) => (
        <ellipse key={i} cx={(rand() - 0.5) * 300} cy={-rand() * 70} rx={12} ry={6} fill="#fde047" className={i % 4 ? '' : 'scene-twinkle'} />
      ))}
    </g>
  )
}

function Chest({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-80} y={-70} width={160} height={70} fill="#78350f" />
      <path d="M-80 -70 A80 40 0 0 1 80 -70 Z" fill="#92400e" />
      <rect x={-80} y={-74} width={160} height={10} fill="#a16207" />
      <rect x={-12} y={-60} width={24} height={30} fill="#facc15" />
    </g>
  )
}

function Banner({ x, color }) {
  return (
    <g>
      <rect x={x - 6} y={60} width={152} height={10} fill="#57534e" />
      <path d={`M${x} 70 h140 v320 l-70 -50 l-70 50 Z`} fill={color} />
      <circle cx={x + 70} cy={200} r={34} fill="none" stroke="#fbbf24" strokeWidth={6} />
    </g>
  )
}

function Eyes({ x, y, color = '#ef4444', gap = 60, size = 14 }) {
  return (
    <g fill={color} className="scene-blink">
      <ellipse cx={x - gap / 2} cy={y} rx={size} ry={size / 2.2} />
      <ellipse cx={x + gap / 2} cy={y} rx={size} ry={size / 2.2} />
    </g>
  )
}

// Ashardalon himself: a great winged shadow over the fire.
function Dragon() {
  return (
    <g fill="#050202">
      <path d="M800 470 C700 380 560 300 300 200 C380 300 360 330 260 330 C360 380 360 420 280 450 C420 460 520 480 640 560 Z" />
      <path d="M800 470 C900 380 1040 300 1300 200 C1220 300 1240 330 1340 330 C1240 380 1240 420 1320 450 C1180 460 1080 480 960 560 Z" />
      <path d="M690 820 C680 650 720 520 800 460 C880 520 920 650 910 820 Z" />
      <path d="M800 470 C780 380 770 300 800 230 C830 300 820 380 800 470 Z" />
      <path d="M760 250 L800 150 L840 250 C830 290 770 290 760 250 Z" />
      <path d="M775 175 L745 110 L790 160 Z M825 175 L855 110 L810 160 Z" />
      <Eyes x={800} y={225} gap={34} size={9} color="#fbbf24" />
    </g>
  )
}

function Swords({ seed = 4 }) {
  const rand = seeded(seed)
  return (
    <g>
      {Array.from({ length: 9 }, (_, i) => {
        const x = 120 + i * 170 + rand() * 60
        const lean = (rand() - 0.5) * 40
        const tall = 140 + rand() * 80
        return i % 3 === 1 ? (
          <g key={i} transform={`translate(${x} ${H - 100}) rotate(${lean})`}>
            <ellipse cx={0} cy={-50} rx={50} ry={60} fill="#44403c" stroke="#57534e" strokeWidth={6} />
            <circle cx={0} cy={-50} r={14} fill="#78716c" />
          </g>
        ) : (
          <g key={i} transform={`translate(${x} ${H - 110}) rotate(${lean})`}>
            <rect x={-6} y={-tall} width={12} height={tall} fill="#78716c" />
            <rect x={-30} y={-tall - 4} width={60} height={10} fill="#57534e" />
            <rect x={-5} y={-tall - 44} width={10} height={40} fill="#3f2a18" />
          </g>
        )
      })}
    </g>
  )
}

const STONE = ['#292524', '#2b2724', '#24201e', '#302b28', '#1f1b19']
const SLATE = ['#1e293b', '#1f2937', '#172033', '#243042', '#1a2232']

const SCENES = {
  start: () => (
    <>
      <Bricks colors={STONE} />
      <Archway x={W / 2 - 150} w={300} h={470} />
      <Floor />
      <Torch x={W / 2 - 300} y={330} />
      <Torch x={W / 2 + 300} y={330} />
    </>
  ),
  battlefield: () => (
    <>
      <rect width={W} height={H} fill="url(#dusk)" />
      <Floor top={H - 180} color="#292524" />
      <Swords />
      <Bones x={W / 2 + 40} y={H - 60} />
    </>
  ),
  halls: () => (
    <>
      <Bricks colors={STONE} seed={7} />
      <Floor />
      <Torch x={260} y={330} />
      <Torch x={W - 260} y={330} />
      <Archway x={W / 2 - 110} w={220} h={360} />
    </>
  ),
  tunnels: () => (
    <>
      <Rock colors={SLATE} seed={11} />
      <Cave color="#020617" />
      <Crystal x={260} y={H - 40} size={1.3} color="#22d3ee" />
      <Crystal x={W - 300} y={H - 60} color="#2dd4bf" />
      <Crystal x={W / 2 + 380} y={H - 20} size={0.7} color="#67e8f9" />
      <Drips color="#020617" seed={12} />
    </>
  ),
  depths: () => (
    <>
      <rect width={W} height={H} fill="url(#ember-sky)" />
      <Cave color="#0c0504" seed={17} floor={false} />
      <Lava />
    </>
  ),
  'dire-chamber': () => (
    <>
      <Bricks colors={['#1e1b2e', '#211d33', '#1a1728', '#251f3a']} seed={21} />
      <Floor color="#13111c" />
      <RuneCircle color="#a855f7" />
      <Pillar x={140} />
      <Pillar x={420} />
      <Pillar x={W - 230} />
      <Pillar x={W - 510} />
      <Torch x={W / 2} y={260} scale={0.9} />
    </>
  ),
  'horrid-chamber': () => (
    <>
      <Bricks colors={['#1a2210', '#1c2612', '#161d0d', '#202b14']} seed={23} />
      <Drips color="#4d7c0f" seed={24} />
      <Floor color="#11160b" />
      <Bones x={360} y={H - 80} />
      <Bones x={W - 400} y={H - 60} />
      <Rising color="#84cc16" count={20} size={9} seed={25} />
    </>
  ),
  chamber: () => (
    <>
      <Bricks colors={STONE} seed={31} />
      <Floor />
      <Pillar x={220} />
      <Pillar x={W - 310} />
      <RuneCircle color="#c084fc" />
    </>
  ),
  vault: () => (
    <>
      <Bricks colors={STONE} seed={41} />
      <Floor color="#1c1917" />
      <Gold x={W / 2} y={H - 90} size={1.4} />
      <Gold x={300} y={H - 60} size={0.8} />
      <Gold x={W - 320} y={H - 70} size={0.9} />
      <Chest x={W / 2 - 330} y={H - 70} />
      <Chest x={W / 2 + 340} y={H - 60} />
      <Torch x={150} y={300} />
      <Torch x={W - 150} y={300} />
    </>
  ),
  exit: () => (
    <>
      <Bricks colors={STONE} seed={51} />
      <path d={`M${W / 2 - 170} ${H - 130} L${W / 2 - 600} ${H} H${W / 2 + 600} L${W / 2 + 170} ${H - 130} Z`} fill="url(#daylight)" opacity={0.25} />
      <Floor />
      <Archway x={W / 2 - 170} w={340} h={520} glow />
    </>
  ),
  villain: () => (
    <>
      <Bricks colors={['#1f1316', '#22141a', '#1a1013', '#27161c']} seed={61} />
      <Floor color="#120a0c" />
      <Banner x={200} color="#831843" />
      <Banner x={W - 340} color="#831843" />
      <Archway x={W / 2 - 160} w={320} h={460} />
      <Eyes x={W / 2} y={H - 400} />
      <Torch x={W / 2 - 330} y={330} />
      <Torch x={W / 2 + 330} y={330} />
    </>
  ),
  ashardalon: () => (
    <>
      <rect width={W} height={H} fill="url(#ember-sky)" />
      <Cave color="#0c0504" seed={71} floor={false} />
      <Dragon />
      <Lava top={H - 110} />
    </>
  ),
}

export const SCENE_KEYS = Object.keys(SCENES)

export default function DungeonScene({ area, className = '' }) {
  const Scene = SCENES[area]
  if (!Scene) return null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <radialGradient id="torch-glow">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
        </radialGradient>
        <linearGradient id="lava" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="40%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#7c2d12" />
        </linearGradient>
        <linearGradient id="ember-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c0504" />
          <stop offset="70%" stopColor="#431407" />
          <stop offset="100%" stopColor="#9a3412" />
        </linearGradient>
        <linearGradient id="daylight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bae6fd" />
          <stop offset="70%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#fef3c7" />
        </linearGradient>
        <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c1917" />
          <stop offset="100%" stopColor="#57534e" />
        </linearGradient>
      </defs>
      <Scene />
    </svg>
  )
}
