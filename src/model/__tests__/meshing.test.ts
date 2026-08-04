import { describe, expect, it } from 'vitest'
import {
  angleDelta,
  beltPath,
  meshDistance,
  meshError,
  meshPhaseAngle,
  normalizeAngle,
  pitchRadius,
} from '../meshing'
import { dist2, type Vec2 } from '../vec'

const MODULE = 0.3

describe('geometria de engrenagem', () => {
  it('raio de passo cresce com o número de dentes', () => {
    expect(pitchRadius(12, MODULE)).toBeCloseTo(1.8, 10)
    expect(pitchRadius(24, MODULE)).toBeCloseTo(3.6, 10)
  })

  it('distância de encaixe é a soma dos raios de passo', () => {
    expect(meshDistance(12, 24, MODULE)).toBeCloseTo(1.8 + 3.6, 10)
  })
})

describe('fase de engrenamento', () => {
  // Pares escolhidos para cobrir dentes iguais, razão inteira e ímpar/primo.
  const pairs: Array<[number, number]> = [
    [12, 12],
    [12, 36],
    [8, 25],
    [32, 8],
    [17, 23],
  ]

  for (const [teethA, teethB] of pairs) {
    it(`satisfaz a condição de encaixe para ${teethA}×${teethB} dentes`, () => {
      // Vários ângulos de A e várias direções de montagem.
      for (const angleA of [0, 0.37, 1.9, -2.4, 5.8]) {
        for (const direction of [0, 0.8, 2.2, -1.1]) {
          const centerA: Vec2 = { x: 0, z: 0 }
          const d = meshDistance(teethA, teethB, MODULE)
          const centerB: Vec2 = {
            x: Math.cos(direction) * d,
            z: -Math.sin(direction) * d,
          }
          const angleB = meshPhaseAngle(teethA, angleA, teethB, centerA, centerB)
          expect(meshError(teethA, angleA, teethB, angleB, centerA, centerB)).toBeLessThan(1e-9)
        }
      }
    })
  }

  it('mantém o encaixe depois de girar na razão certa', () => {
    const [teethA, teethB] = [12, 30]
    const centerA: Vec2 = { x: 0, z: 0 }
    const centerB: Vec2 = { x: meshDistance(teethA, teethB, MODULE), z: 0 }

    const angleA0 = 0.42
    const angleB0 = meshPhaseAngle(teethA, angleA0, teethB, centerA, centerB)
    const ratio = -(teethA / teethB)

    // Cem "frames" de rotação: a defasagem inicial precisa continuar válida.
    for (let i = 1; i <= 100; i++) {
      const angleA = angleA0 + i * 0.13
      const angleB = angleB0 + ratio * (i * 0.13)
      expect(meshError(teethA, angleA, teethB, angleB, centerA, centerB)).toBeLessThan(1e-9)
    }
  })
})

describe('ângulos', () => {
  it('normaliza para [0, 2π)', () => {
    expect(normalizeAngle(-0.5)).toBeCloseTo(Math.PI * 2 - 0.5, 10)
    expect(normalizeAngle(Math.PI * 4 + 1)).toBeCloseTo(1, 10)
  })

  it('delta escolhe o caminho curto', () => {
    expect(angleDelta(0.1, 0.2)).toBeCloseTo(0.1, 10)
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2, 10)
  })
})

describe('correia', () => {
  const a: Vec2 = { x: 0, z: 0 }
  const b: Vec2 = { x: 8, z: 0 }

  it('gera um laço fechado que toca as duas polias', () => {
    const path = beltPath(a, 1, b, 1.5)
    expect(path).not.toBeNull()
    const points = path!.points

    // Todo ponto está sobre uma das polias ou numa reta entre elas: nunca
    // dentro de uma delas.
    for (const p of points) {
      expect(dist2(p, a)).toBeGreaterThanOrEqual(1 - 1e-9)
      expect(dist2(p, b)).toBeGreaterThanOrEqual(1.5 - 1e-9)
    }
    // Encosta em cada polia em algum ponto.
    expect(Math.min(...points.map((p) => dist2(p, a)))).toBeCloseTo(1, 6)
    expect(Math.min(...points.map((p) => dist2(p, b)))).toBeCloseTo(1.5, 6)
  })

  it('para polias iguais, o comprimento é as duas retas mais um círculo', () => {
    const d = 10
    const r = 2
    const path = beltPath({ x: 0, z: 0 }, r, { x: d, z: 0 }, r)!
    expect(path.length).toBeCloseTo(2 * d + 2 * Math.PI * r, 6)
  })

  it('fica mais comprida quando as polias se afastam', () => {
    const near = beltPath(a, 1, { x: 5, z: 0 }, 1)!
    const far = beltPath(a, 1, { x: 12, z: 0 }, 1)!
    expect(far.length).toBeGreaterThan(near.length)
  })

  it('recusa polias sobrepostas', () => {
    expect(beltPath(a, 2, { x: 0.5, z: 0 }, 2)).toBeNull()
  })
})
