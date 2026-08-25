# Guapu — especificação técnica de implementação
Design tokens, ícones e layout para deploy em Next.js / Vercel

---

## 1. Ícones e favicon

O Next.js (App Router) tem convenção própria de arquivos para ícones — não precisa de `<link>` manual no `<head>` na maioria dos casos.

### 1.1 Onde colocar os arquivos

Coloque estes arquivos **diretamente dentro de `app/`** (raiz do App Router). O Next.js os detecta automaticamente pelo nome:

```
app/
  favicon.ico        ← 16/32/48px, gerado (o .ico multi-tamanho do pacote)
  icon.png            ← 512x512, ícone principal (Android/PWA/geral)
  apple-icon.png      ← 180x180, ícone para iOS ("adicionar à tela de início")
```

Do pacote de ícones exportado, use:
- `favicon.ico` → `app/favicon.ico`
- `guapu-icon-512.png` → renomeie para `app/icon.png`
- `guapu-icon-180.png` → renomeie para `app/apple-icon.png`

Isso é suficiente para o Next.js gerar as tags `<link rel="icon">` e `<link rel="apple-touch-icon">` automaticamente no build.

### 1.2 Se estiver usando Pages Router (ou preferir controle manual)

Coloque os arquivos em `public/icons/` e declare manualmente em `pages/_document.tsx` (ou `app/layout.tsx` via `metadata`):

```tsx
// app/layout.tsx
export const metadata = {
  icons: {
    icon: [
      { url: "/icons/guapu-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/guapu-icon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/icons/guapu-icon-180.png",
  },
  manifest: "/site.webmanifest",
};
```

### 1.3 PWA / manifest

Copie `guapu-icon-192.png`, `guapu-icon-512.png` e `site.webmanifest` para `public/`. Ajuste os caminhos dentro do `site.webmanifest` para `/guapu-icon-192.png` e `/guapu-icon-512.png` (sem a subpasta `/icons/`, já que ele está na raiz do `public/`) — ou mantenha tudo dentro de `public/icons/` e ajuste os caminhos do manifest de acordo, contanto que sejam consistentes.

### 1.4 Ícone dentro da interface (avatar do chat, cabeçalho)

Esses **não** são favicon — são elementos de UI comuns. Use o SVG (`guapu-icon.svg`) como componente React, não como `<img>`, para poder herdar `currentColor` se precisar de variações, e para não pesar requisições de rede extras:

```tsx
// components/icons/GuapuMark.tsx
export function GuapuMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Guapu">
      <circle cx="50" cy="50" r="50" fill="#10345C" />
      <g transform="translate(50,50) scale(1.2) rotate(-90) translate(-50,-50)">
        <ellipse cx="46" cy="52" rx="30" ry="22" fill="#E7C24A" />
        <path d="M74 44 L92 52 L74 60 Z" fill="#E7C24A" />
        <path d="M46 43 L55 52 L46 61 L37 52 Z" fill="#0F9B6C" />
      </g>
    </svg>
  );
}
```

Use `<GuapuMark size={38} />` no cabeçalho e `<GuapuMark size={28} />` no avatar das mensagens do assistente — mesmo componente, dois tamanhos, garante 100% de consistência visual em qualquer lugar que o símbolo apareça.

---

## 2. Cores (design tokens)

Declare como CSS custom properties globais **e** no `tailwind.config` (se o projeto usa Tailwind), para que fiquem disponíveis das duas formas.

### 2.1 CSS variables

```css
/* app/globals.css */
:root {
  --azul: #10345C;         /* institucional, texto de marca, ações primárias */
  --azul-tinta: #EEF3F8;   /* fundo suave para blocos ligados ao azul */
  --dourado: #E7C24A;      /* destaque, bojo da lâmpada */
  --dourado-tinta: #FBF1DE;/* fundo do bloco de transparência */
  --dourado-icone: #B9852B;/* glifo do ícone sobre --dourado-tinta (dourado puro falha contraste como stroke fino) */
  --verde: #0F9B6C;        /* verde-esmeralda oficial da Enfermagem (COFEN 218/1999) */
  --verde-tinta: #E4F4EE;
  --neutro-tinta: #F1EEE6; /* fundo do ícone da categoria "encerrar sessão" */
  --neutro-icone: #8A8270; /* glifo sobre --neutro-tinta */
  --fundo: #FAF7F0;        /* fundo geral da página, tom papel */
  --superficie: #FFFFFF;   /* cards */
  --texto: #1B2733;
  --texto-suave: #5C6B78;
  --texto-fraco: #8B98A3;
  --borda: #E7E1D3;
  --borda-hover: #D9D2BF;  /* borda dos action cards no :hover */
  --raio: 20px;
  --raio-sm: 12px;
}
```

### 2.2 Tailwind (se aplicável)

```js
// tailwind.config.js
theme: {
  extend: {
    colors: {
      azul: { DEFAULT: "#10345C", tinta: "#EEF3F8" },
      dourado: { DEFAULT: "#E7C24A", tinta: "#FBF1DE" },
      verde: { DEFAULT: "#0F9B6C", tinta: "#E4F4EE" },
      fundo: "#FAF7F0",
      borda: "#E7E1D3",
      texto: { DEFAULT: "#1B2733", suave: "#5C6B78", fraco: "#8B98A3" },
    },
    borderRadius: {
      xl2: "20px",
    },
  },
},
```

### 2.3 Regra de uso — não misturar

- **Azul**: wordmark, texto de título, botão de enviar, ícone da categoria "quiz".
- **Dourado**: bojo da lâmpada, destaque do bloco de transparência, ícone da categoria "informações". **Nunca usar dourado como cor de texto sobre fundo claro** — falha contraste (ver seção 4).
- **Verde-esmeralda**: chama da lâmpada, ícone da categoria "resumo de conteúdo", eyebrow/tag de contexto. É a única cor com significado regulado externamente (COFEN) — não reutilizar para estados de erro/alerta.
- Evite gradientes entre essas três cores — o conceito é de **contraste chapado**, não fusão.

### 2.4 Modo escuro — proposta (ainda não validada visualmente)

O botão de alternância de tema aparece em todos os mockups, mas nenhuma paleta escura foi desenhada até agora — os valores abaixo são uma **proposta de ponto de partida**, derivada dos mesmos tokens (mesmo matiz, luminosidade invertida), não uma decisão de design já aprovada. Antes de shippar, vale gerar um mockup escuro da tela e olhar, principalmente o contraste do dourado sobre fundo escuro.

```css
[data-theme="dark"] {
  --azul: #6E9CCB;          /* clareado para funcionar como texto sobre fundo escuro */
  --azul-tinta: #16283C;
  --dourado: #E7C24A;        /* mantém — já tem luminosidade alta, funciona nos dois modos */
  --dourado-tinta: #2E2712;
  --dourado-icone: #E7C24A;
  --verde: #3FCB99;          /* clareado, mesmo raciocínio do azul */
  --verde-tinta: #123329;
  --neutro-tinta: #26241E;
  --neutro-icone: #B5AC98;
  --fundo: #10161D;
  --superficie: #1A2129;
  --texto: #EDEFF1;
  --texto-suave: #A8B2BC;
  --texto-fraco: #6E7A85;
  --borda: #2A323B;
  --borda-hover: #3A4450;
}
```

O símbolo `<GuapuMark />` **não muda de cor no modo escuro** — o círculo azul + dourado + verde já tem contraste suficiente em qualquer fundo, escuro ou claro. Só o *entorno* (texto, superfícies, bordas) muda.

---

## 3. Tipografia

```tsx
// app/layout.tsx
import { Fraunces, Inter } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});
```

```css
--font-display: 'Fraunces', serif;  /* wordmark, h1, títulos de card */
--font-body: 'Inter', sans-serif;   /* todo o resto */
```

Usar `next/font/google` (não `<link>` no `<head>`) evita layout shift e faz o self-hosting automático dos arquivos de fonte no build da Vercel.

### 3.1 Escala tipográfica completa

Todos os valores abaixo foram extraídos diretamente dos mockups já aprovados — não são estimativas.

| Papel | Fonte | Tamanho | Peso | Line-height | Letter-spacing | Cor |
|---|---|---|---|---|---|---|
| Wordmark "Guapu" | Fraunces | 23px | 600 | 1.2 | 0.2px | `--azul` |
| H1 (título da disciplina) | Fraunces | 28px desktop / 23px mobile (< 620px) | 600 | 1.28 | normal | `--azul` |
| Eyebrow / tag de contexto | Inter | 12.5px | 600 | 1.3 | 0.03em | `--verde` (uppercase) |
| Parágrafo de introdução (lead) | Inter | 15px | 400 | 1.7 | normal | `--texto-suave` |
| Nota de transparência (corpo) | Inter | 13–13.5px | 400 | 1.65 | normal | `#5A4322` sobre `--dourado-tinta` |
| "Como usar" / "O que esperar" | Inter | 13–13.5px | 400 | 1.6 | normal | `--texto-suave` (negrito inline: `--texto`, 600) |
| Título dos action cards | Inter | 14.5px | 600 | 1.3 | normal | `--texto` |
| Descrição dos action cards | Inter | 12.5px | 400 | 1.55 | normal | `--texto-suave` |
| Texto do input | Inter | 14.5px | 400 | 1.4 | normal | `--texto` (placeholder: `--texto-fraco`) |
| Tag de contexto (pill no header) | Inter | 12.5px | 500 | 1.3 | normal | `--texto-suave` |
| Legenda de rodapé (caption) | Inter | 11.5px | 400 | 1.4 | 0.02em | `--texto-fraco` |
| Label do divisor ("escolha uma opção") | Inter | 12px | 500 | 1.3 | normal | `--texto-fraco` |

Regra geral: **nada abaixo de 11.5px** em nenhuma circunstância (limite de legibilidade), e o corpo de texto principal nunca abaixo de 13px.

```css
/* app/globals.css — como tokens, para não hardcodear valores soltos nos componentes */
--text-display-lg: 28px;   /* h1 desktop */
--text-display-sm: 23px;   /* h1 mobile / wordmark */
--text-body-lg: 15.5px;    /* lead */
--text-body-md: 14.5px;    /* título de card, input */
--text-body-sm: 13px;      /* corpo secundário */
--text-body-xs: 12.5px;    /* descrições, eyebrow, pills */
--text-caption: 11.5px;    /* rodapé */
```

---

## 4. Elementos gráficos e ícones utilitários

Além do símbolo da marca (`<GuapuMark />`), a interface usa um pequeno conjunto de ícones de linha (tema/dark-mode, check, info, quiz, resumo, encerrar sessão, limpar conversa, enviar). Todos seguem a mesma receita — **isso importa mais do que parece**: ícones com regras diferentes entre si (grossura, arredondamento) fazem a UI parecer remendada.

### 4.1 Regras de desenho

- **ViewBox**: `24 24` para todo ícone utilitário (diferente do símbolo da marca, que usa `100 100`).
- **Stroke**: `currentColor`, `stroke-width: 1.8` como padrão; `2.2` só para os ícones de check (ficam finos demais em 1.8 no tamanho pequeno que aparecem).
- **Linecap / linejoin**: sempre `round` — nenhum ícone com ponta quadrada.
- **Fill**: nenhum ícone utilitário usa preenchimento sólido, exceto o ícone de enviar (seta), que é 100% preenchido em branco sobre o botão azul.
- **Tamanho de desenho**: 15–20px de exibição (nunca o viewBox inteiro de 24px renderizado 1:1 sem folga — sempre com padding interno do botão em volta).
- **Fonte dos ícones**: hoje são SVGs desenhados à mão para o conjunto pequeno usado nos mockups. Ao expandir a interface (mais ações, mais estados), **recomendo padronizar com uma biblioteca de ícones de linha compatível com essas regras** — [Lucide](https://lucide.dev) ou [Tabler Icons](https://tabler.io/icons) — ambas usam viewBox 24, stroke 1.8–2, round linecap por padrão, e têm pacote npm pronto (`lucide-react`), evitando desenhar cada ícone novo à mão.

### 4.1.1 Tamanho de exibição por ícone

| Ícone | Tamanho | Stroke-width | Onde aparece |
|---|---|---|---|
| Tema (lua) | 17px | 1.8 | botão do header |
| Check (como usar / o que esperar) | 15px | 2.2 | lista "como usar" |
| Info (nota de transparência) | 18px | 2 | bloco de transparência |
| Resumo de conteúdo (livro) | 20px | 1.8 | action card |
| Quiz (interrogação em círculo) | 20px | 1.8 | action card |
| Informações (i em círculo) | 20px | 1.8 | action card |
| Encerrar sessão (logout) | 20px | 1.8 | action card |
| Limpar conversa (lixeira) | 16px | 1.8 | input bar |
| Enviar (seta preenchida) | 15px | — (fill sólido, sem stroke) | input bar |

### 4.2 Contêineres de ícone (badges)

| Contexto | Tamanho do contêiner | Border-radius | Fundo |
|---|---|---|---|
| Botão do header (tema) | 38×38px | 50% (círculo) | `--superficie` + borda `--borda` |
| Ícone dentro do action card | 42×42px | 12px | tinta da cor da categoria (`--azul-tinta`, `--verde-tinta`, `--dourado-tinta`, ou `--neutro-tinta`) — glifo em `--azul`, `--verde`, `--dourado-icone` ou `--neutro-icone`, respectivamente |
| Botão "limpar conversa" (ghost) | 38×38px | 50% | transparente + borda `--borda` |
| Botão "enviar" | 38×38px | 50% | `--azul` sólido, ícone branco |
| Avatar do Guapu no chat | 28×28px | 50% | `--azul` sólido (o próprio `<GuapuMark />`) |
| Favicon / logo do header | 16–48px / 38px | 50% | `--azul` sólido (o próprio `<GuapuMark />`) |

### 4.3 Elementos decorativos de fundo

O traço de galho sutil atrás do cabeçalho (visto nos mockups) é decorativo, não semântico:

```css
.branch-bg {
  position: absolute;
  top: -20px;
  right: -30px;
  width: 300px;
  height: 300px;
  opacity: 0.05;         /* nunca acima de 0.08 — é textura, não elemento de leitura */
  pointer-events: none;  /* nunca deve capturar clique/hover */
}
```

Regra: qualquer elemento gráfico puramente decorativo (galhos, blobs, texturas) deve ter `pointer-events: none` e opacidade entre `0.04–0.08`. Acima disso compete com o conteúdo; abaixo, some.

---

## 5. Conteúdo (copy / textos literais)

Tipografia (seção 3) especifica *como* o texto aparece; esta seção especifica *o que* aparece — as strings exatas usadas nos mockups, para não depender de reabrir o HTML de referência. Trate isso como conteúdo editável (viria de CMS, JSON de configuração por disciplina, ou similar) — os mockups fixam o exemplo da disciplina "INT 5224", mas a estrutura do texto deve se repetir para qualquer disciplina que use o Guapu.

### 5.1 Cabeçalho

| Elemento | Texto |
|---|---|
| Wordmark | `Guapu` |
| Tag de contexto | `Tutor de Enfermagem` |
| `aria-label` do botão de tema | `Alternar tema escuro` |

### 5.2 Tela inicial (hero card)

| Elemento | Texto |
|---|---|
| Eyebrow | `Assistente de IA · INT 5224` |
| Título (h1) | `O cuidado no processo de viver humano II: a condição cirúrgica` |
| Parágrafo de introdução | `Este espaço foi pensado para facilitar sua jornada de aprendizagem sobre o cuidado no processo de viver humano em condição cirúrgica. Aqui você revisa conteúdos, pratica com simulados e acessa informações essenciais da disciplina.` |
| Nota de transparência — rótulo em negrito | `Nota de transparência:` |
| Nota de transparência — corpo | `este assistente utiliza inteligência artificial para apoiar seu estudo. Ele não substitui o raciocínio clínico, a leitura das aulas ou a orientação docente. Todas as respostas seguem o plano de ensino e os limites éticos da disciplina.` |
| "Como usar" — rótulo em negrito | `Como usar:` |
| "Como usar" — corpo | `fale comigo como se estivesse conversando com um tutor. Peça explicações, tire dúvidas ou escolha uma das opções abaixo.` |
| "O que esperar" — rótulo em negrito | `O que esperar:` |
| "O que esperar" — corpo | `clareza, objetividade e apoio contínuo — sempre dentro dos limites da disciplina.` |
| Label do divisor | `escolha uma opção` |

### 5.3 Cartões de ação (action grid)

| Card | Título | Descrição |
|---|---|---|
| 1 (verde) | `Resumo de conteúdo` | `Revise os temas da disciplina com explicações e exemplos clínicos` |
| 2 (azul) | `Quiz da disciplina` | `Pratique com questões de múltipla escolha e feedback imediato` |
| 3 (dourado) | `Informações da disciplina` | `Consulte o conteúdo programático, calendário e critérios de avaliação` |
| 4 (neutro) | `Encerrar sessão` | `Encerre a sessão atual` |

### 5.4 Campo de mensagem e rodapé

| Elemento | Texto |
|---|---|
| Placeholder do input | `Pergunte ao Guapu…` |
| `aria-label` do botão limpar | `Limpar conversa` |
| `aria-label` do botão enviar | `Enviar` |
| Legenda de rodapé (caption) | `Guapu · Universidade Federal de Santa Catarina` |

### 5.5 O que ainda não tem copy definida

- Mensagens de erro (falha de rede, resposta bloqueada pelo filtro de conteúdo etc.)
- Estado vazio / carregando (enquanto o assistente "digita")
- Texto de confirmação ao clicar em "Encerrar sessão" (some a sessão direto, ou pede confirmação?)
- Qualquer copy para o modo escuro (não muda o texto, só o estilo — mas vale registrar aqui que não há strings novas nessa variante)

Esses pontos precisam de definição antes da implementação final — não foram cobertos em nenhum mockup até agora.

---

## 6. Acessibilidade / contraste

Antes de aprovar qualquer combinação de cor de texto sobre fundo, valide o contraste (WCAG AA mínimo 4.5:1 para texto normal, 3:1 para texto grande/ícones):

| Combinação | Uso | Resultado |
|---|---|---|
| `--azul` sobre `--fundo` / `--superficie` | títulos, wordmark | ✅ passa AA |
| `--texto` sobre `--superficie` | corpo de texto | ✅ passa AA |
| `--texto-suave` sobre `--superficie` | texto secundário | ✅ passa AA (texto ≥14px) |
| `#432F0F` sobre `--dourado-tinta` | nota de transparência | ✅ passa AA |
| Branco sobre `--dourado` | ❌ nunca usar — contraste insuficiente |
| Branco sobre `--verde` | texto pequeno em badge sólido | ⚠️ testar — prefira `--azul` como texto sobre verde/dourado sólidos |

Regra prática: **texto sobre dourado ou verde sólidos deve ser azul-escuro (`--azul`), nunca branco.**

### 6.1 Estados de foco (navegação por teclado)

Contraste de cor não é suficiente — todo elemento interativo (action cards, botões, input, link) precisa de um anel de foco visível ao navegar com Tab, distinto do hover:

```css
:focus-visible {
  outline: 2px solid var(--azul);
  outline-offset: 2px;
  border-radius: inherit;
}
```

- Nunca usar `outline: none` sem um substituto equivalente — é a causa nº 1 de reprovação em auditoria de acessibilidade.
- Em botões circulares (38×38px), o `outline-offset: 2px` evita que o anel de foco pareça "colado" na borda do próprio botão.
- Testar a ordem de tabulação: header (tema) → hero (sem elementos focáveis) → 4 action cards → input → limpar → enviar. Se a implementação trocar a ordem visual por CSS (grid/flex `order`), confirmar que a ordem de foco continua lógica.

---

## 7. Layout (estrutura de componentes)

Estrutura de página, de cima para baixo — os elementos marcados como "casca" permanecem fixos durante a conversa; o resto é substituído pelo histórico de mensagens.

```
<Header>                          ← casca fixa
  <GuapuMark size={38} /> + wordmark "Guapu" + tag de contexto
  botão de tema (canto direito)

<HeroCard>                        ← substituído após a 1ª mensagem
  eyebrow (tag pequena, verde + bolinha dourada)
  <h1> título da disciplina/tema
  parágrafo de introdução
  <TransparencyNote>               fundo dourado-tinta, ícone "i"
  <HowToUse>                       grid 2 colunas, ícones check verdes

<Divider label="escolha uma opção" />

<ActionGrid>                      ← substituído após a 1ª mensagem
  4 cards em grid 2x2 (1 coluna em mobile)
  cada card: ícone colorido por categoria + título + descrição

<InputBar>                        ← casca fixa
  input em pílula + botão limpar (ghost) + botão enviar (azul sólido)
```

### 7.0 Bolha de mensagem (histórico do chat)

Este é o elemento que substitui o `<HeroCard>` e o `<ActionGrid>` assim que a conversa começa — não estava especificado até agora:

```css
.chat-msg {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 12px; /* --space-3 */
}
.bubble {
  background: var(--azul-tinta);           /* mensagens do assistente */
  border-radius: 4px 14px 14px 14px;       /* "bico" no canto superior esquerdo, junto do avatar */
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--texto);
  max-width: 360px;                        /* nunca ocupar a largura toda — mantém legibilidade */
}
```

- **Mensagem do assistente**: avatar `<GuapuMark size={28} />` à esquerda + bolha em `--azul-tinta`, alinhados no topo (`align-items: flex-start`), raio assimétrico com o canto colado no avatar reto (`4px`) e os outros três arredondados (`14px`).
- **Mensagem do usuário** (não estava nos mockups, mas segue a mesma lógica): alinhar a bolha à direita, sem avatar, com o raio espelhado (`14px 4px 14px 14px`) e um fundo neutro — sugestão: `--superficie` com borda `1px solid var(--borda)`, para não competir com a cor de marca reservada às respostas do assistente.
- O container de mensagens herda o mesmo `max-width: 880px` centralizado do resto da interface — não criar uma largura própria.

### 7.1 Tokens de espaçamento e forma

- Raio de card: `20px` (containers grandes), `16px` (action cards), `12px` (blocos internos como a nota de transparência), `999px` (pílulas — tag de contexto, input, botões circulares).
- Borda: `1px solid var(--borda)` em todos os cards — nunca sombra pesada por padrão; sombra só aparece no `:hover` dos action cards (`box-shadow: 0 8px 20px rgba(16,52,92,0.08)` + `translateY(-2px)`).
- Largura máxima do container principal: `880px`, centralizado.

### 7.2 Grid de espaçamento (padding, gap, margin)

Os mockups usam valores orgânicos (ajustados visualmente). Para implementação, sistematize numa escala de base **4px**, arredondando cada valor usado para o múltiplo de 4 mais próximo — mantém a proporção original sem deixar cada componente com um número mágico diferente:

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-7: 28px;
--space-8: 32px;
--space-9: 36px;
--space-10: 40px;
--space-11: 44px;
```

| Uso | Valor aproximado no mockup | Token equivalente |
|---|---|---|
| Gap entre action cards | 14px | `--space-4` (16px) |
| Padding interno do hero card | 38–42px | `--space-10` / `--space-11` |
| Padding interno dos action cards | 18–20px | `--space-5` |
| Gap entre ícone e texto (card) | 14px | `--space-4` |
| Margem entre hero e divisor | 28px | `--space-7` |
| Padding do input (esquerda) | 20px | `--space-5` |
| Gap entre header e hero | 26–30px | `--space-7` / `--space-8` |

Isso evita, por exemplo, três componentes diferentes usando `18px`, `19px` e `20px` de padding "porque pareceu certo" — todos devem cair num desses degraus.

### 7.3 Elevação (sombra)

Só existem dois estados de elevação em toda a interface — não crie um terceiro sem necessidade:

```css
--shadow-resting: 0 1px 2px rgba(27, 39, 51, 0.03);   /* hero card, sempre presente */
--shadow-hover: 0 8px 20px rgba(16, 52, 92, 0.08);    /* só em :hover de elemento clicável */
```

Transição do hover: `transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease` — nunca instantâneo, nunca acima de 200ms (fica lento).

### 7.4 Nota — fundo de cenografia dos mockups

O cinza (`#EDEAE0`) que envolve a barra de navegador simulada nos últimos mockups é só cenografia de apresentação, para o "print" ficar claro (mostrar favicon, moldura de janela etc.) — **não faz parte da interface real**. O fundo de verdade da aplicação, dentro da janela do navegador, é `--fundo` (`#FAF7F0`). Não copiar o `#EDEAE0` para o CSS do produto.

### 7.5 Responsivo

Breakpoint único em `620px`:
- `ActionGrid` e `HowToUse`: de 2 colunas para 1.
- Tag de contexto ao lado do wordmark: esconder (`display: none`) — mantém só o wordmark no cabeçalho mobile.
- Reduzir padding interno do hero card e tamanho do `<h1>`.

---

## 8. Checklist de implementação

- [ ] Todo o copy da seção 5 conferido contra o mockup real (nenhuma string reescrita "de memória")
- [ ] Copy pendente (erros, loading, confirmação de encerrar sessão) definida antes do launch — ver seção 5.5
- [ ] `favicon.ico`, `icon.png`, `apple-icon.png` em `app/`
- [ ] `site.webmanifest` + ícones 192/512 em `public/`
- [ ] `<GuapuMark />` como componente SVG reutilizável (não `<img>`)
- [ ] Cores como CSS variables globais (+ Tailwind config, se aplicável)
- [ ] Fontes via `next/font/google` (Fraunces + Inter)
- [ ] Escala tipográfica como tokens (`--text-*`), nenhum tamanho de fonte hardcoded solto em componente
- [ ] Ícones utilitários padronizados (viewBox 24, stroke 1.8, round linecap) — considerar Lucide/Tabler para escalar
- [ ] Espaçamento nos múltiplos de 4px definidos (`--space-*`), nenhum padding "no olho"
- [ ] Elementos decorativos (galho de fundo) com `pointer-events: none` e opacidade ≤ 0.08
- [ ] Cores de ícone sobre fundo tintado tokenizadas (`--dourado-icone`, `--neutro-icone`) — não usar a cor "cheia" como stroke fino
- [ ] Paleta de modo escuro validada visualmente (a proposta da seção 2.4 ainda não foi vista em mockup)
- [ ] `:focus-visible` implementado em todo elemento interativo, ordem de tabulação testada
- [ ] Bolha de mensagem do assistente e do usuário implementadas (seção 6.0) — variante do usuário ainda não tem mockup, só a especificação textual
- [ ] Contraste de texto sobre dourado/verde sólidos revisado (sempre `--azul`, nunca branco)
- [ ] Header e input bar como componentes fixos fora do container de mensagens
- [ ] Breakpoint 620px testado em mobile real (não só redimensionando a janela do desktop)
