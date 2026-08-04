import { useEffect, useState } from 'react'

/** Mensagem curta e passageira. `messageKey` faz a mesma frase reaparecer. */
export function Toast({ message, messageKey }: { message: string | null; messageKey: number }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!message) return
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), 2600)
    return () => window.clearTimeout(timer)
  }, [message, messageKey])

  if (!visible || !message) return null
  return (
    <div className="toast" role="status">
      {message}
    </div>
  )
}
