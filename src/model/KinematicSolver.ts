import type { Assembly, BodyId, Connection, ConnectionKind } from './types'

/**
 * Tolerância relativa para considerar duas razões "a mesma".
 * Um laço fechado cuja razão total não é ±1 vai estourar isso e travar a máquina.
 */
const RATIO_EPSILON = 1e-9

export interface SolveResult {
  /** true quando dois caminhos chegam no mesmo corpo com velocidades diferentes. */
  jammed: boolean
  /** Corpos do componente travado (vazio quando não travou). */
  jammedBodies: BodyId[]
  /** Corpos alcançados a partir da manivela. */
  drivenBodies: BodyId[]
}

interface Edge {
  to: BodyId
  /** omega_to = omega_from * f */
  f: number
  kind: ConnectionKind
}

/** Lista de adjacência nos dois sentidos: a→b usa f, b→a usa 1/f. */
export function buildAdjacency(connections: Iterable<Connection>): Map<BodyId, Edge[]> {
  const adj = new Map<BodyId, Edge[]>()
  const push = (from: BodyId, edge: Edge) => {
    const list = adj.get(from)
    if (list) list.push(edge)
    else adj.set(from, [edge])
  }
  for (const c of connections) {
    if (c.f === 0 || !Number.isFinite(c.f)) continue
    push(c.a, { to: c.b, f: c.f, kind: c.kind })
    push(c.b, { to: c.a, f: 1 / c.f, kind: c.kind })
  }
  return adj
}

/**
 * Propaga a rotação a partir da manivela.
 *
 * Não integra ângulo por corpo. Para cada corpo alcançado calcula:
 *   - `ratio`: produto dos fatores de transmissão ao longo do caminho;
 *   - `omega = ratio * driverOmega`;
 *   - `phase = angle − ratio * driverAngle`, escolhida para PRESERVAR o ângulo
 *     atual do corpo — nada pula de posição quando a montagem muda.
 *
 * Depois disso, o loop de render só precisa de `angle = phase + ratio * driverAngle`,
 * que é exato em qualquer instante e não acumula erro.
 */
export function solve(assembly: Assembly): SolveResult {
  const { bodies, connections, driverBodyId, driverAngle, driverOmega } = assembly

  // Parte-se do repouso: o que a manivela não alcançar fica parado, mantendo
  // o ângulo onde está.
  for (const body of bodies.values()) {
    body.omega = 0
    body.ratio = 0
    body.phase = body.angle
    body.driven = false
  }

  if (!driverBodyId || !bodies.has(driverBodyId)) {
    return { jammed: false, jammedBodies: [], drivenBodies: [] }
  }

  const adj = buildAdjacency(connections.values())
  const ratios = new Map<BodyId, number>([[driverBodyId, 1]])
  const order: BodyId[] = [driverBodyId]
  const queue: BodyId[] = [driverBodyId]
  let jammed = false

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentRatio = ratios.get(current)!

    for (const edge of adj.get(current) ?? []) {
      const nextRatio = currentRatio * edge.f
      const known = ratios.get(edge.to)

      if (known === undefined) {
        ratios.set(edge.to, nextRatio)
        order.push(edge.to)
        queue.push(edge.to)
        continue
      }

      // O corpo já foi alcançado por outro caminho. Se as duas velocidades não
      // batem, a máquina está fisicamente impossível — travou.
      const tolerance = RATIO_EPSILON * Math.max(1, Math.abs(known), Math.abs(nextRatio))
      if (Math.abs(known - nextRatio) > tolerance) jammed = true
    }
  }

  const drivenBodies = order.filter((id) => bodies.has(id))

  if (jammed) {
    // Uma máquina travada não gira em lugar nenhum: zera o componente inteiro,
    // preservando os ângulos para a criança ver onde o problema está.
    for (const id of drivenBodies) {
      const body = bodies.get(id)!
      body.omega = 0
      body.ratio = 0
      body.phase = body.angle
      body.driven = true
    }
    return { jammed: true, jammedBodies: drivenBodies, drivenBodies }
  }

  for (const id of drivenBodies) {
    const body = bodies.get(id)!
    const ratio = ratios.get(id)!
    body.ratio = ratio
    body.omega = ratio * driverOmega
    body.phase = body.angle - ratio * driverAngle
    body.driven = true
  }

  return { jammed: false, jammedBodies: [], drivenBodies }
}

/**
 * Aplica o ângulo da manivela a todos os corpos.
 * Chamado a cada frame; `solve` só precisa rodar quando a montagem muda.
 */
export function applyDriverAngle(assembly: Assembly, driverAngle: number): void {
  assembly.driverAngle = driverAngle
  for (const body of assembly.bodies.values()) {
    if (body.driven) body.angle = body.phase + body.ratio * driverAngle
  }
}

/** true quando existe caminho entre dois corpos usando só os tipos dados. */
export function pathExists(
  assembly: Assembly,
  from: BodyId,
  to: BodyId,
  kinds: ConnectionKind[],
): boolean {
  if (from === to) return true
  const allowed = new Set(kinds)
  const adj = buildAdjacency(assembly.connections.values())
  const seen = new Set<BodyId>([from])
  const queue: BodyId[] = [from]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of adj.get(current) ?? []) {
      if (!allowed.has(edge.kind) || seen.has(edge.to)) continue
      if (edge.to === to) return true
      seen.add(edge.to)
      queue.push(edge.to)
    }
  }
  return false
}

/** Todos os corpos ligados a `from` por qualquer tipo de conexão. */
export function connectedComponent(assembly: Assembly, from: BodyId): Set<BodyId> {
  const adj = buildAdjacency(assembly.connections.values())
  const seen = new Set<BodyId>([from])
  const queue: BodyId[] = [from]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of adj.get(current) ?? []) {
      if (seen.has(edge.to)) continue
      seen.add(edge.to)
      queue.push(edge.to)
    }
  }
  return seen
}
