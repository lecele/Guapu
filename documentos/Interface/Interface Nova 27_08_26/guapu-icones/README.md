# Ícone Guapu — pacote de exportação

Símbolo final: bojo dourado (#E7C24A), bica triangular dourada, chama em losango
verde-esmeralda (#0F9B6C), sobre círculo azul institucional (#10345C).

## Arquivos

- `guapu-icon.svg` — fonte vetorial, editável (Illustrator, Figma, Inkscape).
- `favicon.ico` — múltiplos tamanhos (16, 32, 48px) num único arquivo, para a
  raiz do site (`/favicon.ico`).
- `guapu-icon-16.png` até `guapu-icon-1024.png` — PNGs individuais com fundo
  (círculo azul) para cada uso:
  - **16 / 32 / 48px** — favicon em navegadores
  - **57 a 180px** — `apple-touch-icon` (iOS, adicionar à tela de início)
  - **192 / 512px** — ícones PWA / Android (usados no `site.webmanifest`)
  - **256 / 384 / 1024px** — uso geral, redes sociais, apresentações
- `guapu-icon-mark-transparent-512.png` — só o símbolo (bojo + bica + chama),
  sem o círculo azul e sem fundo, para aplicar sobre fundos coloridos ou escuros.
- `site.webmanifest` — pronto para referenciar no `<head>` do site (ver abaixo).

## Como usar no HTML

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/guapu-icon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/icons/guapu-icon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/icons/guapu-icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#10345C">
```
