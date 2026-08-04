import { useEffect, useState } from 'react'
import { t } from '../i18n/pt'
import type { LessonState } from '../modes/LessonMode'

/** Painel do desafio: enunciado, dica sob demanda e o selo de "conseguiu". */
export function LessonPanel({
  state,
  hasNext,
  onRestart,
  onNext,
  onExit,
}: {
  state: LessonState
  hasNext: boolean
  onRestart: () => void
  onNext: () => void
  onExit: () => void
}) {
  const [dicaVisivel, setDicaVisivel] = useState(false)

  // Cada lição começa sem dica na tela.
  useEffect(() => setDicaVisivel(false), [state.lesson.id])

  return (
    <div className="painel-licao">
      <span className="rotulo-secao">{t.licao.objetivo}</span>
      <h2>{state.lesson.titulo}</h2>
      <p>{state.lesson.explicacao}</p>

      {dicaVisivel && <div className="dica">💡 {state.lesson.dica}</div>}

      {state.completed && (
        <div className="selo-ok">
          {state.alreadyDone ? t.licao.jaFeita : t.licao.conseguiu}
        </div>
      )}

      <div className="acoes">
        {!state.completed && !dicaVisivel && (
          <button className="botao" onClick={() => setDicaVisivel(true)}>
            <span className="icone">💡</span>
            <span>{t.licao.verDica}</span>
          </button>
        )}
        {state.completed && hasNext && (
          <button className="botao destaque" onClick={onNext}>
            <span>{t.licao.proxima}</span>
            <span className="icone">➡️</span>
          </button>
        )}
        <button className="botao" onClick={onRestart}>
          <span className="icone">🔄</span>
          <span>{t.licao.recomecar}</span>
        </button>
        <button className="botao" onClick={onExit}>
          <span>{t.licao.sair}</span>
        </button>
      </div>
    </div>
  )
}
