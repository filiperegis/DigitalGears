import { beforeEach, describe, expect, it } from 'vitest'
import {
  addBevelGear,
  addCompoundGear,
  addSpurGear,
  attachCrank,
  computeSnap,
  isPlacementValid,
  levelHeight,
  movePart,
  rebuildMeshConnections,
  resetIds,
  syncMeshes,
} from '../assembly'
import { MESH_TOLERANCE } from '../../config'
import { applyDriverAngle, solve } from '../KinematicSolver'
import { meshDistance, meshError, pitchRadius as pitchRadiusDe } from '../meshing'
import { createAssembly, type Assembly, type PlacedPart } from '../types'
import { dist2, type Vec2 } from '../vec'

function at(x: number, z = 0): Vec2 {
  return { x, z }
}

function angleOf(assembly: Assembly, part: PlacedPart, wheel = 0): number {
  return assembly.bodies.get(part.wheels[wheel].bodyId)!.angle
}

/** Quanto a junção entre duas engrenagens está fora do encaixe perfeito. */
function junctionError(assembly: Assembly, a: PlacedPart, b: PlacedPart): number {
  return meshError(
    a.wheels[0].teeth,
    angleOf(assembly, a),
    b.wheels[0].teeth,
    angleOf(assembly, b),
    a.position,
    b.position,
  )
}

describe('fase do engrenamento', () => {
  let assembly: Assembly

  beforeEach(() => {
    resetIds()
    assembly = createAssembly()
  })

  it('um par recém-encaixado fica com dente na folga, não dente com dente', () => {
    const a = addSpurGear(assembly, at(0), 24)
    const b = addSpurGear(assembly, at(meshDistance(24, 12)), 12)
    syncMeshes(assembly)

    // Sem fase, as duas ficariam no ângulo 0 e os dentes se atravessariam.
    expect(junctionError(assembly, a, b)).toBeLessThan(1e-9)
    // Quem já estava na mesa não se mexe: é a peça nova que se acomoda.
    expect(angleOf(assembly, a)).toBe(0)
    expect(angleOf(assembly, b)).not.toBe(0)
  })

  it('a fase acerta todas as junções de um trem inteiro', () => {
    const teeth = [12, 16, 24, 8]
    const parts: PlacedPart[] = []
    let x = 0
    teeth.forEach((n, i) => {
      if (i > 0) x += meshDistance(teeth[i - 1], n)
      parts.push(addSpurGear(assembly, at(x), n))
    })
    syncMeshes(assembly)

    for (let i = 1; i < parts.length; i++) {
      expect(junctionError(assembly, parts[i - 1], parts[i])).toBeLessThan(1e-9)
    }
  })

  it('funciona em qualquer direção de montagem, não só na horizontal', () => {
    for (const direction of [0.7, 2.1, -1.3, Math.PI]) {
      resetIds()
      assembly = createAssembly()
      const d = meshDistance(16, 12)
      const a = addSpurGear(assembly, at(0), 16)
      const b = addSpurGear(assembly, at(Math.cos(direction) * d, -Math.sin(direction) * d), 12)
      syncMeshes(assembly)
      expect(junctionError(assembly, a, b)).toBeLessThan(1e-9)
    }
  })

  it('o encaixe continua certo depois de girar a manivela', () => {
    const a = addSpurGear(assembly, at(0), 24)
    const b = addSpurGear(assembly, at(meshDistance(24, 12)), 12)
    syncMeshes(assembly)
    attachCrank(assembly, a.id)
    assembly.driverOmega = 1
    solve(assembly)

    for (const angle of [0.3, 1.7, 6.4, 25.9, 480.2]) {
      applyDriverAngle(assembly, angle)
      expect(junctionError(assembly, a, b)).toBeLessThan(1e-8)
    }
  })

  it('resolver de novo não desalinha nem faz a peça pular', () => {
    addSpurGear(assembly, at(0), 24)
    const b = addSpurGear(assembly, at(meshDistance(24, 12)), 12)
    syncMeshes(assembly)
    const antes = angleOf(assembly, b)

    syncMeshes(assembly)
    syncMeshes(assembly)

    expect(angleOf(assembly, b)).toBeCloseTo(antes, 12)
  })
})

describe('encaixe (snapping)', () => {
  let assembly: Assembly

  beforeEach(() => {
    resetIds()
    assembly = createAssembly()
  })

  it('gruda na distância exata quando a peça chega perto', () => {
    addSpurGear(assembly, at(0), 24)
    const movel = addSpurGear(assembly, at(20), 12)

    const alvo = at(meshDistance(24, 12) + 0.7, 0)
    const snap = computeSnap(assembly, movel.id, movel.wheels, alvo)

    expect(snap.snapped).toBe(true)
    expect(snap.valid).toBe(true)
    expect(Math.hypot(snap.position.x, snap.position.z)).toBeCloseTo(meshDistance(24, 12), 9)
  })

  it('empurrar a peça POR DENTRO da outra a expulsa até encostar', () => {
    // É o gesto natural de uma criança: empurrar uma engrenagem contra a
    // vizinha. Antes isso era recusado por sobreposição.
    addSpurGear(assembly, at(0), 24)
    const movel = addSpurGear(assembly, at(20), 12)

    const bemPorDentro = at(1.2, 0)
    const snap = computeSnap(assembly, movel.id, movel.wheels, bemPorDentro)

    expect(snap.snapped).toBe(true)
    expect(snap.valid).toBe(true)
    expect(Math.hypot(snap.position.x, snap.position.z)).toBeCloseTo(meshDistance(24, 12), 9)
    // Sai pelo lado de onde veio o dedo.
    expect(snap.position.x).toBeGreaterThan(0)
  })

  it('não gruda em quem está longe demais', () => {
    addSpurGear(assembly, at(0), 24)
    const movel = addSpurGear(assembly, at(20), 12)

    const longe = at(meshDistance(24, 12) + 4, 0)
    expect(computeSnap(assembly, movel.id, movel.wheels, longe).snapped).toBe(false)
  })

  it('encaixar na roda de cima de uma compound levanta a peça de andar', () => {
    const compound = addCompoundGear(assembly, at(0), 24, 8)
    const movel = addSpurGear(assembly, at(20), 12)

    const perto = at(meshDistance(8, 12) + 0.2, 0)
    const snap = computeSnap(assembly, movel.id, movel.wheels, perto)

    expect(snap.snapped).toBe(true)
    expect(snap.level).toBe(1)
    expect(compound.wheels[1].height).toBeCloseTo(levelHeight(1), 9)
  })

  it('duas engrenagens no mesmo andar não podem se sobrepor', () => {
    addSpurGear(assembly, at(0), 24)
    const movel = addSpurGear(assembly, at(20), 12)
    expect(isPlacementValid(assembly, movel.id, movel.wheels, at(2), 0)).toBe(false)
    expect(isPlacementValid(assembly, movel.id, movel.wheels, at(meshDistance(24, 12)), 0)).toBe(true)
  })

  it('a cônica encaixa numa engrenagem normal na distância de engrenamento', () => {
    // Regressão: a roda de saída da cônica ('bevelOut') tem a mesma `height`
    // da roda de entrada por conveniência do modelo, mas na cena ela fica de
    // pé, deslocada para o eixo de saída — não é um disco coplanar de
    // verdade. isPlacementValid tratava as duas rodas como discos na mesma
    // posição e exigia radius+radius+epsilon de espaço para o par 'bevelOut'
    // × 'gear', o que é MAIS do que a distância de engrenamento exata — logo
    // o único encaixe correto entre a cônica e a engrenagem que a alimenta
    // era sempre rejeitado como inválido.
    addSpurGear(assembly, at(-3), 16)
    const bevelWheels = [
      { bodyId: '', kind: 'gear' as const, teeth: 16, radius: pitchRadiusDe(16), height: levelHeight(0) },
      {
        bodyId: '',
        kind: 'bevelOut' as const,
        teeth: 16,
        radius: pitchRadiusDe(16),
        height: levelHeight(0),
      },
    ]

    const alvo = at(-3 + meshDistance(16, 16), 0)
    const snap = computeSnap(assembly, null, bevelWheels, alvo)
    expect(snap.snapped).toBe(true)
    expect(snap.valid).toBe(true)

    addBevelGear(assembly, snap.position, 16, 16)
    rebuildMeshConnections(assembly)
    expect(assembly.connections.size).toBe(2) // par interno da cônica + engrenamento com o motor
  })

  it('engrenagens em andares diferentes se ignoram', () => {
    addSpurGear(assembly, at(0), 24, 0)
    const emCima = addSpurGear(assembly, at(20), 12, 1)
    // Sobrepostas vistas de cima, mas em alturas distintas: sem conflito.
    expect(isPlacementValid(assembly, emCima.id, emCima.wheels, at(0.5), 1)).toBe(true)
  })

  it('sobra lugar na mesa para uma segunda engrenagem grande', () => {
    // Regressão: a busca por anéis só testava candidatos a múltiplos do
    // tamanho da peça, e para uma engrenagem grande o primeiro anel já caía
    // fora da mesa — resultado, tocar na paleta não punha peça nenhuma.
    addSpurGear(assembly, at(0, 0), 32)
    const segunda = addSpurGear(assembly, at(0, 0), 32)

    const limite = 12 - pitchRadiusDe(32) - 0.4
    const vagas: Vec2[] = []
    for (let x = -limite; x <= limite; x += 0.7) {
      for (let z = -limite; z <= limite; z += 0.7) {
        if (isPlacementValid(assembly, segunda.id, segunda.wheels, at(x, z), 0)) vagas.push(at(x, z))
      }
    }

    expect(vagas.length).toBeGreaterThan(0)
    // E a vaga encontrada é de fato longe o bastante da primeira.
    movePart(assembly, segunda.id, vagas[0], 0)
    expect(Math.hypot(vagas[0].x, vagas[0].z)).toBeGreaterThanOrEqual(meshDistance(32, 32) - 0.1)
  })

  it('encaixa no ponto que serve pros dois vizinhos ao mesmo tempo', () => {
    // Regressão: a peça do meio de um trem de 3 (lição "Para que lado?") só
    // grudava no vizinho mais próximo — a outra junção ficava perto, mas fora
    // da tolerância usada por rebuildMeshConnections, e a montagem nunca
    // fechava, não importando a posição tentada.
    addSpurGear(assembly, at(-5.4), 12)
    addSpurGear(assembly, at(5.4), 12)

    // O primeiro vizinho grudou com uma pequena inclinação em relação ao eixo
    // reto entre as duas peças travadas — imprecisão normal de arrasto.
    const movel = (h: number) => [
      { bodyId: 'tmp', kind: 'gear' as const, teeth: 12, radius: pitchRadiusDe(12), height: h },
    ]
    const snap1 = computeSnap(assembly, null, movel(0.25), { x: -1.8, z: 0.2 })
    const meio1 = addSpurGear(assembly, snap1.position, 12)

    const snap2 = computeSnap(assembly, null, movel(0.25), at(1.8))
    // A junção com o vizinho que NÃO foi o alvo direto do encaixe ainda tem
    // uma folga residual — mas dentro do que rebuildMeshConnections aceita.
    expect(Math.abs(dist2(snap2.position, meio1.position) - meshDistance(12, 12))).toBeLessThan(
      MESH_TOLERANCE,
    )

    addSpurGear(assembly, snap2.position, 12)
    rebuildMeshConnections(assembly)

    // Os 3 engrenamentos do trem inteiro (motor–meio1, meio1–meio2,
    // meio2–bandeira) precisam ter fechado.
    expect(assembly.connections.size).toBe(3)
  })

  it('mover a peça para longe desfaz o engrenamento', () => {
    addSpurGear(assembly, at(0), 24)
    const movel = addSpurGear(assembly, at(meshDistance(24, 12)), 12)
    syncMeshes(assembly)
    expect(assembly.connections.size).toBe(1)

    movePart(assembly, movel.id, at(30), 0)
    syncMeshes(assembly)
    expect(assembly.connections.size).toBe(0)
  })
})
