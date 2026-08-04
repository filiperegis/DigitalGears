import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../i18n/pt'
import { PointerController } from '../input/PointerController'
import { FreeMode } from '../modes/FreeMode'
import { LessonMode, type LessonState } from '../modes/LessonMode'
import type { PaletteItem } from '../parts/partCatalog'
import { audio } from '../services/audio'
import { entitlement } from '../services/EntitlementService'
import { Storage } from '../services/Storage'
import { Workshop, type SavedBuild, type Tool, type WorkshopState } from '../Workshop'
import { BuildsDialog } from './BuildsDialog'
import { HUD } from './HUD'
import { LessonPanel } from './LessonPanel'
import { MenuScreen } from './MenuScreen'
import { Palette } from './Palette'
import { Paywall } from './Paywall'
import { Toast } from './Toast'

type Screen = 'menu' | 'play'
type Mode = 'free' | 'lesson'

const FREE_TOOLS: Tool[] = ['crank', 'belt', 'delete']

export function App() {
  const container = useRef<HTMLDivElement>(null)
  const workshopRef = useRef<Workshop | null>(null)
  const lessonModeRef = useRef<LessonMode | null>(null)
  const freeModeRef = useRef<FreeMode | null>(null)

  const [unlocked, setUnlocked] = useState(() => entitlement.isUnlocked())
  const [ready, setReady] = useState(false)
  const [state, setState] = useState<WorkshopState | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [mode, setMode] = useState<Mode>('free')
  const [lessonState, setLessonState] = useState<LessonState | null>(null)
  const [dialog, setDialog] = useState<'save' | 'open' | null>(null)
  const [builds, setBuilds] = useState<SavedBuild[]>([])
  const [soundOn, setSoundOn] = useState(() => Storage.settings().soundOn)

  // O palco 3D só nasce depois do desbloqueio: nada de criar contexto WebGL
  // atrás de uma tela que cobre tudo.
  useEffect(() => {
    if (!unlocked || !container.current || workshopRef.current) return

    const workshop = new Workshop(container.current)
    const lessons = new LessonMode(workshop)
    const free = new FreeMode(workshop)

    workshop.onAssemblyChanged = () => lessons.check()
    lessons.onStateChange = setLessonState

    workshopRef.current = workshop
    lessonModeRef.current = lessons
    freeModeRef.current = free

    const unsubscribe = workshop.subscribe(setState)
    const pointer = new PointerController(workshop)
    setState(workshop.getState())
    setReady(true)

    // Alça de depuração: só existe em dev, e serve para inspecionar a montagem
    // e dirigir o app de fora nos testes de navegador.
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__dg = { workshop, lessons, free }
    }

    return () => {
      unsubscribe()
      pointer.dispose()
      workshop.dispose()
      workshopRef.current = null
      lessonModeRef.current = null
      freeModeRef.current = null
      setReady(false)
    }
  }, [unlocked])

  // Ronronar acompanha a máquina: liga quando gira, cala quando para ou trava.
  useEffect(() => {
    if (!state) return
    audio.setPurr(state.playing && !state.jammed ? state.speed : 0)
  }, [state?.playing, state?.speed, state?.jammed, state])

  useEffect(() => () => audio.stopPurr(), [])

  const openLesson = useCallback((id: string) => {
    lessonModeRef.current?.load(id)
    setMode('lesson')
    setScreen('play')
  }, [])

  const openFreeMode = useCallback(() => {
    lessonModeRef.current?.exit()
    workshopRef.current?.clear()
    setLessonState(null)
    setMode('free')
    setScreen('play')
  }, [])

  const pickPart = useCallback((item: PaletteItem) => {
    const created = workshopRef.current?.spawn(item.spec)
    if (created) audio.click(700)
  }, [])

  const tools = useMemo<Tool[]>(() => {
    if (mode === 'free') return FREE_TOOLS
    return lessonState?.lesson.ferramentas ?? []
  }, [mode, lessonState?.lesson.ferramentas])

  const allowedParts = useMemo<string[] | null>(() => {
    if (mode === 'free') return null
    return lessonState?.lesson.pecasDisponiveis ?? []
  }, [mode, lessonState?.lesson.pecasDisponiveis])

  function toggleSound() {
    const next = !soundOn
    setSoundOn(next)
    audio.setEnabled(next)
    Storage.saveSettings({ ...Storage.settings(), soundOn: next })
    if (next) audio.click()
  }

  if (!unlocked) {
    return <Paywall onUnlocked={() => setUnlocked(true)} />
  }

  const workshop = workshopRef.current

  return (
    <>
      <div className="palco" ref={container} />

      {ready && state && screen === 'play' && (
        <div className="ui">
          <HUD
            state={state}
            tools={tools}
            soundOn={soundOn}
            actions={{
              onTogglePlay: () => workshop?.setPlaying(!state.playing),
              onSpeed: (value) => workshop?.setSpeed(value),
              onTool: (tool) => workshop?.setTool(tool),
              onMenu: () => setScreen('menu'),
              onFrame: () => workshop?.scene.frameTable(),
              onToggleSound: toggleSound,
              ...(mode === 'free'
                ? {
                    onClear: () => workshop?.clear(),
                    onSave: () => {
                      setBuilds(freeModeRef.current?.list() ?? [])
                      setDialog('save')
                    },
                    onOpen: () => {
                      setBuilds(freeModeRef.current?.list() ?? [])
                      setDialog('open')
                    },
                  }
                : {}),
            }}
          />

          {mode === 'lesson' && lessonState && (
            <LessonPanel
              state={lessonState}
              hasNext={lessonModeRef.current?.next() !== null}
              onRestart={() => lessonModeRef.current?.restart()}
              onNext={() => {
                const next = lessonModeRef.current?.next()
                if (next) openLesson(next.id)
              }}
              onExit={() => setScreen('menu')}
            />
          )}

          <div className="barra-baixo">
            <Palette allowed={allowedParts} onPick={pickPart} />
          </div>
        </div>
      )}

      {state?.jammed && (
        <div className="aviso-travou">
          A máquina travou! 🛑
          <small>Um círculo de engrenagens não consegue girar. Tire uma peça.</small>
        </div>
      )}

      {state && <Toast message={state.message} messageKey={state.messageKey} />}

      {screen === 'menu' && (
        <MenuScreen
          onLesson={openLesson}
          onFreeMode={openFreeMode}
          onClose={() => setScreen('play')}
          canClose={ready && (mode === 'free' ? true : lessonState !== null)}
        />
      )}

      {dialog && (
        <BuildsDialog
          mode={dialog}
          builds={builds}
          suggestedName={freeModeRef.current?.suggestName() ?? 'Máquina 1'}
          onSave={(name) => {
            freeModeRef.current?.save(name)
            setDialog(null)
          }}
          onOpen={(name) => {
            freeModeRef.current?.open(name)
            setDialog(null)
          }}
          onDelete={(name) => {
            freeModeRef.current?.remove(name)
            setBuilds(freeModeRef.current?.list() ?? [])
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {ready && screen === 'play' && !state?.hasCrank && mode === 'free' && (
        <div className="toast" style={{ bottom: '30%' }}>
          {t.dicas.arraste}
        </div>
      )}
    </>
  )
}
