import { addBelt, attachCrank } from '../model/assembly'
import type { PartId } from '../model/types'
import { evaluate } from '../lessons/successRules'
import { LESSONS, lessonById, lessonOfTheDay, unlockedLessons, type Lesson } from '../lessons/lessons'
import { audio } from '../services/audio'
import { Storage } from '../services/Storage'
import type { Workshop } from '../Workshop'

export interface LessonState {
  lesson: Lesson
  completed: boolean
  /** Já estava concluída antes desta tentativa? Evita comemorar duas vezes. */
  alreadyDone: boolean
}

/**
 * Modo Lição: monta o cenário, restringe as peças e testa o objetivo a cada
 * mudança da montagem.
 */
export class LessonMode {
  private current: Lesson | null = null
  /** Nome declarado na lição → id real da peça criada. */
  private tags = new Map<string, PartId>()
  private solved = false

  onStateChange: ((state: LessonState | null) => void) | null = null

  constructor(private readonly workshop: Workshop) {}

  get lesson(): Lesson | null {
    return this.current
  }

  load(lessonId: string): void {
    const lesson = lessonById(lessonId)
    if (!lesson) return

    this.workshop.clear()
    this.tags = new Map()
    this.current = lesson
    this.solved = false

    for (const item of lesson.montagemInicial) {
      const part = this.workshop.createPart(item.spec, { x: item.x, z: item.z }, item.level ?? 0, {
        locked: item.locked,
        marker: item.alvo ? 'alvo' : undefined,
      })
      this.tags.set(item.tag, part.id)
    }

    for (const belt of lesson.correias ?? []) {
      const a = this.tags.get(belt.a)
      const b = this.tags.get(belt.b)
      if (a && b) addBelt(this.workshop.assembly, a, b)
    }

    if (lesson.manivelaEm) {
      const target = this.tags.get(lesson.manivelaEm)
      if (target) attachCrank(this.workshop.assembly, target)
    }

    this.workshop.setTool('move')
    this.workshop.resolve()
    this.emit()
  }

  /** Reavaliado a cada resolução da montagem. */
  check(): void {
    if (!this.current || this.solved) return

    const state = this.workshop.getState()
    const success = evaluate(this.workshop.assembly, this.current.objetivo, this.tags, state.jammed)
    if (!success) return

    this.solved = true
    const alreadyDone = Storage.completedLessons().includes(this.current.id)
    Storage.markLessonComplete(this.current.id)
    audio.success()
    this.workshop.toast('Você conseguiu! 🎉')
    this.emit(alreadyDone)
  }

  restart(): void {
    if (this.current) this.load(this.current.id)
  }

  /** Próxima lição da trilha, se houver. */
  next(): Lesson | null {
    if (!this.current) return null
    const index = LESSONS.findIndex((l) => l.id === this.current!.id)
    return index >= 0 && index + 1 < LESSONS.length ? LESSONS[index + 1] : null
  }

  exit(): void {
    this.current = null
    this.tags = new Map()
    this.solved = false
    this.emit()
  }

  private emit(alreadyDone = false): void {
    this.onStateChange?.(
      this.current ? { lesson: this.current, completed: this.solved, alreadyDone } : null,
    )
  }
}

export { LESSONS, lessonOfTheDay, unlockedLessons }
