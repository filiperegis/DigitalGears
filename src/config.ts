/**
 * Ponto único de ajuste do app. Mexer aqui muda tudo de forma coerente.
 */

export const APP_NAME = 'DigitalGears'

/**
 * Módulo das engrenagens: o "tamanho do dente".
 * TODAS as engrenagens do app usam o mesmo módulo — por isso quaisquer duas
 * se encaixam, e o que muda é só o número de dentes (igual aos kits de verdade).
 */
export const MODULE = 0.3

/** Espessura (altura) de uma engrenagem no eixo Y. */
export const GEAR_THICKNESS = 0.5

/** Tamanhos de engrenagem comum oferecidos na paleta (número de dentes). */
export const GEAR_SIZES = [8, 12, 16, 24, 32] as const

/**
 * Metade do lado da mesa de construção, em unidades de mundo.
 *
 * A maior engrenagem (32 dentes) tem ~5 de raio externo e duas delas precisam
 * de 9,6 entre centros. Uma mesa menor que esta não comporta duas das grandes
 * lado a lado, e tocar na paleta deixava de pôr peça.
 */
export const TABLE_HALF = 12

/** Passo da grade da mesa. */
export const GRID_STEP = 1

/** Tolerância de encaixe: o quão perto do encaixe perfeito o dedo precisa chegar. */
export const SNAP_TOLERANCE = 1.1

/**
 * Folga aceita entre "distância real" e "distância de encaixe" para registrar
 * um engrenamento (`rebuildMeshConnections`).
 *
 * Uma peça no meio de um trem de três (motor–meio–bandeira) precisa satisfazer
 * dois vizinhos ao mesmo tempo, mas só um deles pode ser o alvo exato do
 * encaixe (`computeSnap`) — o outro fica com a folga residual de onde o
 * PRIMEIRO vizinho grudou. Como os dentes são cosméticos (sem física), essa
 * folga é invisível bem acima do que qualquer arrasto de dedo residual produz;
 * 1e-3 era apertado demais e travava trens de 3+ engrenagens quase colineares.
 */
export const MESH_TOLERANCE = 0.02

/** Folga mínima antes de considerar que duas peças se sobrepõem. */
export const OVERLAP_EPSILON = 0.06

/** Velocidade padrão da manivela no modo "brincar" (rad/s). */
export const DEFAULT_SPEED = 1.2
export const MIN_SPEED = 0.2
export const MAX_SPEED = 4

/** Cores vivas e distintas, para a criança diferenciar as peças de relance. */
export const COLORS = {
  gear: ['#ef5f5f', '#4fa3f0', '#f5b23c', '#5fc98a', '#a97ce8', '#f07ec0'],
  compound: '#ff8a3d',
  bevel: '#37bfc0',
  pulley: '#8c6ff0',
  belt: '#3d4757',
  crank: '#2f3b4c',
  crankHandle: '#f5d33c',
  hub: '#33404f',
  table: '#f4f7fa',
  grid: '#c3d3e2',
  background: '#eaf4fb',
  highlight: '#ffe066',
  invalid: '#ff5252',
  jam: '#ff8a80',
} as const

/** Chaves do localStorage. */
export const STORAGE_KEYS = {
  unlocked: 'digitalgears.unlocked',
  builds: 'digitalgears.builds',
  lessonProgress: 'digitalgears.lessonProgress',
  settings: 'digitalgears.settings',
} as const

/** Versão do formato de save. Subir junto com mudanças incompatíveis. */
export const SAVE_FORMAT_VERSION = 1
