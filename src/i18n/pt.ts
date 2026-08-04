import { APP_NAME } from '../config'

/** Todo texto visível do app, num lugar só. */
export const t = {
  appName: APP_NAME,
  tagline: 'Oficina de engrenagens',

  paywall: {
    titulo: `Bem-vindo à ${APP_NAME}!`,
    subtitulo: 'Monte máquinas de engrenagens em 3D e veja elas funcionarem.',
    bullets: [
      'Engrenagens, eixos duplos, cônicas, polias e correias',
      'Uma lição nova por dia, com desafios de verdade',
      'Modo livre: mesa vazia, invente o que quiser',
    ],
    comprar: 'Desbloquear tudo',
    comprando: 'Desbloqueando…',
    restaurar: 'Já comprei',
    compraUnica: 'Compra única. Sem assinatura.',
    aviso:
      'Nesta versão de desenvolvimento a compra é simulada: nada é cobrado e o desbloqueio fica só neste aparelho.',
    semCompra: 'Não achamos uma compra neste aparelho.',
  },

  menu: {
    licaoDoDia: 'Lição do dia',
    licoes: 'Lições',
    modoLivre: 'Modo livre',
    voltar: 'Voltar',
    concluida: 'Concluída',
    bloqueada: 'Termine a anterior',
    hoje: 'Hoje',
  },

  hud: {
    brincar: 'Brincar',
    pausar: 'Pausar',
    velocidade: 'Velocidade',
    mover: 'Mover',
    manivela: 'Manivela',
    correia: 'Correia',
    apagar: 'Apagar',
    limpar: 'Limpar mesa',
    salvar: 'Salvar',
    abrir: 'Abrir',
    som: 'Som',
    menu: 'Menu',
    pecas: 'Peças',
    enquadrar: 'Centralizar',
  },

  licao: {
    objetivo: 'Desafio',
    dica: 'Dica',
    verDica: 'Ver dica',
    recomecar: 'Recomeçar',
    proxima: 'Próxima lição',
    conseguiu: 'Você conseguiu! 🎉',
    jaFeita: 'Você já tinha resolvido esta. Boa!',
    sair: 'Sair da lição',
  },

  livre: {
    minhasMaquinas: 'Minhas máquinas',
    nenhuma: 'Nenhuma máquina salva ainda.',
    nome: 'Nome da máquina',
    salvar: 'Salvar',
    abrir: 'Abrir',
    apagar: 'Apagar',
    cancelar: 'Cancelar',
  },

  dicas: {
    arraste: 'Arraste as peças para encaixar. Um dedo no vazio gira a mesa.',
    manivela: 'Gire o punho amarelo com o dedo — ou aperte Brincar.',
  },
} as const
