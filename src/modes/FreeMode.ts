import { Storage } from '../services/Storage'
import type { SavedBuild, Workshop } from '../Workshop'

/**
 * Modo Livre: mesa aberta. A montagem em si vive no Workshop; aqui ficam só as
 * montagens salvas.
 */
export class FreeMode {
  constructor(private readonly workshop: Workshop) {}

  list(): SavedBuild[] {
    return Storage.listBuilds()
  }

  save(name: string): boolean {
    const trimmed = name.trim()
    if (!trimmed) return false
    const ok = Storage.saveBuild(this.workshop.serialize(trimmed))
    this.workshop.toast(ok ? `"${trimmed}" salva!` : 'Não deu para salvar.')
    return ok
  }

  open(name: string): boolean {
    const build = this.list().find((b) => b.name === name)
    if (!build) return false
    this.workshop.load(build)
    this.workshop.toast(`"${name}" carregada.`)
    return true
  }

  remove(name: string): void {
    Storage.deleteBuild(name)
  }

  /** Nome sugerido para a próxima montagem, sem colidir com as existentes. */
  suggestName(): string {
    const taken = new Set(this.list().map((b) => b.name))
    for (let i = 1; i < 100; i++) {
      const name = `Máquina ${i}`
      if (!taken.has(name)) return name
    }
    return `Máquina ${Date.now()}`
  }
}
