import { t } from '../i18n/pt'
import { LESSONS, lessonOfTheDay, unlockedLessons } from '../lessons/lessons'
import { Storage } from '../services/Storage'

/** Menu principal: lição do dia em destaque, trilha completa e modo livre. */
export function MenuScreen({
  onLesson,
  onFreeMode,
  onClose,
  canClose,
}: {
  onLesson: (id: string) => void
  onFreeMode: () => void
  onClose: () => void
  canClose: boolean
}) {
  const completed = Storage.completedLessons()
  const today = lessonOfTheDay()
  const unlocked = unlockedLessons(completed, today)

  return (
    <div className="tela">
      <div className="cartao">
        <h1>
          {t.appName} <span aria-hidden>⚙️</span>
        </h1>
        <p className="sub">{t.tagline}</p>

        <button className="botao destaque" onClick={() => onLesson(today.id)}>
          <span className="icone">📅</span>
          <span>
            {t.menu.licaoDoDia}: {today.titulo}
          </span>
        </button>

        <div className="lista">
          {LESSONS.map((lesson, index) => {
            const done = completed.includes(lesson.id)
            const open = unlocked.has(lesson.id)
            return (
              <button
                key={lesson.id}
                className={`item-lista ${open ? '' : 'bloqueado'}`}
                onClick={() => open && onLesson(lesson.id)}
                disabled={!open}
              >
                <span>
                  <span className="titulo">
                    {index + 1}. {lesson.titulo}
                  </span>
                  <br />
                  <span className="meta">
                    {done ? t.menu.concluida : open ? lesson.explicacao.slice(0, 52) + '…' : t.menu.bloqueada}
                  </span>
                </span>
                {lesson.id === today.id && <span className="emblema hoje">{t.menu.hoje}</span>}
                {done && <span className="emblema">✓</span>}
              </button>
            )
          })}
        </div>

        <button className="botao" onClick={onFreeMode}>
          <span className="icone">🧰</span>
          <span>{t.menu.modoLivre}</span>
        </button>

        {canClose && (
          <div className="rodape">
            <button className="link" onClick={onClose}>
              {t.menu.voltar}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
