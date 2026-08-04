/**
 * Vetores mínimos, sem Three.js — o modelo precisa rodar em teste sem browser.
 * Vec2 = posição na mesa (x, z). Vec3 = eixo de rotação.
 */

export interface Vec2 {
  x: number
  z: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const AXIS_UP: Vec3 = { x: 0, y: 1, z: 0 }

export function vec2(x: number, z: number): Vec2 {
  return { x, z }
}

export function add2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z }
}

export function sub2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, z: a.z - b.z }
}

export function len2(a: Vec2): number {
  return Math.hypot(a.x, a.z)
}

export function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function scale2(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, z: a.z * k }
}

export function normalize2(a: Vec2): Vec2 {
  const l = len2(a)
  return l < 1e-9 ? { x: 1, z: 0 } : { x: a.x / l, z: a.z / l }
}

/**
 * Ângulo da direção a→b no plano da mesa.
 *
 * Convenção: o ângulo é medido em torno do eixo +Y, e casa com a rotação de
 * uma engrenagem deitada na mesa. Em coordenadas Three.js, girar +Y move +X em
 * direção a −Z, então usamos atan2(−z, x) para que o ângulo cresça no mesmo
 * sentido da rotação positiva do corpo.
 */
export function angleBetween(from: Vec2, to: Vec2): number {
  return Math.atan2(-(to.z - from.z), to.x - from.x)
}

/** Ponto a uma distância `d` de `origin`, na direção `angle` (mesma convenção). */
export function pointAtAngle(origin: Vec2, angle: number, d: number): Vec2 {
  return { x: origin.x + Math.cos(angle) * d, z: origin.z - Math.sin(angle) * d }
}

export function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

/** true quando os dois eixos são ~perpendiculares (usado pela lição da cônica). */
export function isPerpendicular(a: Vec3, b: Vec3, toleranceRad = 0.2): boolean {
  const d = Math.abs(dot3(a, b))
  return d < Math.sin(toleranceRad)
}
