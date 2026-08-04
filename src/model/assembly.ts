import { COLORS, GEAR_THICKNESS, MESH_TOLERANCE, OVERLAP_EPSILON, SNAP_TOLERANCE } from '../config'
import { meshDistance, meshPhaseAngle, pitchRadius } from './meshing'
import { connectedComponent } from './KinematicSolver'
import {
  createBody,
  type Assembly,
  type BodyId,
  type Connection,
  type PartId,
  type PlacedPart,
  type Wheel,
} from './types'
import { angleBetween, dist2, normalize2, pointAtAngle, scale2, sub2, AXIS_UP, type Vec2, type Vec3 } from './vec'

/**
 * Altura de um "andar" de engrenagens. Compound liga o andar 0 ao andar 1.
 *
 * A folga entre andares é generosa de propósito: encostadas, as duas rodas de
 * um compound viram um borrão só, e uma engrenagem do andar de baixo passando
 * sob uma roda maior do andar de cima parece colisão. Com espaço, dá para ver
 * que uma passa por baixo da outra.
 */
export const LEVEL_HEIGHT = GEAR_THICKNESS + 1.1

/** Y do centro de uma engrenagem no andar dado. */
export function levelHeight(level: number): number {
  return GEAR_THICKNESS / 2 + level * LEVEL_HEIGHT
}

let nextId = 1
function uid(prefix: string): string {
  return `${prefix}${nextId++}`
}

/** Reinicia o contador de ids. Só para testes determinísticos. */
export function resetIds(): void {
  nextId = 1
}

// ---------------------------------------------------------------------------
// Criação de peças
// ---------------------------------------------------------------------------

export function addSpurGear(
  assembly: Assembly,
  position: Vec2,
  teeth: number,
  level = 0,
  color?: string,
): PlacedPart {
  const body = createBody(uid('b'), AXIS_UP)
  assembly.bodies.set(body.id, body)

  const part: PlacedPart = {
    id: uid('p'),
    kind: 'spur',
    position,
    bodies: [body.id],
    wheels: [wheel(body.id, 'gear', teeth, level)],
    color: color ?? pickGearColor(assembly),
  }
  assembly.parts.set(part.id, part)
  return part
}

/**
 * Compound: DOIS números de dentes no MESMO corpo — logo, a mesma velocidade
 * angular. É isso que permite trocar de razão no meio do trem.
 *
 * Qual roda fica embaixo importa muito na prática: quem entra pela roda de
 * baixo (a que está no nível da mesa) e sai pela de cima multiplica
 * `N_baixo_entrada/N_baixo` por `N_cima/N_saída`. Por isso a paleta oferece as
 * duas montagens — uma acelera, a outra freia.
 */
export function addCompoundGear(
  assembly: Assembly,
  position: Vec2,
  bottomTeeth: number,
  topTeeth: number,
  level = 0,
): PlacedPart {
  const body = createBody(uid('b'), AXIS_UP)
  assembly.bodies.set(body.id, body)

  const part: PlacedPart = {
    id: uid('p'),
    kind: 'compound',
    position,
    bodies: [body.id],
    wheels: [wheel(body.id, 'gear', bottomTeeth, level), wheel(body.id, 'gear', topTeeth, level + 1)],
    color: COLORS.compound,
  }
  assembly.parts.set(part.id, part)
  return part
}

/**
 * Cônica: peça pré-montada com o par já casado. A entrada é uma engrenagem
 * deitada na mesa (eixo +Y) e a saída fica num eixo horizontal — o giro vira
 * a esquina de 90°.
 *
 * Vem como par pronto de propósito: posicionar duas cônicas soltas em 3D com o
 * dedo é frustrante, e o que a peça precisa ensinar é a mudança de direção.
 */
export function addBevelGear(
  assembly: Assembly,
  position: Vec2,
  inTeeth: number,
  outTeeth: number,
  outAxisAngle = 0,
): PlacedPart {
  const inBody = createBody(uid('b'), AXIS_UP)
  // Eixo de saída horizontal, apontando na direção `outAxisAngle` na mesa.
  const outAxis: Vec3 = { x: Math.cos(outAxisAngle), y: 0, z: -Math.sin(outAxisAngle) }
  const outBody = createBody(uid('b'), outAxis)
  assembly.bodies.set(inBody.id, inBody)
  assembly.bodies.set(outBody.id, outBody)

  connect(assembly, inBody.id, outBody.id, 'bevel', inTeeth / outTeeth)

  const part: PlacedPart = {
    id: uid('p'),
    kind: 'bevel',
    position,
    bodies: [inBody.id, outBody.id],
    wheels: [
      wheel(inBody.id, 'gear', inTeeth, 0),
      wheel(outBody.id, 'bevelOut', outTeeth, 0),
    ],
    color: COLORS.bevel,
    outAxisAngle,
  }
  assembly.parts.set(part.id, part)
  return part
}

export function addPulley(assembly: Assembly, position: Vec2, radius: number, level = 0): PlacedPart {
  const body = createBody(uid('b'), AXIS_UP)
  assembly.bodies.set(body.id, body)

  const part: PlacedPart = {
    id: uid('p'),
    kind: 'pulley',
    position,
    bodies: [body.id],
    wheels: [{ bodyId: body.id, kind: 'pulley', teeth: 0, radius, height: levelHeight(level) }],
    color: COLORS.pulley,
  }
  assembly.parts.set(part.id, part)
  return part
}

/**
 * Engrenagem com uma polia no mesmo eixo — mesma ideia do compound (dois
 * andares, mesmo corpo), só que o andar de cima não tem dente, tem correia.
 * É essa peça que deixa a correia entrar num trem de engrenagens: a roda de
 * baixo engrena normalmente, e a de cima leva o giro para uma polia distante.
 */
export function addGearPulley(
  assembly: Assembly,
  position: Vec2,
  teeth: number,
  pulleyRadius: number,
  level = 0,
): PlacedPart {
  const body = createBody(uid('b'), AXIS_UP)
  assembly.bodies.set(body.id, body)

  const part: PlacedPart = {
    id: uid('p'),
    kind: 'gearPulley',
    position,
    bodies: [body.id],
    wheels: [
      wheel(body.id, 'gear', teeth, level),
      { bodyId: body.id, kind: 'pulley', teeth: 0, radius: pulleyRadius, height: levelHeight(level + 1) },
    ],
    color: COLORS.pulley,
  }
  assembly.parts.set(part.id, part)
  return part
}

/** A roda de polia de uma peça — 'pulley' tem uma só, 'gearPulley' tem a de cima. */
function pulleyWheel(part: PlacedPart): Wheel | undefined {
  return part.wheels.find((w) => w.kind === 'pulley')
}

/**
 * Correia entre duas polias (ou entre as polias de duas peças gear+polia).
 * Tangentes externas ⇒ as duas giram no MESMO sentido (ao contrário do
 * engrenamento, que sempre inverte).
 */
export function addBelt(assembly: Assembly, pulleyA: PartId, pulleyB: PartId): PlacedPart | null {
  const a = assembly.parts.get(pulleyA)
  const b = assembly.parts.get(pulleyB)
  if (!a || !b || a.id === b.id) return null
  const wa = pulleyWheel(a)
  const wb = pulleyWheel(b)
  if (!wa || !wb) return null
  if (findBelt(assembly, pulleyA, pulleyB)) return null

  connect(assembly, wa.bodyId, wb.bodyId, 'belt', wa.radius / wb.radius)

  const part: PlacedPart = {
    id: uid('p'),
    kind: 'belt',
    position: { x: (a.position.x + b.position.x) / 2, z: (a.position.z + b.position.z) / 2 },
    bodies: [],
    wheels: [],
    color: COLORS.belt,
    ends: [pulleyA, pulleyB],
  }
  assembly.parts.set(part.id, part)
  return part
}

export function findBelt(assembly: Assembly, a: PartId, b: PartId): PlacedPart | undefined {
  for (const part of assembly.parts.values()) {
    if (part.kind !== 'belt' || !part.ends) continue
    const [x, y] = part.ends
    if ((x === a && y === b) || (x === b && y === a)) return part
  }
  return undefined
}

/**
 * Monta a manivela numa peça, tornando o corpo dela o driver do trem.
 * O ângulo da manivela é inicializado com o ângulo atual do corpo, para que
 * nada dê um salto visual no momento em que ela é colocada.
 */
export function attachCrank(assembly: Assembly, targetPartId: PartId): PlacedPart | null {
  const target = assembly.parts.get(targetPartId)
  if (!target || target.kind === 'belt' || target.kind === 'crank') return null

  const bodyId = target.bodies[0]
  const body = assembly.bodies.get(bodyId)
  if (!body) return null

  removeCrank(assembly)

  const part: PlacedPart = {
    id: uid('p'),
    kind: 'crank',
    position: target.position,
    bodies: [],
    wheels: [],
    color: COLORS.crank,
    mountedOn: targetPartId,
  }
  assembly.parts.set(part.id, part)
  assembly.driverBodyId = bodyId
  assembly.driverAngle = body.angle
  return part
}

export function findCrank(assembly: Assembly): PlacedPart | undefined {
  for (const part of assembly.parts.values()) if (part.kind === 'crank') return part
  return undefined
}

export function removeCrank(assembly: Assembly): void {
  const crank = findCrank(assembly)
  if (crank) assembly.parts.delete(crank.id)
  assembly.driverBodyId = null
}

/** Remove uma peça e tudo que dependia dela (correias, manivela montada nela). */
export function removePart(assembly: Assembly, partId: PartId): void {
  const part = assembly.parts.get(partId)
  if (!part) return

  for (const other of [...assembly.parts.values()]) {
    const dependsOnIt =
      (other.kind === 'belt' && other.ends?.includes(partId)) ||
      (other.kind === 'crank' && other.mountedOn === partId)
    if (dependsOnIt) removePart(assembly, other.id)
  }

  for (const bodyId of part.bodies) {
    assembly.bodies.delete(bodyId)
    for (const [cid, c] of assembly.connections) {
      if (c.a === bodyId || c.b === bodyId) assembly.connections.delete(cid)
    }
    if (assembly.driverBodyId === bodyId) {
      assembly.driverBodyId = null
      removeCrank(assembly)
    }
  }
  assembly.parts.delete(partId)
}

// ---------------------------------------------------------------------------
// Conexões
// ---------------------------------------------------------------------------

export function connect(
  assembly: Assembly,
  a: BodyId,
  b: BodyId,
  kind: Connection['kind'],
  f: number,
  mesh?: Connection['mesh'],
): Connection {
  const connection: Connection = { id: uid('c'), a, b, kind, f, mesh }
  assembly.connections.set(connection.id, connection)
  return connection
}

/** Remove todas as conexões de engrenamento que envolvem os corpos da peça. */
export function disconnectMeshes(assembly: Assembly, partId: PartId): void {
  const part = assembly.parts.get(partId)
  if (!part) return
  const own = new Set(part.bodies)
  for (const [cid, c] of assembly.connections) {
    if (c.kind !== 'mesh') continue
    if (own.has(c.a) || own.has(c.b)) assembly.connections.delete(cid)
  }
}

/**
 * Recalcula todo o engrenamento da montagem: refaz as arestas 'mesh' e depois
 * acerta a fase para os dentes lerem como encaixados.
 *
 * É o único caminho de engrenamento do app. Antes existiam dois — um ao
 * encaixar a peça e outro ao resolver a montagem — e só o primeiro aplicava a
 * fase, o que deixava dente contra dente sempre que a máquina era resolvida.
 */
export function syncMeshes(assembly: Assembly): void {
  rebuildMeshConnections(assembly)
  phaseMeshes(assembly)
}

function* meshableWheels(
  assembly: Assembly,
  excludePartId: PartId,
): Generator<{ part: PlacedPart; wheel: Wheel }> {
  for (const part of assembly.parts.values()) {
    if (part.id === excludePartId || part.kind === 'belt' || part.kind === 'crank') continue
    for (const w of part.wheels) yield { part, wheel: w }
  }
}

// ---------------------------------------------------------------------------
// Encaixe (snapping)
// ---------------------------------------------------------------------------

export interface SnapResult {
  position: Vec2
  /** Andar em que a peça deve ficar (o encaixe é que decide a altura). */
  level: number
  /** true quando encostou numa engrenagem e vai engrenar. */
  snapped: boolean
  /** false quando a posição sobrepõe outra peça — não pode soltar aí. */
  valid: boolean
}

/**
 * Dado o ponto onde o dedo está, decide onde a peça realmente fica.
 *
 * Gruda exatamente na distância de engrenamento, ao longo da linha dos centros.
 * O andar vem da roda alvo — arrastar uma engrenagem para perto da roda de cima
 * de uma compound a levanta sozinha.
 *
 * Detalhe que muda tudo no dedo de uma criança: o encaixe também vale quando a
 * peça é empurrada POR DENTRO da outra, e não só numa faixa estreita em volta
 * da distância certa. Empurrar uma engrenagem contra a vizinha é o gesto
 * natural; nesse caso ela é expulsa até encostar, em vez de a jogada ser
 * recusada por sobreposição.
 */
export function computeSnap(
  assembly: Assembly,
  movingPartId: PartId | null,
  movingWheels: Wheel[],
  desired: Vec2,
): SnapResult {
  let bestSingle: { position: Vec2; level: number; error: number } | null = null
  // Encaixe em dois vizinhos ao mesmo tempo tem prioridade sobre grudar só no
  // mais próximo: ver o comentário abaixo, junto de onde ele é calculado.
  let bestDual: { position: Vec2; level: number; error: number } | null = null

  for (const own of movingWheels) {
    if (own.kind !== 'gear') continue
    // O andar da roda que se move é relativo ao andar base da peça.
    const ownLevelOffset = Math.round((own.height - GEAR_THICKNESS / 2) / LEVEL_HEIGHT)
    const candidates: { center: Vec2; radius: number; level: number }[] = []

    for (const { part: other, wheel: target } of meshableWheels(assembly, movingPartId ?? '')) {
      // Só engrenagens deitadas (kind 'gear') são alvo de encaixe: pulley não
      // tem dente, e a roda de saída da cônica ('bevelOut') não é um disco
      // coplanar de verdade — ver o comentário em isPlacementValid.
      if (target.kind !== 'gear') continue
      const targetLevel = Math.round((target.height - GEAR_THICKNESS / 2) / LEVEL_HEIGHT)
      const required = meshDistance(own.teeth, target.teeth)
      const d = dist2(other.position, desired)
      // Folga positiva = ainda longe; negativa = já invadiu a vizinha.
      // Só a folga positiva tem limite: por dentro, sempre empurra para fora.
      const gap = d - required
      if (gap > SNAP_TOLERANCE) continue

      candidates.push({ center: other.position, radius: required, level: targetLevel - ownLevelOffset })

      const error = Math.abs(gap)
      if (bestSingle && error >= bestSingle.error) continue

      const direction = d < 1e-6 ? { x: 1, z: 0 } : normalize2(sub2(desired, other.position))
      bestSingle = {
        position: {
          x: other.position.x + direction.x * required,
          z: other.position.z + direction.z * required,
        },
        level: targetLevel - ownLevelOffset,
        error,
      }
    }

    // Uma peça no meio de um trem (a segunda de duas engrenagens entre a
    // manivela e a bandeira, por exemplo) precisa encaixar em DOIS vizinhos ao
    // mesmo tempo. Grudar só no vizinho mais próximo deixa a outra junção
    // sistematicamente errada por uma fração de milímetro — o suficiente para
    // `rebuildMeshConnections` recusar aquela aresta, não importa a posição
    // tentada. Quando dois candidatos do mesmo andar têm um ponto em comum,
    // esse ponto SEMPRE vence o candidato de vizinho único: é o único que
    // fecha as duas junções de verdade, mesmo quando fica uma fração a mais
    // do dedo do que o encaixe de um lado só.
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i]
        const b = candidates[j]
        if (a.level !== b.level) continue
        const point = circleIntersectionNear(a.center, a.radius, b.center, b.radius, desired)
        if (!point) continue

        const error = dist2(point, desired)
        if (bestDual && error >= bestDual.error) continue
        bestDual = { position: point, level: a.level, error }
      }
    }
  }

  const chosen = bestDual ?? bestSingle
  const position = chosen?.position ?? desired
  const level = chosen?.level ?? 0
  return {
    position,
    level,
    snapped: chosen !== null,
    valid: isPlacementValid(assembly, movingPartId, movingWheels, position, level),
  }
}

/**
 * Ponto de interseção de dois círculos mais perto de `desired`, ou `null`
 * quando os círculos estão longe demais um do outro para fazer sentido como
 * encaixe duplo.
 *
 * Quando os círculos quase se tocam mas não chegam a cruzar — o caso comum de
 * um trem quase colinear, em que o vizinho já grudado ficou um triz torto —,
 * `h` cai para 0 e o ponto retornado é o de menor erro combinado contra os
 * dois raios, em vez de não existir solução nenhuma.
 */
function circleIntersectionNear(
  centerA: Vec2,
  radiusA: number,
  centerB: Vec2,
  radiusB: number,
  desired: Vec2,
): Vec2 | null {
  const d = dist2(centerA, centerB)
  const near = radiusA + radiusB
  const far = Math.abs(radiusA - radiusB)
  if (d < 1e-9 || d > near + SNAP_TOLERANCE || d < far - SNAP_TOLERANCE) return null

  const a = (radiusA * radiusA - radiusB * radiusB + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(radiusA * radiusA - a * a, 0))

  const dir = scale2(sub2(centerB, centerA), 1 / d)
  const mid: Vec2 = { x: centerA.x + dir.x * a, z: centerA.z + dir.z * a }
  const perp: Vec2 = { x: -dir.z, z: dir.x }

  const p1: Vec2 = { x: mid.x + perp.x * h, z: mid.z + perp.z * h }
  const p2: Vec2 = { x: mid.x - perp.x * h, z: mid.z - perp.z * h }

  return dist2(p1, desired) <= dist2(p2, desired) ? p1 : p2
}

/** Nenhuma roda pode invadir o espaço de outra no mesmo andar. */
export function isPlacementValid(
  assembly: Assembly,
  movingPartId: PartId | null,
  movingWheels: Wheel[],
  position: Vec2,
  level: number,
): boolean {
  for (const own of movingWheels) {
    // A roda de saída da cônica não é um disco deitado na posição da peça —
    // ela fica de pé, deslocada para o eixo de saída (ver PartViews.buildBevel).
    // Tratá-la como um disco coplanar aqui rejeitava o único encaixe correto
    // entre a cônica e a engrenagem que a alimenta.
    if (own.kind === 'bevelOut') continue
    const ownLevelOffset = Math.round((own.height - GEAR_THICKNESS / 2) / LEVEL_HEIGHT)
    const ownHeight = levelHeight(level + ownLevelOffset)

    for (const { part: other, wheel: target } of meshableWheels(assembly, movingPartId ?? '')) {
      if (target.kind === 'bevelOut') continue
      if (Math.abs(target.height - ownHeight) > 1e-6) continue
      const d = dist2(other.position, position)
      const bothGears = own.kind === 'gear' && target.kind === 'gear'
      // Engrenagens podem chegar até a distância de engrenamento; qualquer
      // outro par precisa ficar afastado pelos raios externos.
      const minimum = bothGears
        ? meshDistance(own.teeth, target.teeth) - OVERLAP_EPSILON
        : own.radius + target.radius + OVERLAP_EPSILON
      if (d < minimum) return false
    }
  }
  return true
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

function wheel(bodyId: BodyId, kind: Wheel['kind'], teeth: number, level: number): Wheel {
  return { bodyId, kind, teeth, radius: pitchRadius(teeth), height: levelHeight(level) }
}

function pickGearColor(assembly: Assembly): string {
  const used = [...assembly.parts.values()].filter((p) => p.kind === 'spur').length
  return COLORS.gear[used % COLORS.gear.length]
}

/** Move a peça (e reposiciona a manivela montada nela). */
export function movePart(assembly: Assembly, partId: PartId, position: Vec2, level: number): void {
  const part = assembly.parts.get(partId)
  if (!part) return

  const baseLevel = Math.round((part.wheels[0].height - GEAR_THICKNESS / 2) / LEVEL_HEIGHT)
  const delta = level - baseLevel
  part.position = position
  if (delta !== 0) {
    for (const w of part.wheels) w.height += delta * LEVEL_HEIGHT
  }

  const crank = findCrank(assembly)
  if (crank?.mountedOn === partId) crank.position = position
}

/** Recria todas as conexões de engrenamento da montagem inteira. */
export function rebuildMeshConnections(assembly: Assembly): void {
  for (const [cid, c] of assembly.connections) {
    if (c.kind === 'mesh') assembly.connections.delete(cid)
  }

  const seen = new Set<string>()
  for (const part of assembly.parts.values()) {
    if (part.kind === 'belt' || part.kind === 'crank') continue
    for (const own of part.wheels) {
      if (own.kind !== 'gear') continue
      for (const { part: other, wheel: target } of meshableWheels(assembly, part.id)) {
        if (target.kind !== 'gear') continue
        // Só engrena quem está no mesmo andar e exatamente na distância certa.
        if (Math.abs(target.height - own.height) > 1e-6) continue
        const required = meshDistance(own.teeth, target.teeth)
        if (Math.abs(dist2(other.position, part.position) - required) > MESH_TOLERANCE) continue

        // O par é encontrado duas vezes, uma de cada lado: guarda só uma aresta.
        const key = [`${other.id}:${target.teeth}`, `${part.id}:${own.teeth}`].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)

        connect(assembly, target.bodyId, own.bodyId, 'mesh', -(target.teeth / own.teeth), {
          aPart: other.id,
          bPart: part.id,
          aTeeth: target.teeth,
          bTeeth: own.teeth,
        })
      }
    }
  }
}

/**
 * Acerta o ângulo de cada engrenagem para os dentes lerem como encaixados.
 *
 * Percorre o grafo de engrenamento a partir da manivela (ou, se não houver
 * manivela, da primeira peça) e resolve a condição de meio passo em cada
 * junção. Como as razões são exatas, essa defasagem inicial se mantém para
 * sempre — daí só ser preciso acertar a fase quando a montagem muda.
 *
 * A fase de cada corpo é definida pelo PRIMEIRO caminho que chega nele. Uma
 * engrenagem que fecha um laço pode ficar meio dente fora naquela última
 * junção: é o limite conhecido de trens em laço e não afeta o movimento.
 */
export function phaseMeshes(assembly: Assembly): void {
  const meshEdges = [...assembly.connections.values()].filter((c) => c.kind === 'mesh' && c.mesh)
  if (meshEdges.length === 0) return

  const neighbours = new Map<BodyId, Connection[]>()
  for (const edge of meshEdges) {
    for (const bodyId of [edge.a, edge.b]) {
      const list = neighbours.get(bodyId)
      if (list) list.push(edge)
      else neighbours.set(bodyId, [edge])
    }
  }

  // Ordem das raízes: primeiro a manivela, que é quem tem um ângulo "de
  // verdade"; depois as peças na ordem em que foram postas na mesa. Assim quem
  // já estava lá fica parado e a peça nova é que se acomoda ao encaixe — o
  // contrário faria a máquina inteira dar um pulo a cada peça adicionada.
  const roots: BodyId[] = []
  if (assembly.driverBodyId && neighbours.has(assembly.driverBodyId)) {
    roots.push(assembly.driverBodyId)
  }
  for (const part of assembly.parts.values()) {
    for (const bodyId of part.bodies) {
      if (neighbours.has(bodyId)) roots.push(bodyId)
    }
  }

  const visited = new Set<BodyId>()
  for (const root of roots) {
    if (visited.has(root)) continue
    visited.add(root)
    const queue: BodyId[] = [root]

    while (queue.length > 0) {
      const current = queue.shift()!
      for (const edge of neighbours.get(current) ?? []) {
        const next = edge.a === current ? edge.b : edge.a
        if (visited.has(next)) continue

        const info = edge.mesh!
        const currentIsA = edge.a === current
        const parentPart = assembly.parts.get(currentIsA ? info.aPart : info.bPart)
        const childPart = assembly.parts.get(currentIsA ? info.bPart : info.aPart)
        const parentBody = assembly.bodies.get(current)
        const childBody = assembly.bodies.get(next)

        if (parentPart && childPart && parentBody && childBody) {
          childBody.angle = meshPhaseAngle(
            currentIsA ? info.aTeeth : info.bTeeth,
            parentBody.angle,
            currentIsA ? info.bTeeth : info.aTeeth,
            parentPart.position,
            childPart.position,
          )
          childBody.phase = childBody.angle
        }

        visited.add(next)
        queue.push(next)
      }
    }
  }
}

/** Ponto do punho da manivela, para o raycast do arrasto. */
export function crankHandlePosition(center: Vec2, angle: number, armLength: number): Vec2 {
  return pointAtAngle(center, angle, armLength)
}

/** Direção da mesa entre dois pontos — reexportado para o resto do app. */
export { angleBetween, scale2, connectedComponent }
