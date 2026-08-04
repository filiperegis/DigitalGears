import * as THREE from 'three'
import { angleDelta } from '../model/meshing'
import type { PartId } from '../model/types'
import type { Vec2 } from '../model/vec'
import type { Workshop } from '../Workshop'

/** Distância em pixels a partir da qual o gesto vira arrasto, e não toque. */
const DRAG_THRESHOLD = 6

type Gesture =
  | { type: 'none' }
  | {
      type: 'part'
      partId: PartId
      /** Deslocamento entre o ponto tocado e o centro da peça. */
      grabOffset: Vec2
      origin: { position: Vec2; level: number }
      planeY: number
      moved: boolean
    }
  | {
      type: 'crank'
      center: Vec2
      planeY: number
      lastPointerAngle: number
      driverAngleAtGrab: number
      accumulated: number
    }

/**
 * Toque e mouse, tratados igual.
 *
 * A regra que evita a briga de gestos da especificação: enquanto o dedo estiver
 * segurando uma PEÇA, o OrbitControls fica desligado; ao soltar, volta. Assim
 * arrastar uma engrenagem nunca gira a câmera junto.
 */
export class PointerController {
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly plane = new THREE.Plane()
  private readonly hitPoint = new THREE.Vector3()

  private gesture: Gesture = { type: 'none' }
  private downAt = { x: 0, y: 0 }
  private activePointerId: number | null = null

  constructor(private readonly workshop: Workshop) {
    const canvas = workshop.scene.renderer.domElement
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
    canvas.addEventListener('contextmenu', (event) => event.preventDefault())
  }

  dispose(): void {
    const canvas = this.workshop.scene.renderer.domElement
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerup', this.onPointerUp)
    canvas.removeEventListener('pointercancel', this.onPointerUp)
  }

  // ---------------------------------------------------------------------------

  private onPointerDown = (event: PointerEvent): void => {
    // Dois dedos é gesto de câmera (zoom/pan): não é manipulação de peça.
    if (this.activePointerId !== null) {
      this.cancelGesture()
      return
    }
    this.activePointerId = event.pointerId
    this.downAt = { x: event.clientX, y: event.clientY }

    const hit = this.raycast(event)
    if (!hit) return

    const { tool } = this.workshop.getState()

    if (tool === 'delete') {
      this.workshop.delete(hit.partId)
      return
    }
    if (tool === 'crank') {
      this.workshop.mountCrank(hit.partId)
      this.workshop.setTool('move')
      return
    }
    if (tool === 'belt') {
      this.workshop.tapForBelt(hit.partId)
      return
    }

    if (hit.role === 'crankHandle') {
      this.beginCrankDrag(hit.partId, hit.point)
      return
    }

    const part = this.workshop.assembly.parts.get(hit.partId)
    if (!part) return

    if (part.kind === 'crank') {
      // Tocou no corpo da manivela, não no punho: nada a arrastar.
      this.workshop.select(part.mountedOn ?? null)
      return
    }
    if (part.kind === 'belt') {
      this.workshop.select(part.id)
      return
    }

    this.beginPartDrag(hit.partId, hit.point)
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (this.gesture.type === 'none' || event.pointerId !== this.activePointerId) return

    const travelled = Math.hypot(event.clientX - this.downAt.x, event.clientY - this.downAt.y)

    if (this.gesture.type === 'part') {
      if (!this.gesture.moved && travelled < DRAG_THRESHOLD) return
      this.gesture.moved = true
      const point = this.pointOnPlane(event, this.gesture.planeY)
      if (!point) return
      this.workshop.dragTo(this.gesture.partId, {
        x: point.x + this.gesture.grabOffset.x,
        z: point.z + this.gesture.grabOffset.z,
      })
      return
    }

    if (this.gesture.type === 'crank') {
      const point = this.pointOnPlane(event, this.gesture.planeY)
      if (!point) return
      const pointerAngle = Math.atan2(
        -(point.z - this.gesture.center.z),
        point.x - this.gesture.center.x,
      )
      // Desenrola a volta para o punho poder dar quantas voltas quiser.
      this.gesture.accumulated += angleDelta(this.gesture.lastPointerAngle, pointerAngle)
      this.gesture.lastPointerAngle = pointerAngle
      this.workshop.setDriverAngle(this.gesture.driverAngleAtGrab + this.gesture.accumulated)
    }
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return
    this.activePointerId = null

    if (this.gesture.type === 'part') {
      const { partId, moved, origin, grabOffset, planeY } = this.gesture
      this.gesture = { type: 'none' }
      this.enableOrbit(true)

      if (!moved) {
        this.workshop.select(partId)
        return
      }
      const point = this.pointOnPlane(event, planeY)
      const desired = point
        ? { x: point.x + grabOffset.x, z: point.z + grabOffset.z }
        : origin.position
      this.workshop.dropAt(partId, desired, origin)
      return
    }

    if (this.gesture.type === 'crank') {
      this.gesture = { type: 'none' }
      this.enableOrbit(true)
    }
  }

  private cancelGesture(): void {
    if (this.gesture.type === 'none') return
    this.gesture = { type: 'none' }
    this.enableOrbit(true)
  }

  // ---------------------------------------------------------------------------

  private beginPartDrag(partId: PartId, point: THREE.Vector3): void {
    const part = this.workshop.assembly.parts.get(partId)
    if (!part) return

    // Peça travada de lição: o gesto vira orbit de câmera, em vez de um arrasto
    // que não vai a lugar nenhum.
    if (part.locked) {
      this.workshop.select(partId)
      return
    }

    // Arrasta no plano da própria peça, para ela seguir o dedo sem escorregar.
    const planeY = part.wheels[0]?.height ?? 0
    this.gesture = {
      type: 'part',
      partId,
      grabOffset: { x: part.position.x - point.x, z: part.position.z - point.z },
      origin: { position: { ...part.position }, level: this.workshop.levelOf(part) },
      planeY,
      moved: false,
    }
    this.enableOrbit(false)
    this.workshop.select(partId)
  }

  private beginCrankDrag(partId: PartId, point: THREE.Vector3): void {
    const crank = this.workshop.assembly.parts.get(partId)
    if (!crank) return

    // Pegar o punho é assumir o controle manual: o modo automático desliga.
    this.workshop.setPlaying(false)

    const center = crank.position
    const pointerAngle = Math.atan2(-(point.z - center.z), point.x - center.x)
    this.gesture = {
      type: 'crank',
      center: { ...center },
      planeY: point.y,
      lastPointerAngle: pointerAngle,
      driverAngleAtGrab: this.workshop.assembly.driverAngle,
      accumulated: 0,
    }
    this.enableOrbit(false)
  }

  private enableOrbit(enabled: boolean): void {
    this.workshop.scene.controls.enabled = enabled
  }

  private updatePointer(event: PointerEvent): void {
    const canvas = this.workshop.scene.renderer.domElement
    const rect = canvas.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.workshop.scene.camera)
  }

  private raycast(event: PointerEvent) {
    this.updatePointer(event)
    return this.workshop.views.pick(this.raycaster)
  }

  /** Onde o ponteiro cruza o plano horizontal na altura dada. */
  private pointOnPlane(event: PointerEvent, y: number): THREE.Vector3 | null {
    this.updatePointer(event)
    this.plane.set(new THREE.Vector3(0, 1, 0), -y)
    return this.raycaster.ray.intersectPlane(this.plane, this.hitPoint)
  }
}
