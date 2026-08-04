import { GEAR_SIZES } from '../config'
import { pitchRadius } from '../model/meshing'

/** Definição declarativa de uma peça que a paleta pode criar. */
export type PartSpec =
  | { kind: 'spur'; teeth: number }
  | { kind: 'compound'; bottomTeeth: number; topTeeth: number }
  | { kind: 'bevel'; inTeeth: number; outTeeth: number }
  | { kind: 'pulley'; radius: number }
  | { kind: 'gearPulley'; teeth: number; pulleyRadius: number }
  | { kind: 'belt' }
  | { kind: 'crank' }

export interface PaletteItem {
  id: string
  label: string
  /** Texto curto que aparece embaixo do ícone. */
  hint: string
  spec: PartSpec
}

export const PALETTE: PaletteItem[] = [
  ...GEAR_SIZES.map((teeth) => ({
    id: `spur-${teeth}`,
    label: `${teeth}`,
    hint: `${teeth} dentes`,
    spec: { kind: 'spur', teeth } as PartSpec,
  })),
  // Entra pela roda de baixo, sai pela de cima: a pequena embaixo acelera,
  // a grande embaixo freia.
  {
    id: 'compound-8-24',
    label: '8▸24',
    hint: 'acelera',
    spec: { kind: 'compound', bottomTeeth: 8, topTeeth: 24 },
  },
  {
    id: 'compound-24-8',
    label: '24▸8',
    hint: 'freia',
    spec: { kind: 'compound', bottomTeeth: 24, topTeeth: 8 },
  },
  {
    id: 'bevel-16-16',
    label: '90°',
    hint: 'cônica',
    spec: { kind: 'bevel', inTeeth: 16, outTeeth: 16 },
  },
  {
    id: 'pulley-small',
    label: 'ø1',
    hint: 'polia',
    spec: { kind: 'pulley', radius: pitchRadius(8) },
  },
  {
    id: 'pulley-big',
    label: 'ø2',
    hint: 'polia',
    spec: { kind: 'pulley', radius: pitchRadius(20) },
  },
  // Engrenagem com polia no mesmo eixo: é o que deixa a correia entrar num
  // trem de engrenagens em vez de ficar isolada, só ligando polia com polia.
  {
    id: 'gear-pulley-small',
    label: '12·ø1',
    hint: 'polia c/ dentes',
    spec: { kind: 'gearPulley', teeth: 12, pulleyRadius: pitchRadius(8) },
  },
  {
    id: 'gear-pulley-big',
    label: '12·ø2',
    hint: 'polia c/ dentes',
    spec: { kind: 'gearPulley', teeth: 12, pulleyRadius: pitchRadius(20) },
  },
]

/** Raio aproximado que a peça ocupa — usado para achar um lugar livre na mesa. */
export function specFootprint(spec: PartSpec): number {
  switch (spec.kind) {
    case 'spur':
      return pitchRadius(spec.teeth)
    case 'compound':
      return pitchRadius(Math.max(spec.bottomTeeth, spec.topTeeth))
    case 'bevel':
      return pitchRadius(spec.inTeeth)
    case 'pulley':
      return spec.radius
    case 'gearPulley':
      return Math.max(pitchRadius(spec.teeth), spec.pulleyRadius)
    default:
      return 1
  }
}
