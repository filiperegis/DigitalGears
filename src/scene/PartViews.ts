import * as THREE from 'three'
import { COLORS, GEAR_THICKNESS } from '../config'
import { levelHeight } from '../model/assembly'
import { outerRadius, pitchRadius } from '../model/meshing'
import type { Assembly, PartId, PlacedPart, Wheel } from '../model/types'
import { buildBeltGeometry } from '../parts/BeltGeometry'
import {
  bevelGearGeometry,
  gearGeometry,
  hubGeometry,
  hubRadius,
  pulleyFlangeGeometry,
  pulleyGeometry,
} from '../parts/GearGeometry'

const UP = new THREE.Vector3(0, 1, 0)

/** Comprimento do braço da manivela, em raios da peça em que está montada. */
export const CRANK_ARM_FACTOR = 0.72
export const CRANK_MIN_ARM = 0.9

export type HighlightKind = 'none' | 'selected' | 'invalid' | 'jam' | 'target'

interface RotatingPiece {
  object: THREE.Object3D
  bodyId: string
  base: THREE.Quaternion
  axis: THREE.Vector3
}

interface PartView {
  root: THREE.Group
  rotating: RotatingPiece[]
  materials: THREE.MeshStandardMaterial[]
  /** Assinatura da geometria: se mudar, a view é reconstruída. */
  signature: string
  /** Punho da manivela, para o raycast do arrasto circular. */
  handle?: THREE.Object3D
  armLength?: number
}

/**
 * Ponte entre o modelo e a cena: cria um Object3D por peça e, a cada frame,
 * aplica o ângulo de cada corpo.
 *
 * A rotação final é sempre `axisRotation(eixo, ângulo) × baseQuaternion`, onde
 * a base é a orientação de montagem da peça. É isso que permite a cônica girar
 * num eixo horizontal sem nenhum caso especial no loop.
 */
export class PartViews {
  private readonly views = new Map<PartId, PartView>()
  readonly group = new THREE.Group()
  /** Objetos clicáveis, com userData.partId. */
  readonly pickable: THREE.Object3D[] = []

  constructor(private readonly scene: THREE.Scene) {
    scene.add(this.group)
  }

  /** Cria, atualiza e remove views para casar com a montagem. */
  sync(assembly: Assembly): void {
    for (const [partId, view] of this.views) {
      if (!assembly.parts.has(partId)) {
        this.disposeView(view)
        this.views.delete(partId)
      }
    }

    for (const part of assembly.parts.values()) {
      const signature = signatureOf(assembly, part)
      const existing = this.views.get(part.id)
      if (existing && existing.signature === signature) continue
      if (existing) {
        this.disposeView(existing)
        this.views.delete(part.id)
      }
      const view = this.buildView(assembly, part)
      view.signature = signature
      this.views.set(part.id, view)
      this.group.add(view.root)
    }

    this.pickable.length = 0
    for (const view of this.views.values()) this.pickable.push(view.root)
  }

  /** Aplica o ângulo de cada corpo. Chamado todo frame. */
  updateAngles(assembly: Assembly): void {
    for (const view of this.views.values()) {
      for (const piece of view.rotating) {
        const body = assembly.bodies.get(piece.bodyId)
        if (!body) continue
        piece.object.quaternion.setFromAxisAngle(piece.axis, body.angle).multiply(piece.base)
      }
    }
  }

  setHighlight(partId: PartId, kind: HighlightKind): void {
    const view = this.views.get(partId)
    if (!view) return
    const color = highlightColor(kind)
    for (const material of view.materials) {
      material.emissive.set(color)
      // Fraco de propósito: o realce precisa dizer "esta aqui" sem apagar a cor
      // da peça, que é justamente como a criança diferencia as engrenagens.
      material.emissiveIntensity = kind === 'none' ? 0 : 0.3
    }
  }

  clearHighlights(): void {
    for (const partId of this.views.keys()) this.setHighlight(partId, 'none')
  }

  /** Posição do punho da manivela no mundo, e o raio do braço. */
  crankHandle(partId: PartId): { position: THREE.Vector3; armLength: number } | null {
    const view = this.views.get(partId)
    if (!view?.handle || view.armLength === undefined) return null
    const position = new THREE.Vector3()
    view.handle.getWorldPosition(position)
    return { position, armLength: view.armLength }
  }

  /** Peça sob o ponteiro, se houver. */
  pick(raycaster: THREE.Raycaster): { partId: PartId; role: string; point: THREE.Vector3 } | null {
    const hits = raycaster.intersectObjects(this.pickable, true)
    for (const hit of hits) {
      let node: THREE.Object3D | null = hit.object
      while (node) {
        const partId = node.userData.partId as PartId | undefined
        if (partId) {
          return { partId, role: (hit.object.userData.role as string) ?? 'body', point: hit.point }
        }
        node = node.parent
      }
    }
    return null
  }

  dispose(): void {
    for (const view of this.views.values()) this.disposeView(view)
    this.views.clear()
    this.scene.remove(this.group)
  }

  // -------------------------------------------------------------------------

  private disposeView(view: PartView): void {
    view.root.removeFromParent()
    view.root.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      // Geometrias de engrenagem são compartilhadas via cache; só descarta as
      // que foram criadas para esta view.
      if (mesh.userData.ownGeometry) mesh.geometry.dispose()
      const material = mesh.material
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material.dispose()
    })
  }

  private buildView(assembly: Assembly, part: PlacedPart): PartView {
    const view: PartView = { root: new THREE.Group(), rotating: [], materials: [], signature: '' }
    view.root.userData.partId = part.id
    view.root.position.set(part.position.x, 0, part.position.z)

    switch (part.kind) {
      case 'spur':
        this.buildSpur(view, part)
        break
      case 'compound':
        this.buildCompound(view, part)
        break
      case 'bevel':
        this.buildBevel(view, part)
        break
      case 'pulley':
        this.buildPulley(view, part)
        break
      case 'gearPulley':
        this.buildGearPulley(view, part)
        break
      case 'belt':
        this.buildBelt(view, assembly, part)
        break
      case 'crank':
        this.buildCrank(view, assembly, part)
        break
    }

    if (part.marker === 'alvo') this.addFlag(view, part)
    return view
  }

  /**
   * Bandeirinha em cima da peça-alvo da lição. É o "faça ESTA girar" —
   * mais claro para uma criança do que qualquer texto.
   */
  private addFlag(view: PartView, part: PlacedPart): void {
    const top = Math.max(...part.wheels.map((w) => w.height), 0) + GEAR_THICKNESS
    const height = 1.5

    const pole = new THREE.Mesh(
      hubGeometry(0.06, height),
      this.material(view, COLORS.hub, { roughness: 0.6 }),
    )
    pole.position.y = top + height / 2
    pole.userData.partId = part.id
    view.root.add(pole)

    const cloth = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.5, 0.06),
      this.material(view, COLORS.highlight, { roughness: 0.5, emissiveIntensity: 0 }),
    )
    cloth.position.set(0.4, top + height - 0.3, 0)
    cloth.castShadow = true
    cloth.userData.partId = part.id
    view.root.add(cloth)
  }

  private material(
    view: PartView,
    color: THREE.ColorRepresentation,
    extra?: THREE.MeshStandardMaterialParameters,
  ) {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.42,
      metalness: 0.06,
      ...extra,
    })
    view.materials.push(material)
    return material
  }

  private buildSpur(view: PartView, part: PlacedPart): void {
    const w = part.wheels[0]
    const gear = new THREE.Mesh(gearGeometry(w.teeth), this.material(view, part.color))
    gear.position.y = w.height
    gear.castShadow = true
    gear.receiveShadow = true
    gear.userData.partId = part.id
    view.root.add(gear)
    view.rotating.push({ object: gear, bodyId: w.bodyId, base: new THREE.Quaternion(), axis: UP.clone() })

    this.addAxle(view, part, w.height, hubRadius(w.teeth))
  }

  private buildCompound(view: PartView, part: PlacedPart): void {
    for (const w of part.wheels) {
      const shade = w === part.wheels[1] ? new THREE.Color(part.color).offsetHSL(0, 0, 0.14) : part.color
      const gear = new THREE.Mesh(gearGeometry(w.teeth), this.material(view, shade))
      gear.position.y = w.height
      gear.castShadow = true
      gear.receiveShadow = true
      gear.userData.partId = part.id
      view.root.add(gear)
      view.rotating.push({
        object: gear,
        bodyId: w.bodyId,
        base: new THREE.Quaternion(),
        axis: UP.clone(),
      })
    }
    const top = part.wheels[part.wheels.length - 1]
    this.addAxle(view, part, top.height, hubRadius(part.wheels[0].teeth))
  }

  private buildBevel(view: PartView, part: PlacedPart): void {
    const [inWheel, outWheel] = part.wheels
    const angle = part.outAxisAngle ?? 0
    const outAxis = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle))

    // Engrenagem de entrada: deitada na mesa, afunilando para cima.
    const input = new THREE.Mesh(bevelGearGeometry(inWheel.teeth), this.material(view, part.color))
    input.position.y = inWheel.height
    input.castShadow = true
    input.receiveShadow = true
    input.userData.partId = part.id
    view.root.add(input)
    view.rotating.push({
      object: input,
      bodyId: inWheel.bodyId,
      base: new THREE.Quaternion(),
      axis: UP.clone(),
    })

    // Engrenagem de saída: em pé, num eixo horizontal. É a virada de 90°.
    const outRadius = pitchRadius(outWheel.teeth)
    const output = new THREE.Mesh(
      bevelGearGeometry(outWheel.teeth),
      this.material(view, new THREE.Color(part.color).offsetHSL(0, 0, -0.1)),
    )
    // O lado estreito do cone precisa olhar para dentro, na direção da entrada.
    const base = new THREE.Quaternion().setFromUnitVectors(UP, outAxis.clone().negate())
    output.quaternion.copy(base)
    output.position.set(
      Math.cos(angle) * pitchRadius(inWheel.teeth),
      inWheel.height + outRadius,
      -Math.sin(angle) * pitchRadius(inWheel.teeth),
    )
    output.castShadow = true
    output.userData.partId = part.id
    view.root.add(output)
    view.rotating.push({ object: output, bodyId: outWheel.bodyId, base, axis: outAxis.clone() })

    // Suporte do eixo de saída.
    const post = new THREE.Mesh(
      hubGeometry(0.16, inWheel.height + outRadius),
      this.material(view, COLORS.hub, { roughness: 0.6 }),
    )
    post.position.set(
      Math.cos(angle) * (pitchRadius(inWheel.teeth) + outerRadius(outWheel.teeth) * 0.55),
      (inWheel.height + outRadius) / 2,
      -Math.sin(angle) * (pitchRadius(inWheel.teeth) + outerRadius(outWheel.teeth) * 0.55),
    )
    post.castShadow = true
    post.userData.partId = part.id
    view.root.add(post)

    this.addAxle(view, part, inWheel.height, 0.18)
  }

  private buildPulley(view: PartView, part: PlacedPart): void {
    const w = part.wheels[0]
    const group = new THREE.Group()
    group.position.y = w.height

    const drum = new THREE.Mesh(pulleyGeometry(w.radius), this.material(view, part.color))
    drum.castShadow = true
    drum.receiveShadow = true
    drum.userData.partId = part.id
    group.add(drum)

    const flangeMaterial = this.material(view, new THREE.Color(part.color).offsetHSL(0, 0, -0.14))
    for (const sign of [-1, 1]) {
      const flange = new THREE.Mesh(pulleyFlangeGeometry(w.radius), flangeMaterial)
      flange.position.y = (sign * GEAR_THICKNESS) / 2
      flange.userData.partId = part.id
      group.add(flange)
    }

    view.root.add(group)
    view.rotating.push({
      object: group,
      bodyId: w.bodyId,
      base: new THREE.Quaternion(),
      axis: UP.clone(),
    })
    this.addAxle(view, part, w.height, 0.16)
  }

  /**
   * Engrenagem embaixo (engrena normalmente) e polia em cima, no mesmo eixo —
   * é essa peça que deixa uma correia entrar num trem de engrenagens.
   */
  private buildGearPulley(view: PartView, part: PlacedPart): void {
    const [gear, pulley] = part.wheels

    const teeth = new THREE.Mesh(gearGeometry(gear.teeth), this.material(view, part.color))
    teeth.position.y = gear.height
    teeth.castShadow = true
    teeth.receiveShadow = true
    teeth.userData.partId = part.id
    view.root.add(teeth)
    view.rotating.push({ object: teeth, bodyId: gear.bodyId, base: new THREE.Quaternion(), axis: UP.clone() })

    const drumGroup = new THREE.Group()
    drumGroup.position.y = pulley.height

    const shade = new THREE.Color(part.color).offsetHSL(0, 0, 0.14)
    const drum = new THREE.Mesh(pulleyGeometry(pulley.radius), this.material(view, shade))
    drum.castShadow = true
    drum.receiveShadow = true
    drum.userData.partId = part.id
    drumGroup.add(drum)

    const flangeMaterial = this.material(view, new THREE.Color(shade).offsetHSL(0, 0, -0.14))
    for (const sign of [-1, 1]) {
      const flange = new THREE.Mesh(pulleyFlangeGeometry(pulley.radius), flangeMaterial)
      flange.position.y = (sign * GEAR_THICKNESS) / 2
      flange.userData.partId = part.id
      drumGroup.add(flange)
    }

    view.root.add(drumGroup)
    view.rotating.push({
      object: drumGroup,
      bodyId: pulley.bodyId,
      base: new THREE.Quaternion(),
      axis: UP.clone(),
    })

    this.addAxle(view, part, pulley.height, hubRadius(gear.teeth))
  }

  private buildBelt(view: PartView, assembly: Assembly, part: PlacedPart): void {
    view.root.position.set(0, 0, 0)
    if (!part.ends) return
    const [aId, bId] = part.ends
    const a = assembly.parts.get(aId)
    const b = assembly.parts.get(bId)
    const wa = a && pulleyWheelOf(a)
    const wb = b && pulleyWheelOf(b)
    if (!a || !b || !wa || !wb) return

    const shape = buildBeltGeometry(a.position, wa.radius, b.position, wb.radius, wa.height)
    if (!shape) return

    const mesh = new THREE.Mesh(
      shape.geometry,
      this.material(view, part.color, { roughness: 0.6, metalness: 0 }),
    )
    mesh.castShadow = true
    mesh.userData.partId = part.id
    mesh.userData.ownGeometry = true
    view.root.add(mesh)
  }

  private buildCrank(view: PartView, assembly: Assembly, part: PlacedPart): void {
    const target = part.mountedOn ? assembly.parts.get(part.mountedOn) : undefined
    if (!target || !assembly.driverBodyId) return

    const wheel = target.wheels[target.wheels.length - 1]
    const armLength = Math.max(CRANK_MIN_ARM, wheel.radius * CRANK_ARM_FACTOR)
    const baseY = wheel.height + GEAR_THICKNESS * 0.9

    const group = new THREE.Group()
    group.position.set(0, baseY, 0)

    const shaft = new THREE.Mesh(
      hubGeometry(0.13, GEAR_THICKNESS * 1.6),
      this.material(view, COLORS.crank, { roughness: 0.5 }),
    )
    shaft.position.y = -GEAR_THICKNESS * 0.5
    shaft.userData.partId = part.id
    group.add(shaft)

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(armLength, 0.16, 0.28),
      this.material(view, COLORS.crank, { roughness: 0.5 }),
    )
    arm.position.set(armLength / 2, 0.18, 0)
    arm.castShadow = true
    arm.userData.partId = part.id
    group.add(arm)

    // Punho: o alvo de toque. Deliberadamente gordo para o dedo de uma criança.
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.6, 20),
      this.material(view, COLORS.crankHandle, { roughness: 0.35 }),
    )
    handle.position.set(armLength, 0.5, 0)
    handle.castShadow = true
    handle.userData.partId = part.id
    handle.userData.role = 'crankHandle'
    group.add(handle)

    view.root.position.set(target.position.x, 0, target.position.z)
    view.root.add(group)
    view.handle = handle
    view.armLength = armLength
    view.rotating.push({
      object: group,
      bodyId: assembly.driverBodyId,
      base: new THREE.Quaternion(),
      axis: UP.clone(),
    })
  }

  /** Eixo visível: cubo central e, para peças levantadas, o poste até a mesa. */
  private addAxle(view: PartView, part: PlacedPart, height: number, radius: number): void {
    const material = this.material(view, COLORS.hub, { roughness: 0.55, metalness: 0.2 })

    const hub = new THREE.Mesh(hubGeometry(radius * 0.92, GEAR_THICKNESS * 1.25), material)
    hub.position.y = height
    hub.userData.partId = part.id
    view.root.add(hub)

    const bottom = height - GEAR_THICKNESS / 2
    if (bottom > 0.01) {
      const post = new THREE.Mesh(hubGeometry(radius * 0.72, bottom), material)
      post.position.y = bottom / 2
      post.castShadow = true
      post.userData.partId = part.id
      view.root.add(post)
    }
  }
}

function highlightColor(kind: HighlightKind): number {
  switch (kind) {
    case 'selected':
      return new THREE.Color(COLORS.highlight).getHex()
    case 'invalid':
      return new THREE.Color(COLORS.invalid).getHex()
    case 'jam':
      return new THREE.Color(COLORS.jam).getHex()
    case 'target':
      return new THREE.Color(COLORS.highlight).getHex()
    default:
      return 0x000000
  }
}

/**
 * Muda quando a geometria da peça precisa ser refeita (posição, andar, dentes,
 * ou — no caso da correia — a posição das polias das pontas).
 */
function signatureOf(assembly: Assembly, part: PlacedPart): string {
  const base = [
    part.kind,
    part.color,
    part.marker ?? '',
    part.position.x.toFixed(4),
    part.position.z.toFixed(4),
    part.outAxisAngle?.toFixed(4) ?? '',
    part.wheels.map((w) => `${w.kind}:${w.teeth}:${w.radius.toFixed(3)}:${w.height.toFixed(3)}`).join(','),
  ]

  if (part.kind === 'belt' && part.ends) {
    for (const id of part.ends) {
      const end = assembly.parts.get(id)
      const wheel = end && pulleyWheelOf(end)
      base.push(end && wheel ? `${end.position.x.toFixed(4)},${end.position.z.toFixed(4)},${wheel.radius}` : 'x')
    }
  }

  if (part.kind === 'crank') {
    const target = part.mountedOn ? assembly.parts.get(part.mountedOn) : undefined
    base.push(part.mountedOn ?? '')
    base.push(target ? `${target.position.x.toFixed(4)},${target.position.z.toFixed(4)}` : 'x')
    base.push(target ? String(target.wheels[target.wheels.length - 1].height) : 'x')
  }

  return base.join('|')
}

/** A roda de polia de uma peça — 'pulley' tem uma só, 'gearPulley' tem a de cima. */
function pulleyWheelOf(part: PlacedPart): Wheel | undefined {
  return part.wheels.find((w) => w.kind === 'pulley')
}

/** Altura padrão de uma engrenagem no andar dado — reexportado por conveniência. */
export { levelHeight }
