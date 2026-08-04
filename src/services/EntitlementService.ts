import { Storage } from './Storage'

/**
 * Compra única: paga uma vez, desbloqueia tudo.
 */
export interface EntitlementService {
  isUnlocked(): boolean
  purchase(): Promise<boolean>
  restore(): Promise<boolean>
}

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  FRONTEIRA DE INTEGRAÇÃO DE PAGAMENTO — LEIA ANTES DE PUBLICAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O que está aqui embaixo é um MOCK. Ele:
 *   • NÃO cobra dinheiro de ninguém;
 *   • guarda a liberação numa flag do localStorage, que qualquer pessoa
 *     minimamente curiosa consegue ligar sozinha pelo console do navegador.
 *
 * Isso é proposital e suficiente para desenvolver e testar todo o fluxo de
 * tela. Para cobrar de verdade, a verificação PRECISA acontecer no servidor:
 *
 *   Web:   Stripe Checkout / Payment Link, ou Mercado Pago / PagSeguro no
 *          Brasil. O fluxo é: cliente inicia o pagamento → provedor confirma
 *          via webhook → uma função serverless grava a licença → este serviço
 *          consulta o servidor em isUnlocked()/restore() em vez do localStorage.
 *
 *   Loja:  se empacotar com Capacitor, usar a compra dentro do app da App Store
 *          ou da Play Store e validar o recibo no servidor.
 *
 * Trocar `MockEntitlement` por uma implementação de servidor é a única mudança
 * necessária no resto do app — todo mundo depende só da interface acima.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export class MockEntitlement implements EntitlementService {
  isUnlocked(): boolean {
    return Storage.isUnlocked()
  }

  async purchase(): Promise<boolean> {
    // Pequena espera só para a tela ter o mesmo ritmo de uma compra real.
    await new Promise((resolve) => setTimeout(resolve, 600))
    Storage.setUnlocked(true)
    return true
  }

  async restore(): Promise<boolean> {
    return Storage.isUnlocked()
  }
}

export const entitlement: EntitlementService = new MockEntitlement()
