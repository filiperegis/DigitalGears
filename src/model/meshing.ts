import { MODULE } from '../config'
import { angleBetween, dist2, pointAtAngle, type Vec2 } from './vec'

const TAU = Math.PI * 2

/** Raio de passo: o círculo "efetivo" onde duas engrenagens rolam sem escorregar. */
export function pitchRadius(teeth: number, m = MODULE): number {
  return (m * teeth) / 2
}

/** Raio externo (ponta do dente). */
export function outerRadius(teeth: number, m = MODULE): number {
  return pitchRadius(teeth, m) + m
}

/** Raio de raiz (fundo entre dentes). */
export function rootRadius(teeth: number, m = MODULE): number {
  return Math.max(pitchRadius(teeth, m) - 1.25 * m, m * 0.6)
}

/** Distância exata entre centros para duas engrenagens engrenarem. */
export function meshDistance(teethA: number, teethB: number, m = MODULE): number {
  return pitchRadius(teethA, m) + pitchRadius(teethB, m)
}

export function normalizeAngle(a: number): number {
  const r = a % TAU
  return r < 0 ? r + TAU : r
}

/** Diferença angular menor, em (−π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = normalizeAngle(to - from)
  if (d > Math.PI) d -= TAU
  return d
}

/**
 * Ângulo em que a engrenagem B precisa estar para os dentes lerem como
 * encaixados com A, no instante em que a conexão é criada.
 *
 * Condição de rolamento sem escorregar, com meio passo de defasagem (um dente
 * de A cai na folga de B), medida na linha que liga os dois centros:
 *
 *     N_A·(φ_A − θ) + N_B·(φ_B − θ − π) ≡ π   (mod 2π)
 *
 * onde θ é o ângulo da direção do centro de A para o centro de B. Isolando φ_B:
 *
 *     φ_B = θ + π + (π − N_A·(φ_A − θ)) / N_B
 *
 * Como as duas giram na razão exata N_A·ω_A = −N_B·ω_B, essa defasagem inicial
 * se mantém para sempre — não é preciso simular contato de dentes.
 */
export function meshPhaseAngle(
  teethA: number,
  angleA: number,
  teethB: number,
  centerA: Vec2,
  centerB: Vec2,
): number {
  const theta = angleBetween(centerA, centerB)
  return theta + Math.PI + (Math.PI - teethA * (angleA - theta)) / teethB
}

/** Verifica a condição de engrenamento. Usado nos testes. */
export function meshError(
  teethA: number,
  angleA: number,
  teethB: number,
  angleB: number,
  centerA: Vec2,
  centerB: Vec2,
): number {
  const theta = angleBetween(centerA, centerB)
  const lhs = teethA * (angleA - theta) + teethB * (angleB - theta - Math.PI)
  return Math.abs(angleDelta(Math.PI, lhs))
}

/** true quando dois discos de raio dado se sobrepõem além da folga. */
export function overlaps(
  centerA: Vec2,
  radiusA: number,
  centerB: Vec2,
  radiusB: number,
  epsilon: number,
): boolean {
  return dist2(centerA, centerB) < radiusA + radiusB - epsilon
}

export interface BeltPath {
  /** Polilinha fechada do laço, no plano da mesa. */
  points: Vec2[]
  /** Comprimento total da correia. */
  length: number
  /** Comprimento se as polias estivessem encostadas — base para o estiramento. */
  restLength: number
}

/**
 * Laço fechado de uma correia aberta em volta de duas polias: duas tangentes
 * externas + os dois arcos de abraçamento. Como as tangentes externas têm a
 * mesma normal nos dois círculos, as polias giram no MESMO sentido.
 */
export function beltPath(
  centerA: Vec2,
  radiusA: number,
  centerB: Vec2,
  radiusB: number,
  arcSegments = 24,
): BeltPath | null {
  const d = dist2(centerA, centerB)
  // Polias sobrepostas: não existe correia possível. (A tangente externa até
  // teria solução matemática para raios iguais, mas não é uma máquina real.)
  if (d < radiusA + radiusB) return null

  const theta = angleBetween(centerA, centerB)
  const alpha = Math.acos(clamp((radiusA - radiusB) / d, -1, 1))

  const points: Vec2[] = []

  // Arco na polia A: do lado oposto a B, de θ−α descendo até θ+α−2π.
  // Termina no ponto de tangência; o salto para a polia B é a reta da correia.
  pushArc(points, centerA, radiusA, theta - alpha, theta + alpha - TAU, arcSegments)
  // Arco na polia B, começando no outro ponto de tangência: o salto entre os
  // dois arcos é exatamente o trecho reto da correia.
  pushArc(points, centerB, radiusB, theta + alpha, theta - alpha, arcSegments)
  // A tangente B → A fecha o laço de volta no primeiro ponto.

  const straight = 2 * Math.sqrt(Math.max(d * d - (radiusA - radiusB) ** 2, 0))
  const wrapA = radiusA * (TAU - 2 * alpha)
  const wrapB = radiusB * (2 * alpha)

  return {
    points,
    length: straight + wrapA + wrapB,
    restLength: Math.PI * (radiusA + radiusB),
  }
}

function pushArc(
  out: Vec2[],
  center: Vec2,
  radius: number,
  fromAngle: number,
  toAngle: number,
  segments: number,
): void {
  for (let i = 0; i <= segments; i++) {
    const a = fromAngle + ((toAngle - fromAngle) * i) / segments
    out.push(pointAtAngle(center, a, radius))
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
