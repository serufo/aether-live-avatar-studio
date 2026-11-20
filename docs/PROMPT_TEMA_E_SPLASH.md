# Prompt Reutilizável — Tema Claro/Escuro, Botão Auto-Retrátil (5s), Splash (4s) e Versionamento `0.x`

Este guia documenta os prompts prontos para replicar em outros projetos o padrão de interface implementado no **Aether Live Studio**.

---

## Prompt 1 — Versão Focada (Tema Claro + Botão Fixo Auto-Retrátil em 5s)

Use este prompt quando quiser aplicar em qualquer projeto existente apenas o **Tema Claro/Escuro** com o **botão fixo sobreposto no topo direito** que esconde o texto após 5 segundos:

````markdown
Implemente um sistema completo de **Tema Claro (`light`) e Tema Escuro (`dark`)** neste projeto, controlado por um **botão fixo sobreposto no canto superior direito**, seguindo exatamente os requisitos abaixo:

### 1. Estado, Persistência e Atributo Global
- Mantenha o estado do tema (`'dark' | 'light'`, padrão `'dark'`) persistido em `localStorage` (ex.: chave `app_ui_theme`).
- Sincronize o tema no elemento raiz da página (`document.documentElement.setAttribute('data-theme', theme)`), permitindo estilização global via CSS `:root[data-theme='light']`.

### 2. Botão Fixo Sobreposto no Topo Direito (com recolhimento em 5 segundos)
- Posicione um botão fixo (`position: fixed; top: 14px; right: 14px; z-index: 120;`, e `10px` no mobile) sempre visível acima de todas as telas/rotas da aplicação.
- Estilo visual: cápsula translúcida com `backdrop-filter: blur(16px)`, borda sutil, sombra suave e contraste adaptado ao tema ativo:
  - No tema escuro: ícone de Sol (`Sun`) + texto `"Claro"`.
  - No tema claro: ícone de Lua (`Moon`) + texto `"Escuro"`.
- **Comportamento de 5 segundos (auto-recolhimento)**:
  - Ao carregar a página (e sempre que o usuário clicar para alternar o tema), exiba **ícone + texto** por **5 segundos** (`5000ms`).
  - Após os 5 segundos, esconda o texto com transição CSS suave (`max-width: 0; opacity: 0`) e recolha o botão para um formato circular compacto **apenas com o ícone** (`36×36px` no desktop, `34×34px` no mobile).
  - Garanta acessibilidade (`aria-label`, `aria-pressed`, `title`, foco visível com `:focus-visible`).
- **Prevenção de sobreposição**: se houver barras de cabeçalho fixas com ações à direita, adicione `padding-right` seguro para que o botão fixo de tema nunca cubra outros controles.

### 3. Cobertura Completa do Tema Claro (`:root[data-theme='light']`)
- Defina tokens CSS semânticos para superfícies, textos, bordas e acentos adaptados para fundo claro (substituindo cores neon muito claras por tons de alto contraste AA/AAA sobre branco/porcelana, como azul-celeste profundo `#0284c7`, esmeralda `#059669`, âmbar `#b45309` e carmesim `#e11d48`).
- Audite e refatore **todos os estilos inline com cores escuras fixas** (painéis flutuantes, cards, históricos, tooltips, inputs, selects, badges, blocos de código e barras de status) para classes CSS ou variáveis (`var(--...)`), garantindo que nenhum texto fique ilegível ou bloco permaneça escuro sem contraste no modo claro.

### 4. Verificação Obrigatória
- Rode o build de produção (`npm run build`) garantindo zero erros de tipagem ou CSS.
- Verifique visualmente (desktop e mobile) no tema escuro e no tema claro:
  1. Estado inicial do botão (ícone + texto) e recolhimento para apenas ícone após 5 segundos.
  2. Persistência do tema claro após recarregar a página.
  3. Legibilidade de todas as telas, menus expandidos, formulários e modais.
````

---

## Prompt 2 — Versão Completa (Tema Claro + Botão 5s + Splash Screen Automática 4s + Versionamento `0.x`)

Use este prompt para projetos novos ou produtos em pré-lançamento que também queiram a **Splash Screen automática de 4s** e o **versionamento `dev v0.x`**:

````markdown
Implemente neste projeto o pacote de experiência de entrada, versionamento de desenvolvimento e alternância de tema seguindo estas especificações:

### 1. Controle de Versão de Desenvolvimento (`0.x`)
- Crie um módulo centralizado `src/config/version.ts` com versionamento de pré-lançamento `0.x` (`APP_DEV_VERSION_MAJOR = 0`, `APP_DEV_VERSION_MINOR = 1`, exportando `dev v0.1`).
- Crie um script automatizado `scripts/bump-dev-version.mjs` e o comando `"bump:dev"` no `package.json` para incrementar `0.x` → `0.(x+1)` a cada atualização publicada.
- Exiba o selo de versão discretamente no rodapé da tela de splash e no cabeçalho do painel administrativo (se existir).

### 2. Tela de Splash Cinematográfica com Timer de 4 Segundos
- Crie um componente de Splash Screen em tela cheia (`100dvh`, `position: fixed; inset: 0; z-index: 95`) usando os assets visuais do projeto (`[INFORMAR IMAGENS / IDENTIDADE AQUI]`):
  - Camada de fundo em tela cheia com profundidade de campo (`blur` suave + véu atmosférico adaptável ao tema claro e escuro) e movimento lento sutil.
  - Elemento central focado (emblema/logo emoldurado com anéis finos sutis), título com tipografia de destaque e linha de progresso minimalista sincronizada em **4 segundos** (`4000ms`).
  - **Sem botão manual de entrada e sem parágrafos longos**: encerra automaticamente após 4 segundos com fade suave (`460ms`) revelando a aplicação já pré-carregada atrás.
  - Respeite `prefers-reduced-motion: reduce` e compatibilidade com subpaths (usando `import.meta.env.BASE_URL` para imagens em `public/`).
  - Se a aplicação tiver áudio/saudação automática, aguarde o fim da splash para iniciar e pré-desbloqueie o `AudioContext` caso o usuário toque na tela durante a splash.

### 3. Tema Claro/Escuro Global + Botão Fixo Sobreposto (Recolhe em 5s)
- Adicione suporte completo a Tema Claro (`:root[data-theme='light']`) cobrindo inclusive a Splash Screen, o palco/interface principal e telas secundárias/admin.
- Adicione um botão fixo sobreposto no topo direito (`position: fixed; top: 14px; right: 14px; z-index: 120`) com persistência em `localStorage`:
  - Mostra ícone (`Sun`/`Moon`) + texto (`Claro`/`Escuro`) inicialmente e por **5 segundos** a cada troca de tema.
  - Após 5 segundos, esconde suavemente o texto mantendo **apenas o ícone** circular compacto (`36×36px` desktop / `34×34px` mobile).
- Refatore eventuais estilos inline escuros hardcoded para tokens CSS (`var(--...)`) para evitar blocos escuros perdidos no tema claro.

### 4. Validação e Entrega
- Garanta `npm run build` sem erros.
- Valide visualmente em desktop (`1440×900`) e mobile (`390×844`):
  - Splash no tema escuro e no tema claro + transição automática após 4s.
  - Botão de tema no estado expandido e recolhido (apenas ícone) após 5s.
  - Zero sobreposição entre o botão fixo e os controles do cabeçalho.
````
