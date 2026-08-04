import { beforeEach, describe, expect, it } from 'vitest'
import {
  addBelt,
  addBevelGear,
  addCompoundGear,
  addGearPulley,
  addPulley,
  addSpurGear,
  attachCrank,
  connect,
  syncMeshes,
  resetIds,
} from '../assembly'
import { applyDriverAngle, pathExists, solve } from '../KinematicSolver'
import { meshDistance, pitchRadius } from '../meshing'
import { createAssembly, createBody, type Assembly } from '../types'
import { AXIS_UP, isPerpendicular, type Vec2 } from '../vec'

function at(x: number, z = 0): Vec2 {
  return { x, z }
}

/** Encadeia engrenagens ao longo do eixo X, cada uma engrenada na anterior. */
function gearChain(assembly: Assembly, teeth: number[]): string[] {
  const parts: string[] = []
  let x = 0
  teeth.forEach((n, i) => {
    if (i > 0) x += meshDistance(teeth[i - 1], n)
    const part = addSpurGear(assembly, at(x), n)
    syncMeshes(assembly)
    parts.push(part.id)
  })
  return parts
}

function omegaOf(assembly: Assembly, partId: string, wheelIndex = 0): number {
  const part = assembly.parts.get(partId)!
  return assembly.bodies.get(part.wheels[wheelIndex].bodyId)!.omega
}

describe('solver — engrenamento', () => {
  let assembly: Assembly

  beforeEach(() => {
    resetIds()
    assembly = createAssembly()
  })

  it('um par gira em sentidos opostos', () => {
    const [a, b] = gearChain(assembly, [12, 24])
    attachCrank(assembly, a)
    assembly.driverOmega = 1
    solve(assembly)

    expect(omegaOf(assembly, a)).toBeCloseTo(1, 10)
    expect(omegaOf(assembly, b)).toBeCloseTo(-0.5, 10)
    expect(Math.sign(omegaOf(assembly, a))).toBe(-Math.sign(omegaOf(assembly, b)))
  })

  it('conserva dentes por segundo: |ω_A·N_A| = |ω_B·N_B|', () => {
    const [a, b] = gearChain(assembly, [8, 25])
    attachCrank(assembly, a)
    assembly.driverOmega = 2.5
    solve(assembly)

    expect(Math.abs(omegaOf(assembly, a) * 8)).toBeCloseTo(Math.abs(omegaOf(assembly, b) * 25), 10)
  })

  it('engrenagem no meio não muda a razão entre a primeira e a última', () => {
    // A engrenagem "louca" (idler) só inverte o sentido; a razão final é 12/24.
    const [a, , c] = gearChain(assembly, [12, 16, 24])
    attachCrank(assembly, a)
    assembly.driverOmega = 1
    solve(assembly)

    expect(Math.abs(omegaOf(assembly, c))).toBeCloseTo(0.5, 10)
    // Três engrenagens = duas inversões = mesmo sentido da primeira.
    expect(Math.sign(omegaOf(assembly, c))).toBe(Math.sign(omegaOf(assembly, a)))
  })

  it('quem tem menos dentes gira mais rápido', () => {
    const [big, small] = gearChain(assembly, [32, 8])
    attachCrank(assembly, big)
    assembly.driverOmega = 1
    solve(assembly)

    expect(Math.abs(omegaOf(assembly, small))).toBeCloseTo(4, 10)
  })

  it('sem manivela, nada gira', () => {
    const [a, b] = gearChain(assembly, [12, 24])
    assembly.driverOmega = 1
    const result = solve(assembly)

    expect(result.drivenBodies).toHaveLength(0)
    expect(omegaOf(assembly, a)).toBe(0)
    expect(omegaOf(assembly, b)).toBe(0)
  })

  it('peça solta, longe do trem, fica parada', () => {
    const [a] = gearChain(assembly, [12, 24])
    const solta = addSpurGear(assembly, at(50, 50), 16)
    syncMeshes(assembly)
    attachCrank(assembly, a)
    assembly.driverOmega = 1
    solve(assembly)

    expect(omegaOf(assembly, solta.id)).toBe(0)
  })
})

describe('solver — compound', () => {
  let assembly: Assembly

  beforeEach(() => {
    resetIds()
    assembly = createAssembly()
  })

  it('as duas rodas do compound compartilham a mesma velocidade', () => {
    const compound = addCompoundGear(assembly, at(0), 24, 8)
    expect(compound.wheels[0].bodyId).toBe(compound.wheels[1].bodyId)
  })

  it('multiplica a razão: 12→24 depois 8→16 dá 4× de redução', () => {
    const driver = addSpurGear(assembly, at(0), 12)
    const compound = addCompoundGear(assembly, at(meshDistance(12, 24)), 24, 8)
    syncMeshes(assembly)

    // A saída engrena na roda de CIMA do compound, um andar acima.
    const outX = compound.position.x + meshDistance(8, 16)
    const out = addSpurGear(assembly, at(outX), 16, 1)
    syncMeshes(assembly)

    attachCrank(assembly, driver.id)
    assembly.driverOmega = 1
    solve(assembly)

    // (−12/24) × (−8/16) = +0.25
    expect(omegaOf(assembly, compound.id)).toBeCloseTo(-0.5, 10)
    expect(omegaOf(assembly, out.id)).toBeCloseTo(0.25, 10)
  })
})

describe('solver — correia', () => {
  let assembly: Assembly

  beforeEach(() => {
    resetIds()
    assembly = createAssembly()
  })

  it('correia mantém o mesmo sentido, ao contrário do engrenamento', () => {
    const a = addPulley(assembly, at(0), 1)
    const b = addPulley(assembly, at(9), 2)
    addBelt(assembly, a.id, b.id)

    attachCrank(assembly, a.id)
    assembly.driverOmega = 1
    solve(assembly)

    expect(omegaOf(assembly, b.id)).toBeCloseTo(0.5, 10)
    expect(Math.sign(omegaOf(assembly, b.id))).toBe(Math.sign(omegaOf(assembly, a.id)))
  })

  it('detecta que duas polias estão ligadas por correia', () => {
    const a = addPulley(assembly, at(0), 1)
    const b = addPulley(assembly, at(9), 2)
    const c = addPulley(assembly, at(30), 1)
    addBelt(assembly, a.id, b.id)

    const bodyOf = (id: string) => assembly.parts.get(id)!.wheels[0].bodyId
    expect(pathExists(assembly, bodyOf(a.id), bodyOf(b.id), ['belt'])).toBe(true)
    expect(pathExists(assembly, bodyOf(a.id), bodyOf(c.id), ['belt'])).toBe(false)
  })

  it('não cria correia duplicada entre as mesmas polias', () => {
    const a = addPulley(assembly, at(0), 1)
    const b = addPulley(assembly, at(9), 2)
    expect(addBelt(assembly, a.id, b.id)).not.toBeNull()
    expect(addBelt(assembly, b.id, a.id)).toBeNull()
  })

  it('a polia com engrenagem deixa a correia entrar num trem de engrenagens', () => {
    const motor = addSpurGear(assembly, at(0), 12)
    const gp = addGearPulley(assembly, at(meshDistance(12, 8)), 8, pitchRadius(6))
    syncMeshes(assembly)
    const saida = addPulley(assembly, at(meshDistance(12, 8) + 20), pitchRadius(6))
    expect(addBelt(assembly, gp.id, saida.id)).not.toBeNull()

    attachCrank(assembly, motor.id)
    assembly.driverOmega = 1
    solve(assembly)

    const motorOmega = omegaOf(assembly, motor.id)
    const gpOmega = omegaOf(assembly, gp.id)
    // Engrenamento com o motor: inverte e multiplica por 12/8.
    expect(gpOmega).toBeCloseTo(motorOmega * -(12 / 8), 10)
    // Correia entre polias do mesmo raio: mesma velocidade, mesmo sentido.
    expect(omegaOf(assembly, saida.id)).toBeCloseTo(gpOmega, 10)
  })
})

describe('solver — cônica', () => {
  let assembly: Assembly

  beforeEach(() => {
    resetIds()
    assembly = createAssembly()
  })

  it('leva o giro para um eixo perpendicular', () => {
    const driver = addSpurGear(assembly, at(0), 12)
    const bevel = addBevelGear(assembly, at(meshDistance(12, 16)), 16, 16)
    syncMeshes(assembly)

    attachCrank(assembly, driver.id)
    assembly.driverOmega = 1
    solve(assembly)

    const inBody = assembly.bodies.get(bevel.bodies[0])!
    const outBody = assembly.bodies.get(bevel.bodies[1])!

    expect(isPerpendicular(inBody.axis, outBody.axis)).toBe(true)
    expect(Math.abs(outBody.omega)).toBeGreaterThan(0)
    expect(isPerpendicular(AXIS_UP, outBody.axis)).toBe(true)
  })
})

describe('solver — travamento (jam)', () => {
  let assembly: Assembly

  beforeEach(() => {
    resetIds()
    assembly = createAssembly()
  })

  /** Liga corpos num laço só de engrenamento, com os dentes dados. */
  function meshLoop(teeth: number[]): string[] {
    const ids = teeth.map((_, i) => {
      const body = createBody(`loop${i}`, AXIS_UP)
      assembly.bodies.set(body.id, body)
      return body.id
    })
    for (let i = 0; i < ids.length; i++) {
      const j = (i + 1) % ids.length
      connect(assembly, ids[i], ids[j], 'mesh', -(teeth[i] / teeth[j]))
    }
    return ids
  }

  it('laço com número ÍMPAR de engrenamentos trava a máquina', () => {
    const ids = meshLoop([12, 16, 20])
    assembly.driverBodyId = ids[0]
    assembly.driverOmega = 1

    const result = solve(assembly)
    expect(result.jammed).toBe(true)
    // Nenhuma peça do componente gira.
    for (const id of ids) expect(assembly.bodies.get(id)!.omega).toBe(0)
    expect(result.jammedBodies.sort()).toEqual(ids.sort())
  })

  it('laço com número PAR de engrenamentos é consistente e gira', () => {
    const ids = meshLoop([12, 16, 20, 24])
    assembly.driverBodyId = ids[0]
    assembly.driverOmega = 1

    const result = solve(assembly)
    expect(result.jammed).toBe(false)
    expect(assembly.bodies.get(ids[1])!.omega).toBeCloseTo(-12 / 16, 10)
    expect(assembly.bodies.get(ids[2])!.omega).toBeCloseTo(12 / 20, 10)
  })

  it('trem aberto nunca trava', () => {
    const parts = gearChain(assembly, [12, 16, 20, 24, 8])
    attachCrank(assembly, parts[0])
    assembly.driverOmega = 1
    expect(solve(assembly).jammed).toBe(false)
  })

  it('travamento zera o componente inteiro, não só o corpo em conflito', () => {
    const ids = meshLoop([12, 16, 20])
    // Um "rabo" pendurado no laço também precisa parar.
    const tail = createBody('tail', AXIS_UP)
    assembly.bodies.set(tail.id, tail)
    connect(assembly, ids[0], tail.id, 'mesh', -0.5)

    assembly.driverBodyId = ids[0]
    assembly.driverOmega = 1
    solve(assembly)

    expect(assembly.bodies.get('tail')!.omega).toBe(0)
  })
})

describe('solver — ângulo e fase', () => {
  let assembly: Assembly

  beforeEach(() => {
    resetIds()
    assembly = createAssembly()
  })

  it('resolver a montagem não faz nenhuma peça pular de posição', () => {
    const parts = gearChain(assembly, [12, 24, 8])
    attachCrank(assembly, parts[0])
    assembly.driverOmega = 1
    assembly.driverAngle = 3.7
    solve(assembly)

    const before = parts.map((p) => omegaOfAngle(assembly, p))
    applyDriverAngle(assembly, assembly.driverAngle)
    const after = parts.map((p) => omegaOfAngle(assembly, p))

    after.forEach((angle, i) => expect(angle).toBeCloseTo(before[i], 12))
  })

  it('girar a manivela move o trem na razão exata', () => {
    const parts = gearChain(assembly, [12, 24])
    attachCrank(assembly, parts[0])
    assembly.driverOmega = 1
    solve(assembly)

    const startA = omegaOfAngle(assembly, parts[0])
    const startB = omegaOfAngle(assembly, parts[1])

    applyDriverAngle(assembly, assembly.driverAngle + Math.PI)

    expect(omegaOfAngle(assembly, parts[0]) - startA).toBeCloseTo(Math.PI, 12)
    expect(omegaOfAngle(assembly, parts[1]) - startB).toBeCloseTo(-Math.PI / 2, 12)
  })

  it('milhares de passos não acumulam deriva', () => {
    const parts = gearChain(assembly, [12, 24])
    attachCrank(assembly, parts[0])
    assembly.driverOmega = 1
    solve(assembly)

    const startB = omegaOfAngle(assembly, parts[1])
    for (let i = 1; i <= 10_000; i++) {
      applyDriverAngle(assembly, assembly.driverAngle + 0.0137)
    }
    const expected = startB - 0.5 * 10_000 * 0.0137
    expect(omegaOfAngle(assembly, parts[1])).toBeCloseTo(expected, 8)
  })

  it('a manivela não faz a peça em que é montada dar um salto', () => {
    const parts = gearChain(assembly, [12, 24])
    const bodyB = assembly.bodies.get(assembly.parts.get(parts[1])!.wheels[0].bodyId)!
    const angleBefore = bodyB.angle

    attachCrank(assembly, parts[1])
    assembly.driverOmega = 1
    solve(assembly)
    applyDriverAngle(assembly, assembly.driverAngle)

    expect(bodyB.angle).toBeCloseTo(angleBefore, 12)
  })
})

function omegaOfAngle(assembly: Assembly, partId: string): number {
  const part = assembly.parts.get(partId)!
  return assembly.bodies.get(part.wheels[0].bodyId)!.angle
}
