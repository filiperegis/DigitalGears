import * as THREE from 'three'
import { beltPath, type BeltPath } from '../model/meshing'
import type { Vec2 } from '../model/vec'

/**
 * Correia: laço fechado em volta de duas polias, feito das duas tangentes
 * externas mais os arcos de abraçamento (ver `beltPath`).
 * Como as tangentes são externas, as duas polias giram no mesmo sentido.
 */

export interface BeltShape {
  geometry: THREE.TubeGeometry
  path: BeltPath
  /** Quanto a correia está esticada (1 = folgada). Só afeta a aparência. */
  stretch: number
}

const BELT_RADIUS = 0.09

export function buildBeltGeometry(
  centerA: Vec2,
  radiusA: number,
  centerB: Vec2,
  radiusB: number,
  height: number,
): BeltShape | null {
  const path = beltPath(centerA, radiusA, centerB, radiusB)
  if (!path) return null

  const points = path.points.map((p) => new THREE.Vector3(p.x, height, p.z))
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0)

  const stretch = Math.max(1, path.length / path.restLength)
  const geometry = new THREE.TubeGeometry(curve, Math.max(64, points.length * 2), BELT_RADIUS, 6, true)

  return { geometry, path, stretch }
}
