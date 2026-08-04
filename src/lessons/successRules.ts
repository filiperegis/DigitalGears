import { pathExists } from '../model/KinematicSolver'
import type { Assembly, PartId } from '../model/types'
import { AXIS_UP, isPerpendicular } from '../model/vec'
import type { Objetivo } from './lessons'

/** Abaixo disso, considera-se que a peça não gira. */
const EPSILON = 1e-6

/**
 * Avalia o objetivo contra o estado JÁ RESOLVIDO pelo solver.
 *
 * Usa `ratio` e não `omega` de propósito: `ratio` é a razão de transmissão em
 * relação à manivela, e vale mesmo com a máquina parada. Assim o desafio é
 * considerado cumprido quando a MONTAGEM está certa, sem exigir que a criança
 * descubra que precisa apertar "brincar" antes.
 */
export function evaluate(
  assembly: Assembly,
  objetivo: Objetivo,
  tags: Map<string, PartId>,
  jammed: boolean,
): boolean {
  switch (objetivo.tipo) {
    case 'gira':
      return Math.abs(ratioOf(assembly, tags, objetivo.alvo)) > EPSILON

    case 'sentido': {
      const ratio = ratioOf(assembly, tags, objetivo.alvo)
      if (Math.abs(ratio) <= EPSILON) return false
      // A manivela tem ratio +1 por definição, então o sinal do alvo já é a
      // resposta: positivo = mesmo sentido, negativo = contrário.
      return objetivo.sentido === 'mesmo' ? ratio > 0 : ratio < 0
    }

    case 'razaoQualquer': {
      const reference = Math.abs(ratioOf(assembly, tags, objetivo.referencia))
      if (reference <= EPSILON) return false
      const wanted = reference * objetivo.fator
      return anyBody(assembly, (ratio) => Math.abs(Math.abs(ratio) - wanted) <= objetivo.tolerancia)
    }

    case 'velocidadeQualquer':
      return anyBody(assembly, (ratio) => Math.abs(ratio) >= objetivo.fator - 1e-9)

    case 'eixoPerpendicular':
      return [...assembly.bodies.values()].some(
        (body) => Math.abs(body.ratio) > EPSILON && isPerpendicular(AXIS_UP, body.axis),
      )

    case 'correia': {
      const a = bodyOfTag(assembly, tags, objetivo.a)
      const b = bodyOfTag(assembly, tags, objetivo.b)
      if (!a || !b) return false
      const linked = pathExists(assembly, a, b, ['belt', 'crossedBelt'])
      const turning = Math.abs(assembly.bodies.get(b)?.ratio ?? 0) > EPSILON
      return linked && turning
    }

    case 'destravou':
      return !jammed && Math.abs(ratioOf(assembly, tags, objetivo.alvo)) > EPSILON
  }
}

function bodyOfTag(assembly: Assembly, tags: Map<string, PartId>, tag: string): string | null {
  const partId = tags.get(tag)
  if (!partId) return null
  const part = assembly.parts.get(partId)
  return part?.bodies[0] ?? null
}

function ratioOf(assembly: Assembly, tags: Map<string, PartId>, tag: string): number {
  const bodyId = bodyOfTag(assembly, tags, tag)
  if (!bodyId) return 0
  return assembly.bodies.get(bodyId)?.ratio ?? 0
}

function anyBody(assembly: Assembly, predicate: (ratio: number) => boolean): boolean {
  for (const body of assembly.bodies.values()) {
    if (Math.abs(body.ratio) > EPSILON && predicate(body.ratio)) return true
  }
  return false
}
