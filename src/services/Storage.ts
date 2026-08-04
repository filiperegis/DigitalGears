import { SAVE_FORMAT_VERSION, STORAGE_KEYS } from '../config'
import type { SavedBuild } from '../Workshop'

/**
 * Wrapper de localStorage tolerante a falha: modo anônimo, cota cheia ou JSON
 * corrompido nunca podem derrubar o app — no pior caso a criança perde o save,
 * não a sessão.
 */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export interface Settings {
  soundOn: boolean
}

const DEFAULT_SETTINGS: Settings = { soundOn: true }

export const Storage = {
  // -- compra -----------------------------------------------------------------
  isUnlocked(): boolean {
    return read<boolean>(STORAGE_KEYS.unlocked, false) === true
  },
  setUnlocked(value: boolean): void {
    write(STORAGE_KEYS.unlocked, value)
  },

  // -- montagens salvas --------------------------------------------------------
  listBuilds(): SavedBuild[] {
    const builds = read<SavedBuild[]>(STORAGE_KEYS.builds, [])
    if (!Array.isArray(builds)) return []
    // Saves de um formato mais novo que este app são ignorados em vez de
    // quebrarem o carregamento.
    return builds.filter((b) => b && typeof b === 'object' && b.v <= SAVE_FORMAT_VERSION)
  },
  saveBuild(build: SavedBuild): boolean {
    const builds = Storage.listBuilds().filter((b) => b.name !== build.name)
    builds.unshift(build)
    return write(STORAGE_KEYS.builds, builds.slice(0, 20))
  },
  deleteBuild(name: string): void {
    write(
      STORAGE_KEYS.builds,
      Storage.listBuilds().filter((b) => b.name !== name),
    )
  },

  // -- progresso das lições ----------------------------------------------------
  completedLessons(): string[] {
    const ids = read<string[]>(STORAGE_KEYS.lessonProgress, [])
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []
  },
  markLessonComplete(id: string): void {
    const done = new Set(Storage.completedLessons())
    done.add(id)
    write(STORAGE_KEYS.lessonProgress, [...done])
  },
  resetLessonProgress(): void {
    write(STORAGE_KEYS.lessonProgress, [])
  },

  // -- preferências ------------------------------------------------------------
  settings(): Settings {
    return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(STORAGE_KEYS.settings, {}) }
  },
  saveSettings(settings: Settings): void {
    write(STORAGE_KEYS.settings, settings)
  },
}
