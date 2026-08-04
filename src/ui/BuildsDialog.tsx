import { useState } from 'react'
import { t } from '../i18n/pt'
import type { SavedBuild } from '../Workshop'

/** Salvar e abrir montagens do Modo Livre. */
export function BuildsDialog({
  mode,
  builds,
  suggestedName,
  onSave,
  onOpen,
  onDelete,
  onClose,
}: {
  mode: 'save' | 'open'
  builds: SavedBuild[]
  suggestedName: string
  onSave: (name: string) => void
  onOpen: (name: string) => void
  onDelete: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(suggestedName)

  return (
    <div className="tela">
      <div className="cartao">
        <h1>{t.livre.minhasMaquinas}</h1>

        {mode === 'save' && (
          <>
            <input
              className="campo"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t.livre.nome}
              maxLength={40}
              aria-label={t.livre.nome}
            />
            <div className="acoes" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="botao destaque" onClick={() => onSave(name)} disabled={!name.trim()}>
                <span className="icone">💾</span>
                <span>{t.livre.salvar}</span>
              </button>
            </div>
          </>
        )}

        <div className="lista">
          {builds.length === 0 && <p className="sub">{t.livre.nenhuma}</p>}
          {builds.map((build) => (
            <div key={build.name} className="item-lista">
              <span>
                <span className="titulo">{build.name}</span>
                <br />
                <span className="meta">
                  {build.parts.length} peças · {new Date(build.savedAt).toLocaleDateString('pt-BR')}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button className="botao compacto" onClick={() => onOpen(build.name)}>
                  <span className="icone">📂</span>
                </button>
                <button className="botao compacto" onClick={() => onDelete(build.name)}>
                  <span className="icone">🗑️</span>
                </button>
              </span>
            </div>
          ))}
        </div>

        <div className="rodape">
          <button className="link" onClick={onClose}>
            {t.livre.cancelar}
          </button>
        </div>
      </div>
    </div>
  )
}
