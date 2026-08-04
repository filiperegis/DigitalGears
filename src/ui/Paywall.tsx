import { useState } from 'react'
import { t } from '../i18n/pt'
import { entitlement } from '../services/EntitlementService'

/**
 * Tela de compra única. Depois de desbloquear, nada mais fica bloqueado.
 *
 * O texto diz claramente que, nesta versão, a compra é simulada — a criança e o
 * pai merecem saber o que estão apertando.
 */
export function Paywall({ onUnlocked }: { onUnlocked: () => void }) {
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function comprar() {
    setBusy(true)
    setErro(null)
    const ok = await entitlement.purchase()
    setBusy(false)
    if (ok) onUnlocked()
  }

  async function restaurar() {
    setBusy(true)
    setErro(null)
    const ok = await entitlement.restore()
    setBusy(false)
    if (ok) onUnlocked()
    else setErro(t.paywall.semCompra)
  }

  return (
    <div className="tela">
      <div className="cartao">
        <h1>{t.paywall.titulo}</h1>
        <p className="sub">{t.paywall.subtitulo}</p>

        <ul>
          {t.paywall.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <button className="botao destaque" onClick={comprar} disabled={busy}>
          <span className="icone">🔓</span>
          <span>{busy ? t.paywall.comprando : t.paywall.comprar}</span>
        </button>

        <div className="rodape">
          <span className="meta">{t.paywall.compraUnica}</span>
          <button className="link" onClick={restaurar} disabled={busy}>
            {t.paywall.restaurar}
          </button>
        </div>

        {erro && <p className="aviso">{erro}</p>}
        <p className="aviso">{t.paywall.aviso}</p>
      </div>
    </div>
  )
}
