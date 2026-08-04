# DigitalGears

App educativo e interativo de engrenagens em 3D. Monte máquinas, coloque a
manivela e veja tudo girar.

> Ideia e design das peças e dos modos: **o jovem engenheiro de 9 anos.**

## Como rodar

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm test           # testes do núcleo cinemático
npm run build      # build de produção
npm run preview    # serve o build (use para testar no tablet pela rede)
npm run deploy     # publica no GitHub Pages
```

## Como o movimento é calculado

Não há engine de física, e **os dentes são cosméticos**. A rotação vem de
propagação de razão a partir da manivela.

Cada eixo de rotação independente é um `Body`. O solver ([KinematicSolver.ts](src/model/KinematicSolver.ts))
faz uma busca em largura a partir da manivela e guarda em cada corpo:

```
angle = phase + ratio × driverAngle
omega = ratio × driverOmega
```

`ratio` é o produto dos fatores de transmissão no caminho até a manivela:

| Conexão | Sentido | Fator `f` |
|---|---|---|
| Engrenamento | **inverte** | `−(N_origem / N_destino)` |
| Compound (mesmo eixo) | igual | `+1` |
| Correia | igual | `+(r_origem / r_destino)` |
| Cônica (90°) | muda de eixo | `±(N_origem / N_destino)` |

**Por que não integrar `angle += ω·dt` por corpo:** integrar acumula erro de
ponto flutuante diferente em cada engrenagem, e depois de alguns minutos os
dentes se atravessam na tela. Com a fórmula acima o ângulo é função exata de um
único número (`driverAngle`), então o encaixe é perpétuo. Há um teste de 10 000
passos que trava esse comportamento.

**Encaixe dos dentes.** Duas engrenagens encaixam quando a distância entre
centros é `r_p(A) + r_p(B)`, e quando a fase satisfaz, na linha dos centros:

```
N_A·(φ_A − θ) + N_B·(φ_B − θ − π) ≡ π   (mod 2π)
```

`phaseMeshes` ([assembly.ts](src/model/assembly.ts)) percorre o grafo a partir
da manivela e resolve essa condição em cada junção. Como as razões são exatas,
basta acertar a fase quando a montagem muda.

**Travamento.** Se o solver alcança um corpo por dois caminhos com velocidades
inconsistentes — um laço com número ímpar de engrenamentos, por exemplo —, a
máquina está fisicamente impossível: zera o componente inteiro e avisa. É a
lição 7.

## Estrutura

```
src/
  model/        LÓGICA PURA, sem Three.js — é o que os testes cobrem
    types.ts            Body, Connection, PlacedPart, Assembly
    meshing.ts          raios, distância de encaixe, fase, tangentes de correia
    KinematicSolver.ts  propagação de razão + detecção de travamento
    assembly.ts         peças, encaixe (snapping), conexões, fase
  scene/        SceneManager (câmera, luz, loop), Grid, PartViews
  parts/        geometria procedural das engrenagens, correias, catálogo
  input/        PointerController (toque e mouse, raycast, arrasto)
  ui/           React: HUD, paleta, painel de lição, paywall, diálogos
  modes/        FreeMode (salvar/abrir) e LessonMode
  lessons/      as 7 lições declarativas + regras de sucesso
  services/     localStorage, compra, som
```

A fronteira que sustenta o resto: **`model/` não importa Three.js.** É por isso
que o solver — a parte onde um bug não aparece a olho nu — roda em teste sem
navegador.

## Estado das fases do brief

| Fase | Situação |
|---|---|
| 1 — Núcleo | pronta |
| 2 — Peças completas | pronta (compound, cônica, polias (com engrenagem no eixo), correia, travamento) |
| 3 — Modo Lição | pronta (7 lições, progresso salvo, lição do dia por data) |
| 4 — Compra + polimento | pronta com **compra simulada** |
| 5 — Pagamento real | **não feita** (opcional no brief) |

## Sobre o pagamento

`MockEntitlement` ([EntitlementService.ts](src/services/EntitlementService.ts))
guarda a liberação numa flag do localStorage. Isso **não cobra ninguém** e
qualquer pessoa consegue ligar a flag pelo console do navegador. Serve para
desenvolver e testar o fluxo de tela inteiro.

Para cobrar de verdade, a verificação precisa acontecer no servidor: Stripe,
Mercado Pago ou PagSeguro na web, ou compra dentro do app se empacotar para as
lojas. A fronteira de integração está marcada em comentário no arquivo, e o
resto do app só depende da interface `EntitlementService`.

## Pendências conhecidas

- **Ícones PWA:** só existe `public/icon.svg`. Antes de publicar numa loja,
  gerar PNG 192 e 512 (maskable).
- **Fase em laços fechados:** um laço com razão consistente pode ficar meio
  dente fora naquela última junção. Não afeta o movimento, só a aparência.
- **Retrato:** funciona, mas a mesa fica pequena porque o campo horizontal é
  estreito. Paisagem é o formato preferido.
- **Teste em tablet real:** a briga entre gesto de câmera e arrasto de peça foi
  resolvida desligando o orbit enquanto uma peça está agarrada, e verificada com
  mouse. Vale confirmar no dedo, num tablet de verdade.
