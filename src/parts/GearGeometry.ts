import * as THREE from 'three'
import { GEAR_THICKNESS, MODULE } from '../config'
import { outerRadius, pitchRadius, rootRadius } from '../model/meshing'

/**
 * Geração procedural da engrenagem.
 *
 * Os dentes são COSMÉTICOS: quem resolve o movimento é o solver cinemático.
 * O perfil é trapezoidal arredondado em vez de involuta exata — a diferença é
 * invisível no tamanho em que a criança vê a peça, e o custo é bem menor.
 *
 * A única medida que precisa estar certa é a espessura do dente no círculo de
 * passo: exatamente metade do passo circular. É isso que faz um dente de A
 * caber na folga de B, casando com a fase calculada em `meshPhaseAngle`.
 */

/** Frações do passo angular (2π/N), medidas de cada lado do centro do dente. */
const ROOT_HALF = 0.3
const PITCH_HALF = 0.25 // metade do passo: a medida que importa
const TIP_HALF = 0.17

const ARC_SAMPLES = 3

const gearCache = new Map<string, THREE.ExtrudeGeometry>()
const bevelCache = new Map<string, THREE.BufferGeometry>()

/** Raio do furo central (o eixo). */
export function hubRadius(teeth: number, m = MODULE): number {
  return Math.max(m * 1.1, rootRadius(teeth, m) * 0.26)
}

function polar(radius: number, angle: number): THREE.Vector2 {
  return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius)
}

/**
 * Contorno 2D da engrenagem, no plano XY da shape.
 * Um dente fica centrado no ângulo local 0 — é essa a referência que a fase de
 * engrenamento assume.
 */
export function gearOutline(teeth: number, m = MODULE): THREE.Vector2[] {
  const rRoot = rootRadius(teeth, m)
  const rPitch = pitchRadius(teeth, m)
  const rTip = outerRadius(teeth, m)
  const pitchAngle = (Math.PI * 2) / teeth

  const points: THREE.Vector2[] = []

  for (let i = 0; i < teeth; i++) {
    const center = i * pitchAngle

    // Folga: arco no raio de raiz, do meio do vão anterior até a base do dente.
    pushArc(points, rRoot, center - pitchAngle / 2, center - ROOT_HALF * pitchAngle)
    // Flanco subindo, passando pelo círculo de passo.
    points.push(polar(rPitch, center - PITCH_HALF * pitchAngle))
    // Topo do dente.
    pushArc(points, rTip, center - TIP_HALF * pitchAngle, center + TIP_HALF * pitchAngle)
    // Flanco descendo.
    points.push(polar(rPitch, center + PITCH_HALF * pitchAngle))
    points.push(polar(rRoot, center + ROOT_HALF * pitchAngle))
  }

  return points
}

function pushArc(out: THREE.Vector2[], radius: number, from: number, to: number): void {
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    out.push(polar(radius, from + ((to - from) * i) / ARC_SAMPLES))
  }
}

/**
 * Malha da engrenagem, deitada: eixo de rotação em +Y, centrada na origem.
 * Cacheada por número de dentes — a paleta reusa muito e extrudar é caro.
 */
export function gearGeometry(
  teeth: number,
  m = MODULE,
  thickness = GEAR_THICKNESS,
): THREE.ExtrudeGeometry {
  const key = `${teeth}|${m}|${thickness}`
  const cached = gearCache.get(key)
  if (cached) return cached

  const shape = new THREE.Shape(gearOutline(teeth, m))
  const hole = new THREE.Path()
  hole.absarc(0, 0, hubRadius(teeth, m), 0, Math.PI * 2, true)
  shape.holes.push(hole)

  const bevel = Math.min(0.05, thickness * 0.12)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.7,
    bevelSegments: 2,
    curveSegments: 6,
  })

  // Extrude cresce em +Z a partir de 0. Centraliza e deita a peça: +Z vira +Y,
  // então a rotação do corpo em torno de +Y gira a engrenagem no próprio plano.
  geometry.translate(0, 0, -thickness / 2 + bevel)
  geometry.rotateX(-Math.PI / 2)
  geometry.computeVertexNormals()

  gearCache.set(key, geometry)
  return geometry
}

/**
 * Engrenagem cônica: a mesma engrenagem, afunilada ao longo do eixo.
 * Comunica visualmente que os dentes estão "virados pro lado" e que o par
 * transmite o giro numa esquina de 90°.
 */
export function bevelGearGeometry(
  teeth: number,
  m = MODULE,
  thickness = GEAR_THICKNESS * 1.4,
  taper = 0.45,
): THREE.BufferGeometry {
  const key = `${teeth}|${m}|${thickness}|${taper}`
  const cached = bevelCache.get(key)
  if (cached) return cached

  const geometry = gearGeometry(teeth, m, thickness).clone()
  const position = geometry.attributes.position as THREE.BufferAttribute

  // Afunila o raio conforme a altura: em cima fica estreito, embaixo largo.
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i)
    const t = (y + thickness / 2) / thickness
    const scale = 1 - taper * t
    position.setX(i, position.getX(i) * scale)
    position.setZ(i, position.getZ(i) * scale)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()

  bevelCache.set(key, geometry)
  return geometry
}

/** Cilindro liso da polia, com bordas para a correia não escapar. */
export function pulleyGeometry(radius: number, thickness = GEAR_THICKNESS): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius, radius, thickness, 32)
}

/** Aro da polia, para o cilindro não parecer um disco liso qualquer. */
export function pulleyFlangeGeometry(
  radius: number,
  thickness = GEAR_THICKNESS,
): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius * 1.12, radius * 1.12, thickness * 0.16, 32)
}

/** Eixo/cubo central, para o furo da engrenagem ler como um eixo de verdade. */
export function hubGeometry(radius: number, height: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius, radius, height, 20)
}

export function disposeGeometryCaches(): void {
  for (const g of gearCache.values()) g.dispose()
  for (const g of bevelCache.values()) g.dispose()
  gearCache.clear()
  bevelCache.clear()
}
