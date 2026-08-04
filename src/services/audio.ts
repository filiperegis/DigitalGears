import { Storage } from './Storage'

/**
 * Sons sintetizados na hora com WebAudio — nenhum arquivo para baixar, e o app
 * continua instalável offline. Silencioso até o primeiro toque do usuário,
 * porque navegador nenhum deixa tocar áudio antes disso.
 */
class AudioService {
  private context: AudioContext | null = null
  private purr: { osc: OscillatorNode; gain: GainNode } | null = null
  private enabled = Storage.settings().soundOn

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) this.stopPurr()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null
    if (!this.context) {
      const Ctor = window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.context = new Ctor()
    }
    if (this.context.state === 'suspended') void this.context.resume()
    return this.context
  }

  /** Clique curto do encaixe. */
  click(frequency = 620): void {
    const ctx = this.ensureContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(frequency, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.6, ctx.currentTime + 0.09)
    gain.gain.setValueAtTime(0.14, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.13)
  }

  /** Acorde alegre de "conseguiu". */
  success(): void {
    const ctx = this.ensureContext()
    if (!ctx) return
    ;[523.25, 659.25, 783.99].forEach((frequency, i) => {
      window.setTimeout(() => this.click(frequency), i * 90)
    })
  }

  /** Aviso grave da máquina travada. */
  thud(): void {
    const ctx = this.ensureContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(150, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.25)
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.31)
  }

  /** Ronronar contínuo enquanto a máquina gira; o tom acompanha a velocidade. */
  setPurr(speed: number): void {
    const ctx = this.ensureContext()
    if (!ctx) return

    if (speed <= 0) {
      this.stopPurr()
      return
    }
    if (!this.purr) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.022, ctx.currentTime + 0.2)
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      this.purr = { osc, gain }
    }
    this.purr.osc.frequency.setTargetAtTime(52 + speed * 18, ctx.currentTime, 0.1)
  }

  stopPurr(): void {
    if (!this.purr || !this.context) return
    const { osc, gain } = this.purr
    gain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.08)
    osc.stop(this.context.currentTime + 0.4)
    this.purr = null
  }
}

export const audio = new AudioService()
