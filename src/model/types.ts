import type { Vec2, Vec3 } from './vec'

export type BodyId = string
export type PartId = string
export type ConnectionId = string

/**
 * Um eixo de rotação independente.
 *
 * O movimento NÃO é integrado por corpo. A cada frame vale exatamente:
 *
 *     angle = phase + ratio * driverAngle
 *     omega = ratio * driverOmega
 *
 * `ratio` é o produto dos fatores de transmissão no caminho até a manivela e
 * `phase` é um offset fixo, recalculado pelo solver de modo a preservar o
 * ângulo atual do corpo. Isso elimina deriva de ponto flutuante: dois dentes
 * que começam encaixados continuam encaixados para sempre.
 */
export interface Body {
  id: BodyId
  /** Direção do eixo de rotação (unitário). Engrenagens na mesa usam +Y. */
  axis: Vec3
  angle: number
  omega: number
  ratio: number
  phase: number
  /** true quando o corpo é alcançado a partir da manivela. */
  driven: boolean
}

export type ConnectionKind = 'mesh' | 'compound' | 'belt' | 'crossedBelt' | 'bevel'

/**
 * Aresta de transmissão. `f` é o fator no sentido a→b: omega_b = omega_a * f.
 * No sentido b→a o solver usa 1/f.
 *
 *   mesh        f = −(N_a / N_b)      inverte o sentido
 *   compound    f = +1                mesmo eixo, rígido
 *   belt        f = +(r_a / r_b)      mantém o sentido
 *   crossedBelt f = −(r_a / r_b)      inverte (fora da paleta na v1)
 *   bevel       f = ±(N_a / N_b)      muda o eixo em 90°
 */
export interface Connection {
  id: ConnectionId
  a: BodyId
  b: BodyId
  kind: ConnectionKind
  f: number
  /**
   * Só em 'mesh': QUAIS rodas se tocam. Um corpo de compound tem duas rodas de
   * dentes diferentes, então o número de dentes do corpo não basta — a fase
   * precisa saber exatamente qual par está engrenado.
   */
  mesh?: {
    aPart: PartId
    bPart: PartId
    aTeeth: number
    bTeeth: number
  }
}

export type PartKind = 'spur' | 'compound' | 'bevel' | 'pulley' | 'gearPulley' | 'belt' | 'crank'

export type WheelKind = 'gear' | 'pulley' | 'bevelOut'

/**
 * Uma roda concreta presa a um corpo. É a unidade que o encaixe procura:
 * uma compound gear tem duas rodas no mesmo corpo, com números de dentes
 * diferentes, e qualquer uma delas pode engrenar.
 */
export interface Wheel {
  bodyId: BodyId
  kind: WheelKind
  /** Número de dentes (rodas 'gear' e 'bevelOut'). */
  teeth: number
  /** Raio de passo — para polia, o raio do cilindro. */
  radius: number
  /** Altura do centro da roda acima da mesa. */
  height: number
}

/** Uma peça posicionada na mesa. */
export interface PlacedPart {
  id: PartId
  kind: PartKind
  /** Posição do eixo principal na mesa. Correias não usam. */
  position: Vec2
  /** Corpos criados por esta peça (compound = 1, bevel = 2). */
  bodies: BodyId[]
  /** Rodas engrenáveis/pulháveis desta peça. */
  wheels: Wheel[]
  color: string

  /** 'belt': as duas peças de polia ligadas. */
  ends?: [PartId, PartId]
  /** 'crank': peça em cujo corpo a manivela está montada. */
  mountedOn?: PartId
  /** 'bevel': direção do eixo de saída, no plano da mesa. */
  outAxisAngle?: number

  /** Peça de cenário de uma lição: não pode ser movida nem apagada. */
  locked?: boolean
  /** Bandeirinha em cima da peça: é ela que a lição manda fazer girar. */
  marker?: 'alvo'
}

/** O estado completo de uma montagem. */
export interface Assembly {
  bodies: Map<BodyId, Body>
  connections: Map<ConnectionId, Connection>
  parts: Map<PartId, PlacedPart>
  /** Corpo da manivela — a entrada do trem. */
  driverBodyId: BodyId | null
  /** Ângulo da manivela. Toda a máquina é função dele. */
  driverAngle: number
  /** Velocidade angular da manivela (rad/s). */
  driverOmega: number
}

export function createAssembly(): Assembly {
  return {
    bodies: new Map(),
    connections: new Map(),
    parts: new Map(),
    driverBodyId: null,
    driverAngle: 0,
    driverOmega: 0,
  }
}

export function createBody(id: BodyId, axis: Vec3, angle = 0): Body {
  return { id, axis, angle, omega: 0, ratio: 0, phase: angle, driven: false }
}
