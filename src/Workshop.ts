import * as THREE from 'three'
import { DEFAULT_SPEED, GEAR_THICKNESS, SAVE_FORMAT_VERSION, TABLE_HALF } from './config'
import {
  addBelt,
  addBevelGear,
  addCompoundGear,
  addGearPulley,
  addPulley,
  addSpurGear,
  attachCrank,
  computeSnap,
  findBelt,
  findCrank,
  isPlacementValid,
  LEVEL_HEIGHT,
  levelHeight,
  movePart,
  removePart,
  resetIds,
  syncMeshes,
} from './model/assembly'
import { applyDriverAngle, solve } from './model/KinematicSolver'
import { meshDistance, pitchRadius } from './model/meshing'
import { createAssembly, type Assembly, type PartId, type PlacedPart, type Wheel } from './model/types'
import type { Vec2 } from './model/vec'
import { specFootprint, type PartSpec } from './parts/partCatalog'
import { PartViews } from './scene/PartViews'
import { SceneManager } from './scene/SceneManager'
import { audio } from './services/audio'

export type Tool = 'move' | 'crank' | 'belt' | 'delete'

export interface WorkshopState {
  playing: boolean
  speed: number
  jammed: boolean
  tool: Tool
  selectedPartId: PartId | null
  /** Primeira polia tocada, enquanto se liga uma correia. */
  beltAnchor: PartId | null
  hasCrank: boolean
  partCount: number
  /** Mensagem curta para o toast. */
  message: string | null
  messageKey: number
}

export interface SavedPart {
  id: PartId
  kind: PlacedPart['kind']
  x: number
  z: number
  level: number
  teeth?: number
  smallTeeth?: number
  outTeeth?: number
  radius?: number
  color?: string
  ends?: [PartId, PartId]
  mountedOn?: PartId
  outAxisAngle?: number
}

export interface SavedBuild {
  v: number
  name: string
  savedAt: number
  parts: SavedPart[]
  driverAngle: number
}

type Listener = (state: WorkshopState) => void

/**
 * O motor do app: dono da montagem, da cena e do loop.
 *
 * Todo movimento sai de um único número — `assembly.driverAngle`. O solver
 * transforma a topologia em `ratio`/`phase` por corpo, e o loop só aplica
 * `angle = phase + ratio × driverAngle`. Nada é integrado por peça, então nada
 * deriva com o tempo.
 */
export class Workshop {
  readonly assembly: Assembly = createAssembly()
  readonly scene: SceneManager
  readonly views: PartViews

  private state: WorkshopState = {
    playing: false,
    speed: DEFAULT_SPEED,
    jammed: false,
    tool: 'move',
    selectedPartId: null,
    beltAnchor: null,
    hasCrank: false,
    partCount: 0,
    message: null,
    messageKey: 0,
  }

  private readonly listeners = new Set<Listener>()
  private jammedParts = new Set<PartId>()
  /** Chamado sempre que a montagem muda — as lições usam para testar o objetivo. */
  onAssemblyChanged: (() => void) | null = null

  constructor(container: HTMLElement) {
    this.scene = new SceneManager(container)
    this.views = new PartViews(this.scene.scene)
    this.scene.frameTable()
    this.scene.addFrameListener((dt) => this.tick(dt))
    this.scene.start()
  }

  // -- estado observável ------------------------------------------------------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState(): WorkshopState {
    return this.state
  }

  private patch(changes: Partial<WorkshopState>): void {
    this.state = { ...this.state, ...changes }
    for (const listener of this.listeners) listener(this.state)
  }

  toast(message: string): void {
    this.patch({ message, messageKey: this.state.messageKey + 1 })
  }

  setTool(tool: Tool): void {
    this.patch({ tool, beltAnchor: null, selectedPartId: null })
    this.refreshHighlights()
  }

  setPlaying(playing: boolean): void {
    this.patch({ playing })
    this.syncDriverOmega()
  }

  setSpeed(speed: number): void {
    this.patch({ speed })
    this.syncDriverOmega()
  }

  /**
   * Propaga a velocidade da manivela para todos os corpos.
   *
   * Como `omega = ratio × driverOmega` e as razões já estão resolvidas, isto é
   * uma multiplicação por corpo — não precisa refazer o solver só porque a
   * criança apertou brincar ou mexeu no slider.
   */
  private syncDriverOmega(): void {
    const omega = this.state.playing && !this.state.jammed ? this.state.speed : 0
    this.assembly.driverOmega = omega
    for (const body of this.assembly.bodies.values()) {
      body.omega = body.driven ? body.ratio * omega : 0
    }
  }

  select(partId: PartId | null): void {
    this.patch({ selectedPartId: partId })
    this.refreshHighlights()
  }

  // -- loop -------------------------------------------------------------------

  private tick(dt: number): void {
    const { playing, speed, jammed } = this.state
    // Uma máquina travada não anda: é exatamente o que aconteceria de verdade.
    if (playing && !jammed && this.assembly.driverBodyId) {
      applyDriverAngle(this.assembly, this.assembly.driverAngle + speed * dt)
    }
    this.views.updateAngles(this.assembly)
  }

  /** Recalcula a cinemática e sincroniza a cena. Chamar após mudar a montagem. */
  resolve(): void {
    syncMeshes(this.assembly)
    const result = solve(this.assembly)
    applyDriverAngle(this.assembly, this.assembly.driverAngle)

    const wasJammed = this.state.jammed
    this.jammedParts = new Set(
      [...this.assembly.parts.values()]
        .filter((p) => p.bodies.some((b) => result.jammedBodies.includes(b)))
        .map((p) => p.id),
    )

    this.views.sync(this.assembly)
    this.views.updateAngles(this.assembly)
    this.patch({
      jammed: result.jammed,
      hasCrank: findCrank(this.assembly) !== undefined,
      partCount: this.assembly.parts.size,
    })
    // Depois de saber se travou: uma máquina travada tem velocidade zero em
    // todo lugar, mesmo com o botão "brincar" ligado.
    this.syncDriverOmega()
    this.refreshHighlights()

    if (result.jammed && !wasJammed) {
      this.toast('A máquina travou! 🛑')
      audio.thud()
    }
    this.onAssemblyChanged?.()
  }

  private refreshHighlights(): void {
    this.views.clearHighlights()
    for (const partId of this.jammedParts) this.views.setHighlight(partId, 'jam')
    if (this.state.beltAnchor) this.views.setHighlight(this.state.beltAnchor, 'target')
    if (this.state.selectedPartId) this.views.setHighlight(this.state.selectedPartId, 'selected')
  }

  // -- criação de peças --------------------------------------------------------

  /** Cria a peça num lugar livre da mesa e a deixa selecionada. */
  spawn(spec: PartSpec, at?: Vec2): PlacedPart | null {
    if (spec.kind === 'belt' || spec.kind === 'crank') return null

    const wheels = previewWheels(spec, 0)
    const position =
      at ?? this.findSpotBesideGear(wheels) ?? this.findFreeSpot(wheels, specFootprint(spec))
    if (!position) {
      this.toast('A mesa está cheia!')
      return null
    }

    const part = this.createPart(spec, position, 0)
    this.resolve()
    this.select(part.id)
    return part
  }

  /**
   * Cria a peça exatamente onde foi pedido, sem resolver a cinemática.
   * As lições usam para montar o cenário inteiro e resolver uma vez só no fim.
   */
  createPart(
    spec: PartSpec,
    position: Vec2,
    level = 0,
    options: { locked?: boolean; marker?: PlacedPart['marker'] } = {},
  ): PlacedPart {
    const part = (() => {
      switch (spec.kind) {
        case 'spur':
          return addSpurGear(this.assembly, position, spec.teeth, level)
        case 'compound':
          return addCompoundGear(this.assembly, position, spec.bottomTeeth, spec.topTeeth, level)
        case 'bevel':
          return addBevelGear(this.assembly, position, spec.inTeeth, spec.outTeeth)
        case 'pulley':
          return addPulley(this.assembly, position, spec.radius, level)
        case 'gearPulley':
          return addGearPulley(this.assembly, position, spec.teeth, spec.pulleyRadius, level)
        default:
          throw new Error(`peça sem construtor: ${spec.kind}`)
      }
    })()

    if (options.locked) part.locked = true
    if (options.marker) part.marker = options.marker
    return part
  }

  /**
   * Tenta pôr a peça nova já ENGRENADA numa que está na mesa.
   *
   * É o que a criança queria de qualquer jeito, poupa um arrasto, e ainda por
   * cima é o empacotamento mais apertado que existe — sem isso, duas
   * engrenagens grandes mal cabem na mesa.
   */
  private findSpotBesideGear(wheels: Wheel[]): Vec2 | null {
    const own = wheels.find((w) => w.kind === 'gear')
    if (!own) return null

    // Da peça mais nova para a mais antiga: o trem cresce na ponta.
    const alvos = [...this.assembly.parts.values()]
      .filter((p) => p.kind !== 'belt' && p.kind !== 'crank')
      .reverse()

    for (const alvo of alvos) {
      for (const roda of alvo.wheels) {
        if (roda.kind !== 'gear' || roda.height !== own.height) continue
        const distancia = meshDistance(own.teeth, roda.teeth)

        for (let i = 0; i < 24; i++) {
          const angulo = (i / 24) * Math.PI * 2
          const candidato = {
            x: alvo.position.x + Math.cos(angulo) * distancia,
            z: alvo.position.z - Math.sin(angulo) * distancia,
          }
          const margem = Math.max(...wheels.map((w) => w.radius)) + 0.4
          if (Math.abs(candidato.x) > TABLE_HALF - margem) continue
          if (Math.abs(candidato.z) > TABLE_HALF - margem) continue
          if (isPlacementValid(this.assembly, null, wheels, candidato, 0)) return candidato
        }
      }
    }
    return null
  }

  /**
   * Procura onde a peça cabe sem sobrepor nada, do centro para fora.
   *
   * Varre uma grade fina em vez de anéis espaçados: com anéis, uma engrenagem
   * grande só tinha candidatos longe demais para caber na mesa e a peça
   * simplesmente não aparecia ao ser tocada na paleta. Varrer a grade inteira é
   * barato (algumas centenas de testes) e sempre acha uma vaga se ela existir.
   */
  private findFreeSpot(wheels: Wheel[], footprint: number): Vec2 | null {
    const limit = Math.max(TABLE_HALF - footprint - 0.4, 0)
    const step = 0.7

    const candidates: Vec2[] = []
    for (let x = -limit; x <= limit + 1e-9; x += step) {
      for (let z = -limit; z <= limit + 1e-9; z += step) candidates.push({ x, z })
    }
    // Do centro para fora: a peça nova aparece perto de onde a criança olha.
    candidates.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))

    for (const candidate of candidates) {
      if (isPlacementValid(this.assembly, null, wheels, candidate, 0)) return candidate
    }
    return null
  }

  delete(partId: PartId): void {
    if (this.assembly.parts.get(partId)?.locked) {
      this.toast('Essa peça faz parte do desafio.')
      return
    }
    removePart(this.assembly, partId)
    this.patch({ selectedPartId: null, beltAnchor: null })
    this.resolve()
  }

  clear(): void {
    for (const partId of [...this.assembly.parts.keys()]) removePart(this.assembly, partId)
    this.assembly.driverAngle = 0
    this.patch({ selectedPartId: null, beltAnchor: null, playing: false })
    this.resolve()
  }

  mountCrank(partId: PartId): boolean {
    const part = this.assembly.parts.get(partId)
    if (!part || part.kind === 'belt' || part.kind === 'crank') {
      this.toast('A manivela vai numa engrenagem ou polia.')
      return false
    }
    attachCrank(this.assembly, partId)
    this.resolve()
    this.toast('Manivela colocada! Gire o punho amarelo.')
    return true
  }

  /** Toque numa polia enquanto a ferramenta de correia está ativa. */
  tapForBelt(partId: PartId): void {
    const part = this.assembly.parts.get(partId)
    if (!part || !part.wheels.some((w) => w.kind === 'pulley')) {
      this.toast('Correias ligam duas polias.')
      return
    }
    const anchor = this.state.beltAnchor
    if (!anchor) {
      this.patch({ beltAnchor: partId })
      this.refreshHighlights()
      this.toast('Agora toque na outra polia.')
      return
    }
    if (anchor === partId) {
      this.patch({ beltAnchor: null })
      this.refreshHighlights()
      return
    }
    if (findBelt(this.assembly, anchor, partId)) {
      this.toast('Essas polias já estão ligadas.')
      this.patch({ beltAnchor: null })
      this.refreshHighlights()
      return
    }
    const belt = addBelt(this.assembly, anchor, partId)
    this.patch({ beltAnchor: null })
    this.resolve()
    if (!belt) this.toast('Não deu para ligar essas duas.')
  }

  // -- arrasto -----------------------------------------------------------------

  /** Move a peça durante o arrasto, com encaixe e aviso de posição inválida. */
  dragTo(partId: PartId, desired: Vec2): void {
    const part = this.assembly.parts.get(partId)
    if (!part || part.kind === 'belt' || part.kind === 'crank' || part.locked) return

    const snap = computeSnap(this.assembly, partId, part.wheels, clampToTable(desired, part))
    movePart(this.assembly, partId, snap.position, snap.level)
    this.views.sync(this.assembly)
    this.views.updateAngles(this.assembly)
    this.views.clearHighlights()
    this.views.setHighlight(partId, snap.valid ? (snap.snapped ? 'target' : 'selected') : 'invalid')
  }

  /** Fim do arrasto: aceita a posição ou desfaz se estiver inválida. */
  dropAt(partId: PartId, desired: Vec2, fallback: { position: Vec2; level: number }): void {
    const part = this.assembly.parts.get(partId)
    if (!part || part.locked) return

    const snap = computeSnap(this.assembly, partId, part.wheels, clampToTable(desired, part))
    if (snap.valid) {
      movePart(this.assembly, partId, snap.position, snap.level)
      if (snap.snapped) audio.click()
    } else {
      movePart(this.assembly, partId, fallback.position, fallback.level)
      this.toast('Aí não cabe!')
    }
    this.resolve()
    this.select(partId)
  }

  /** Ângulo atual da manivela — o arrasto circular escreve aqui. */
  setDriverAngle(angle: number): void {
    if (this.state.jammed) return
    applyDriverAngle(this.assembly, angle)
    this.views.updateAngles(this.assembly)
  }

  levelOf(part: PlacedPart): number {
    return Math.round((part.wheels[0].height - GEAR_THICKNESS / 2) / LEVEL_HEIGHT)
  }

  // -- persistência -------------------------------------------------------------

  serialize(name: string): SavedBuild {
    const parts: SavedPart[] = []
    for (const part of this.assembly.parts.values()) {
      const level = part.wheels.length > 0 ? this.levelOf(part) : 0
      const saved: SavedPart = {
        id: part.id,
        kind: part.kind,
        x: part.position.x,
        z: part.position.z,
        level,
        color: part.color,
      }
      if (part.kind === 'spur') saved.teeth = part.wheels[0].teeth
      if (part.kind === 'compound') {
        saved.teeth = part.wheels[0].teeth
        saved.smallTeeth = part.wheels[1].teeth
      }
      if (part.kind === 'bevel') {
        saved.teeth = part.wheels[0].teeth
        saved.outTeeth = part.wheels[1].teeth
        saved.outAxisAngle = part.outAxisAngle
      }
      if (part.kind === 'pulley') saved.radius = part.wheels[0].radius
      if (part.kind === 'gearPulley') {
        saved.teeth = part.wheels[0].teeth
        saved.radius = part.wheels[1].radius
      }
      if (part.kind === 'belt') saved.ends = part.ends
      if (part.kind === 'crank') saved.mountedOn = part.mountedOn
      parts.push(saved)
    }
    return {
      v: SAVE_FORMAT_VERSION,
      name,
      savedAt: Date.now(),
      parts,
      driverAngle: this.assembly.driverAngle,
    }
  }

  load(build: SavedBuild): void {
    for (const partId of [...this.assembly.parts.keys()]) removePart(this.assembly, partId)
    resetIds()
    this.assembly.driverAngle = build.driverAngle ?? 0

    // Ids antigos → ids novos, para as correias e a manivela reencontrarem as peças.
    const remap = new Map<PartId, PartId>()

    for (const saved of build.parts) {
      if (saved.kind === 'belt' || saved.kind === 'crank') continue
      const spec = specOf(saved)
      if (!spec) continue
      const part = this.createPart(spec, { x: saved.x, z: saved.z }, saved.level)
      if (saved.color) part.color = saved.color
      remap.set(saved.id, part.id)
    }

    for (const saved of build.parts) {
      if (saved.kind !== 'belt' || !saved.ends) continue
      const a = remap.get(saved.ends[0])
      const b = remap.get(saved.ends[1])
      if (a && b) addBelt(this.assembly, a, b)
    }

    for (const saved of build.parts) {
      if (saved.kind !== 'crank' || !saved.mountedOn) continue
      const target = remap.get(saved.mountedOn)
      if (target) attachCrank(this.assembly, target)
    }

    this.patch({ selectedPartId: null, beltAnchor: null })
    this.resolve()
  }

  dispose(): void {
    this.views.dispose()
    this.scene.dispose()
    this.listeners.clear()
  }
}

function specOf(saved: SavedPart): PartSpec | null {
  switch (saved.kind) {
    case 'spur':
      return { kind: 'spur', teeth: saved.teeth ?? 12 }
    case 'compound':
      return { kind: 'compound', bottomTeeth: saved.teeth ?? 24, topTeeth: saved.smallTeeth ?? 8 }
    case 'bevel':
      return { kind: 'bevel', inTeeth: saved.teeth ?? 16, outTeeth: saved.outTeeth ?? 16 }
    case 'pulley':
      return { kind: 'pulley', radius: saved.radius ?? pitchRadius(12) }
    case 'gearPulley':
      return {
        kind: 'gearPulley',
        teeth: saved.teeth ?? 12,
        pulleyRadius: saved.radius ?? pitchRadius(8),
      }
    default:
      return null
  }
}

/** Rodas equivalentes de uma peça ainda não criada — para testar se cabe. */
export function previewWheels(spec: PartSpec, level: number): Wheel[] {
  const w = (kind: Wheel['kind'], teeth: number, radius: number, lvl: number): Wheel => ({
    bodyId: '',
    kind,
    teeth,
    radius,
    height: levelHeight(lvl),
  })
  switch (spec.kind) {
    case 'spur':
      return [w('gear', spec.teeth, pitchRadius(spec.teeth), level)]
    case 'compound':
      return [
        w('gear', spec.bottomTeeth, pitchRadius(spec.bottomTeeth), level),
        w('gear', spec.topTeeth, pitchRadius(spec.topTeeth), level + 1),
      ]
    case 'bevel':
      return [
        w('gear', spec.inTeeth, pitchRadius(spec.inTeeth), level),
        w('bevelOut', spec.outTeeth, pitchRadius(spec.outTeeth), level),
      ]
    case 'pulley':
      return [w('pulley', 0, spec.radius, level)]
    case 'gearPulley':
      return [
        w('gear', spec.teeth, pitchRadius(spec.teeth), level),
        w('pulley', 0, spec.pulleyRadius, level + 1),
      ]
    default:
      return []
  }
}

function clampToTable(position: Vec2, part: PlacedPart): Vec2 {
  const margin = Math.max(...part.wheels.map((w) => w.radius), 0.5) + 0.3
  const limit = TABLE_HALF - margin
  return {
    x: THREE.MathUtils.clamp(position.x, -limit, limit),
    z: THREE.MathUtils.clamp(position.z, -limit, limit),
  }
}
