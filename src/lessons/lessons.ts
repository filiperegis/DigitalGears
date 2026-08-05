import { pitchRadius } from '../model/meshing'
import type { PartSpec } from '../parts/partCatalog'
import type { Tool } from '../Workshop'

/** Uma peça já posta na mesa quando a lição abre. */
export interface LessonPart {
  /** Nome estável usado pela regra de sucesso (os ids reais são gerados). */
  tag: string
  spec: PartSpec
  x: number
  z: number
  level?: number
  /** Cenário do desafio: não dá para mover nem apagar. */
  locked?: boolean
  /** Ganha a bandeirinha: é a peça que a lição manda fazer girar. */
  alvo?: boolean
}

export interface LessonBelt {
  a: string
  b: string
}

export type Objetivo =
  | { tipo: 'gira'; alvo: string }
  | { tipo: 'sentido'; alvo: string; sentido: 'mesmo' | 'contrario' }
  | { tipo: 'razaoQualquer'; referencia: string; fator: number; tolerancia: number }
  | { tipo: 'velocidadeQualquer'; fator: number }
  | { tipo: 'eixoPerpendicular' }
  | { tipo: 'correia'; a: string; b: string }
  | { tipo: 'destravou'; alvo: string }

export interface Lesson {
  id: string
  titulo: string
  explicacao: string
  dica: string
  montagemInicial: LessonPart[]
  correias?: LessonBelt[]
  /** Tag da peça que recebe a manivela. */
  manivelaEm?: string
  /** Ids de itens da paleta liberados nesta lição. */
  pecasDisponiveis: string[]
  /** Ferramentas liberadas além de mover. */
  ferramentas?: Tool[]
  objetivo: Objetivo
}

const SMALL_PULLEY = pitchRadius(8)
const BIG_PULLEY = pitchRadius(20)

/**
 * A trilha. A ordem é o currículo: cada lição usa o que a anterior ensinou.
 *
 * As distâncias não são chutadas — cada montagem inicial deixa um vão que
 * fecha exatamente com as peças liberadas na lição. Por exemplo, o vão de
 * 10,8 das duas primeiras fecha com uma engrenagem de 24 dentes (2×5,4) ou
 * com duas de 12 (3×3,6), e é justamente essa escolha que ensina o sentido.
 */
export const LESSONS: Lesson[] = [
  {
    id: 'encaixe',
    titulo: 'Encaixe',
    explicacao:
      'Duas engrenagens só empurram uma à outra quando os dentes se tocam. Complete o caminho entre a manivela e a bandeira.',
    dica: 'Falta uma engrenagem no meio. Experimente a maior que você tem.',
    montagemInicial: [
      { tag: 'motor', spec: { kind: 'spur', teeth: 12 }, x: -5.4, z: 0, locked: true },
      { tag: 'bandeira', spec: { kind: 'spur', teeth: 12 }, x: 5.4, z: 0, locked: true, alvo: true },
    ],
    manivelaEm: 'motor',
    pecasDisponiveis: ['spur-24', 'spur-12'],
    objetivo: { tipo: 'gira', alvo: 'bandeira' },
  },
  {
    id: 'sentido',
    titulo: 'Para que lado?',
    explicacao:
      'Cada par de dentes que se toca INVERTE o sentido. Faça a bandeira girar para o lado contrário ao da manivela.',
    dica: 'Uma engrenagem no meio dá o mesmo sentido. E se você usar duas?',
    montagemInicial: [
      { tag: 'motor', spec: { kind: 'spur', teeth: 12 }, x: -5.4, z: 0, locked: true },
      { tag: 'bandeira', spec: { kind: 'spur', teeth: 12 }, x: 5.4, z: 0, locked: true, alvo: true },
    ],
    manivelaEm: 'motor',
    pecasDisponiveis: ['spur-24', 'spur-12'],
    objetivo: { tipo: 'sentido', alvo: 'bandeira', sentido: 'contrario' },
  },
  {
    id: 'rapido',
    titulo: 'Mais rápido',
    explicacao:
      'Quem tem menos dentes gira mais rápido. Encaixe uma engrenagem que gire o DOBRO da velocidade desta aqui.',
    dica: 'Esta tem 24 dentes. Metade de 24 é 12.',
    montagemInicial: [
      { tag: 'grande', spec: { kind: 'spur', teeth: 24 }, x: 0, z: 0, locked: true },
    ],
    manivelaEm: 'grande',
    pecasDisponiveis: ['spur-8', 'spur-12', 'spur-16', 'spur-24'],
    objetivo: { tipo: 'razaoQualquer', referencia: 'grande', fator: 2, tolerancia: 0.02 },
  },
  {
    id: 'compound',
    titulo: 'Eixo duplo',
    explicacao:
      'Duas engrenagens no mesmo eixo giram juntas. Entrando pela pequena e saindo pela grande, a aceleração se MULTIPLICA. Consiga 8 vezes a velocidade da manivela.',
    dica: 'Encaixe a peça de eixo duplo na manivela e depois encaixe uma engrenagem pequena na roda de cima dela.',
    montagemInicial: [
      { tag: 'motor', spec: { kind: 'spur', teeth: 32 }, x: -4, z: 0, locked: true },
    ],
    manivelaEm: 'motor',
    pecasDisponiveis: ['compound-8-24', 'spur-8', 'spur-12'],
    objetivo: { tipo: 'velocidadeQualquer', fator: 8 },
  },
  // Lição 'conica' (Virar a esquina) removida por enquanto — dependia
  // inteiramente da peça cônica, hoje escondida da interface (ver partCatalog.ts).
  {
    id: 'correia',
    titulo: 'Lá longe',
    explicacao:
      'Quando as rodas estão longe demais para os dentes se tocarem, uma correia leva o movimento. E ela mantém o MESMO sentido.',
    dica: 'Escolha a ferramenta de correia, toque numa polia e depois na outra.',
    montagemInicial: [
      { tag: 'motor', spec: { kind: 'pulley', radius: SMALL_PULLEY }, x: -7, z: 0, locked: true },
      {
        tag: 'bandeira',
        spec: { kind: 'pulley', radius: BIG_PULLEY },
        x: 7,
        z: 0,
        locked: true,
        alvo: true,
      },
    ],
    manivelaEm: 'motor',
    pecasDisponiveis: [],
    ferramentas: ['belt'],
    objetivo: { tipo: 'correia', a: 'motor', b: 'bandeira' },
  },
  {
    id: 'travou',
    titulo: 'Travou!',
    explicacao:
      'Três engrenagens num círculo fechado não conseguem girar: cada uma manda a vizinha para um lado diferente. Descubra o que tirar para a máquina voltar a andar.',
    dica: 'Um círculo com três engrenagens trava. Com duas, não. Apague uma delas.',
    montagemInicial: [
      { tag: 'motor', spec: { kind: 'spur', teeth: 12 }, x: 0, z: -2.078, locked: true },
      { tag: 'bandeira', spec: { kind: 'spur', teeth: 12 }, x: -1.8, z: 1.039, alvo: true },
      { tag: 'terceira', spec: { kind: 'spur', teeth: 12 }, x: 1.8, z: 1.039 },
    ],
    manivelaEm: 'motor',
    pecasDisponiveis: ['spur-12'],
    ferramentas: ['delete'],
    objetivo: { tipo: 'destravou', alvo: 'bandeira' },
  },
]

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id)
}

/**
 * Lição do dia: determinística pela data local, para pai e filho abrirem a
 * mesma lição sem depender de servidor nenhum.
 */
export function lessonOfTheDay(date = new Date()): Lesson {
  const days = Math.floor(
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000,
  )
  return LESSONS[((days % LESSONS.length) + LESSONS.length) % LESSONS.length]
}

/**
 * Uma lição está liberada se já foi concluída, ou se é a próxima da trilha.
 * Ninguém fica preso: a lição do dia sempre abre.
 */
export function unlockedLessons(completed: string[], today = lessonOfTheDay()): Set<string> {
  const done = new Set(completed)
  const unlocked = new Set<string>(done)
  unlocked.add(today.id)
  for (const lesson of LESSONS) {
    unlocked.add(lesson.id)
    if (!done.has(lesson.id)) break
  }
  return unlocked
}
