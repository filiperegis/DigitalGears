import { PALETTE, type PaletteItem } from '../parts/partCatalog'

/**
 * Paleta de peças. Tocar cria a peça na mesa já selecionada — é mais tolerante
 * no dedo do que arrastar de um menu HTML para dentro do WebGL.
 */
export function Palette({
  allowed,
  onPick,
}: {
  /** Ids liberados; `null` libera tudo (Modo Livre). */
  allowed: string[] | null
  onPick: (item: PaletteItem) => void
}) {
  const items = allowed === null ? PALETTE : PALETTE.filter((item) => allowed.includes(item.id))
  if (items.length === 0) return null

  return (
    <div className="paleta" role="toolbar" aria-label="Peças">
      {items.map((item) => (
        <button key={item.id} className="peca" onClick={() => onPick(item)} title={item.hint}>
          <span className="roda">{iconFor(item)}</span>
          <span className="rotulo">{item.label}</span>
          <span className="hint">{item.hint}</span>
        </button>
      ))}
    </div>
  )
}

function iconFor(item: PaletteItem): string {
  switch (item.spec.kind) {
    case 'compound':
      return '🥞'
    case 'bevel':
      return '📐'
    case 'pulley':
      return '⭕'
    case 'gearPulley':
      return '🛞'
    default:
      return '⚙️'
  }
}
