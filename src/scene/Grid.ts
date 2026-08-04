import * as THREE from 'three'
import { COLORS, GRID_STEP, TABLE_HALF } from '../config'

/** Mesa de construção: chão claro + grade suave, com sombra das peças. */
export function createTable(): THREE.Group {
  const group = new THREE.Group()

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_HALF * 2, 0.4, TABLE_HALF * 2),
    new THREE.MeshStandardMaterial({ color: COLORS.table, roughness: 0.9, metalness: 0 }),
  )
  top.position.y = -0.2
  top.receiveShadow = true
  group.add(top)

  const grid = new THREE.GridHelper(
    TABLE_HALF * 2,
    (TABLE_HALF * 2) / GRID_STEP,
    COLORS.grid,
    COLORS.grid,
  )
  const gridMaterial = grid.material as THREE.Material
  gridMaterial.transparent = true
  gridMaterial.opacity = 0.55
  grid.position.y = 0.002
  group.add(grid)

  // Borda arredondada, para a mesa parecer um brinquedo e não uma caixa.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(TABLE_HALF * Math.SQRT2, 0.12, 8, 4),
    new THREE.MeshStandardMaterial({ color: COLORS.grid, roughness: 0.8 }),
  )
  rim.rotation.x = Math.PI / 2
  rim.rotation.z = Math.PI / 4
  rim.position.y = 0.02
  group.add(rim)

  return group
}
