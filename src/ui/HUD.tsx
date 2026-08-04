import { MAX_SPEED, MIN_SPEED } from '../config'
import { t } from '../i18n/pt'
import type { Tool, WorkshopState } from '../Workshop'

export interface HudActions {
  onTogglePlay: () => void
  onSpeed: (value: number) => void
  onTool: (tool: Tool) => void
  onMenu: () => void
  onClear?: () => void
  onSave?: () => void
  onOpen?: () => void
  onToggleSound: () => void
  onFrame: () => void
}

/**
 * Barra de topo: modo de ferramenta à esquerda, controles de movimento à direita.
 * Alvos grandes (54px) e ícone sempre visível, mesmo quando o texto some no
 * celular.
 */
export function HUD({
  state,
  tools,
  soundOn,
  actions,
}: {
  state: WorkshopState
  /** Ferramentas liberadas além de mover. */
  tools: Tool[]
  soundOn: boolean
  actions: HudActions
}) {
  const canPlay = state.hasCrank && !state.jammed

  return (
    <div className="barra-topo">
      <div className="grupo">
        <button className="botao compacto" onClick={actions.onMenu} title={t.hud.menu}>
          <span className="icone">☰</span>
        </button>

        <ToolButton
          tool="move"
          current={state.tool}
          onTool={actions.onTool}
          icon="✋"
          label={t.hud.mover}
        />
        {tools.includes('crank') && (
          <ToolButton
            tool="crank"
            current={state.tool}
            onTool={actions.onTool}
            icon="🎡"
            label={t.hud.manivela}
          />
        )}
        {tools.includes('belt') && (
          <ToolButton
            tool="belt"
            current={state.tool}
            onTool={actions.onTool}
            icon="🔗"
            label={t.hud.correia}
          />
        )}
        {tools.includes('delete') && (
          <ToolButton
            tool="delete"
            current={state.tool}
            onTool={actions.onTool}
            icon="🗑️"
            label={t.hud.apagar}
            danger
          />
        )}
      </div>

      <div className="grupo">
        <button
          className={`botao ${state.playing ? '' : 'destaque'}`}
          onClick={actions.onTogglePlay}
          disabled={!canPlay}
          title={state.playing ? t.hud.pausar : t.hud.brincar}
        >
          <span className="icone">{state.playing ? '⏸' : '▶️'}</span>
          <span className="texto">{state.playing ? t.hud.pausar : t.hud.brincar}</span>
        </button>

        <label className="velocidade">
          <span aria-hidden>🐢</span>
          <input
            type="range"
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={0.1}
            value={state.speed}
            onChange={(event) => actions.onSpeed(Number(event.target.value))}
            aria-label={t.hud.velocidade}
          />
          <span aria-hidden>🐇</span>
        </label>

        <button className="botao compacto" onClick={actions.onFrame} title={t.hud.enquadrar}>
          <span className="icone">🎯</span>
        </button>

        {actions.onSave && (
          <button className="botao compacto" onClick={actions.onSave} title={t.hud.salvar}>
            <span className="icone">💾</span>
          </button>
        )}
        {actions.onOpen && (
          <button className="botao compacto" onClick={actions.onOpen} title={t.hud.abrir}>
            <span className="icone">📂</span>
          </button>
        )}
        {actions.onClear && (
          <button
            className="botao compacto"
            onClick={actions.onClear}
            disabled={state.partCount === 0}
            title={t.hud.limpar}
          >
            <span className="icone">🧹</span>
          </button>
        )}

        <button
          className="botao compacto"
          onClick={actions.onToggleSound}
          title={t.hud.som}
          aria-pressed={soundOn}
        >
          <span className="icone">{soundOn ? '🔊' : '🔇'}</span>
        </button>
      </div>
    </div>
  )
}

function ToolButton({
  tool,
  current,
  onTool,
  icon,
  label,
  danger,
}: {
  tool: Tool
  current: Tool
  onTool: (tool: Tool) => void
  icon: string
  label: string
  danger?: boolean
}) {
  const active = current === tool
  return (
    <button
      className={`botao ${danger ? 'perigo' : ''} ${active ? 'ativo' : ''}`}
      onClick={() => onTool(active && tool !== 'move' ? 'move' : tool)}
      aria-pressed={active}
      title={label}
    >
      <span className="icone">{icon}</span>
      <span className="texto">{label}</span>
    </button>
  )
}
