[English](README.md) | **Português (Brasil)**

# Desktop Pet

Um companheiro de mesa estilo Tamagotchi feito com [Electron](https://www.electronjs.org/). Uma pequena janela transparente, sempre no topo, fica no canto da sua tela com um bichinho em arte ASCII que você precisa alimentar, brincar e colocar para dormir — ou ele morre.

## Sobre o Electron

[Electron](https://www.electronjs.org/) é um framework para criar aplicações desktop multiplataforma usando tecnologias web (HTML, CSS, JavaScript). Ele empacota o Chromium para renderização e o Node.js para acesso ao sistema, permitindo que uma única base de código rode no macOS, Windows e Linux.

### Um breve histórico

O Electron começou em **13 de março de 2013** como **Atom Shell**, o runtime que o [GitHub](https://github.com/) construiu para dar vida ao editor de texto [Atom](https://github.blog/news-insights/product-news/sunsetting-atom/). Foi criado por Cheng Zhao (`zcbenz`) e o time do Atom, virou open source junto com o Atom em 2014 e foi **renomeado para Electron em abril de 2015**. O Electron 1.0 chegou em 2016. Em **dezembro de 2019**, o Electron entrou para a [OpenJS Foundation](https://openjsf.org/) como projeto em incubação, e em junho de 2020 foi promovido a **Impact Project** — status em que segue até hoje, não mais formalmente sob o guarda-chuva do GitHub ou da Microsoft.

### Por que foi criado

O GitHub precisava de uma forma de entregar o Atom — uma única base de código web — como um app nativo de verdade no macOS, Windows e Linux. As opções disponíveis na época (NW.js, Chromium Embedded Framework) não davam ao time a combinação Node + Chromium que eles queriam em um único pacote amigável para devs. O Atom Shell embarcou os dois: devs web ganharam acesso total ao SO via Node.js sem abrir mão do Chromium na UI. Um time, uma stack, todas as plataformas desktop.

### Modelo de processos

Aplicações Electron são divididas em dois tipos de processos:

- **Processo principal (main)** — um processo Node.js que controla o ciclo de vida da aplicação, cria janelas e acessa APIs nativas do SO (bandeja, notificações, sistema de arquivos).
- **Processo de renderização (renderer)** — um processo Chromium que executa a UI (o HTML/JS/CSS).

Um **script de preload** atua como uma ponte segura entre eles, expondo uma API mínima ao renderer via `contextBridge`. Com isolamento de contexto habilitado e integração com o Node desabilitada (os defaults modernos), o renderer só consegue chamar aquilo que o preload escolheu expor — ele não tem acesso direto ao SO.

### Apps notáveis no mundo real

Além dos nomes conhecidos — **VS Code**, **Slack**, **Discord** — o Electron também está por trás de:

- **GitHub Desktop** — GUI do Git, um dos primeiros apps Electron fora do Atom
- **Figma Desktop** — ferramenta de design, com uma engine de edição em WebAssembly por cima
- **Notion**, **Obsidian** — anotações e gestão de conhecimento
- **Signal Desktop**, **1Password 8** — apps sensíveis a segurança que investiram publicamente em hardening de Electron
- **Spotify Desktop**

(Para registro: o **WhatsApp Desktop** saiu do Electron em dezembro de 2025 para um wrapper nativo de WebView2 — o ecossistema é saudável, não monolítico.)

### Tradeoffs a considerar

O Electron é famosamente questionado, e os tradeoffs são reais:

- **Memória** — cada app Electron embarca seu próprio Chromium e runtime Node; nada é compartilhado entre apps. RAM em idle por app fica tipicamente entre **150 e 400 MB**.
- **Tamanho do bundle** — instaladores normalmente pesam **entre 80 e 250 MB** porque Chromium e Node vão junto em cada app.
- **CPU / bateria** — o Chromium multi-processo tem overhead mensurável em idle; alternativas mais leves como o Tauri reportam ~75% menos uso de CPU em idle.
- **Superfície de ataque** — o renderer roda conteúdo web enquanto o processo principal tem acesso total ao SO. Se `nodeIntegration` ficar ligado e o renderer tiver um bug de XSS, na prática o atacante ganha um shell.
- **Chromium desatualizado** — apps que não mantêm o Electron atualizado embarcam CVEs conhecidas. Um [estudo USENIX Security 2024](https://www.usenix.org/system/files/usenixsecurity24-ali.pdf) auditou apps Electron e encontrou ~62% rodando uma versão com vulnerabilidades conhecidas.

Mitigações que o Electron foi adicionando ao longo dos anos: `contextIsolation: true` por padrão (v12, 2021), `nodeIntegration: false` por padrão (v5, 2019), renderer em sandbox por padrão (v20, 2022), validação de integridade de ASAR (v34+, 2026) e um ciclo de release de 8 semanas alinhado com o Chromium Stable.

**Alternativas** no mesmo espaço: [Tauri](https://tauri.app/) (backend em Rust + WebView do SO; binários muito menores, sem Chromium embarcado) e o mais antigo [NW.js](https://nwjs.io/).

### Bundler? Sem bundler.

O Electron por si só não empacota JavaScript. Não há Webpack, Vite ou esbuild embutido — o renderer carrega arquivos `.html` e `.js` como um navegador faria, e o Node enxerga `.js` como o Node enxerga. Para empacotar o *app* (e não o JS), a ferramenta oficial é o **[Electron Forge](https://www.electronforge.io/)**: ele encapsula o `electron-packager`, gera instaladores específicos de plataforma (Squirrel, DMG, deb/rpm, zip) e oferece plugins para rebuild de módulos nativos, suporte a ASAR e fuses de segurança. Este projeto usa o Electron Forge para empacotar e deliberadamente abre mão de qualquer bundler JS — veja [Stack Técnica](#stack-técnica) e [Gerando um Distribuível](#gerando-um-distribuível) abaixo.

## Sobre Este Projeto

`desktop-pet` é um exemplo mínimo de aplicação Electron com estado que vive em uma janela sem moldura, transparente e sempre no topo, no canto inferior direito da sua tela.

### Decisões de design

O projeto se apoia deliberadamente nas APIs mais básicas do Electron para manter o código legível de ponta a ponta:

- **Sem bundler** — os renderers carregam módulos `.js` puros via tags `<script>`; sem Webpack, Vite ou step de build. A árvore `src/` inteira é o que de fato roda.
- **Sem framework de UI** — nada de React, Vue ou Svelte. A máquina de estados do bichinho em `src/pet.js` escreve direto no DOM; variáveis CSS cuidam do re-tema ao vivo.
- **Módulos puros compartilhados via UMD** — `src/settings-schema.js` e `src/utils/color.js` são carregados tanto pelo Node (processo principal, testes) quanto pelo renderer do navegador. Um pequeno wrapper UMD permite que o mesmo arquivo funcione nos dois mundos sem step de build.
- **`fs` nativo para persistência** — sem `electron-store` ou `lowdb`; apenas `fs.readFile` / `fs.writeFile` em um arquivo JSON dentro de `app.getPath('userData')`. A validação cuida de entrada corrompida.
- **Test runner nativo do Node** — `node --test` executa a suíte; sem Jest, Mocha ou Vitest. Só os módulos puros são testados; o código que toca o Electron é verificado rodando o app.
- **Duas janelas, um único preload** — a janela do bichinho e a de configurações compartilham o `preload.js`, então o formato de `electronAPI` é idêntico nos dois renderers.

O teto é propositalmente baixo para que a arquitetura permaneça legível.

### Funcionalidades

- **Um bichinho com humores** — renderizado como emoticons Unicode que mudam com base no estado:
  - `(＾▽＾)` feliz
  - `(・ω・)` ocioso
  - `(╥﹏╥)` triste
  - `(；⌣̀_⌣́)` com fome
  - `(－ω－) zzZ` dormindo
  - `(✖╭╮✖)` morto
- **Três atributos** (0–100) que decaem a cada 30 segundos:
  - **Fome** — cai 3 por tick (1 enquanto dorme)
  - **Felicidade** — cai 2 por tick
  - **Energia** — cai 1 por tick, é restaurada enquanto dorme
- **Três ações**, disponíveis tanto nos botões da janela quanto no menu da bandeja do sistema:
  - 🍖 **Alimentar** — +25 de fome, +5 de felicidade
  - 🎾 **Brincar** — +20 de felicidade, −10 de energia, −5 de fome
  - 💤 **Dormir** — alterna o modo de sono; o bichinho acorda automaticamente quando totalmente descansado
- **Ícone na bandeja do sistema** com itens de menu Alimentar / Brincar / Dormir / Configurações / Estatísticas / Sair
- **Notificações nativas do SO** quando o bichinho está com fome, sozinho, acorda ou morre (limitadas a uma vez por minuto por mensagem)
- **Arrastar para mover** — clique e arraste a janela do bichinho para qualquer lugar da tela
- **Morte e ressurreição** — se os três atributos chegarem a 0, o bichinho morre; clicar em qualquer botão de ação o ressuscita com atributos zerados
- **Nome e cores personalizáveis** — abra a janela de configurações pelo menu da bandeja ou pelo botão ⚙️ para renomear o bichinho e escolher três cores (sprite do bichinho, fundo, destaque). As mudanças são aplicadas ao vivo e persistem entre reinicializações em um arquivo JSON no diretório de dados do app do SO.

### Recursos do Electron usados

O que este projeto realmente toca da superfície de API do Electron:

**Processo principal (`main.js`):**

- `app` — ciclo de vida (`whenReady`, `window-all-closed`, `quit`) e `app.getPath('userData')` para localizar o arquivo de configurações
- `BrowserWindow` — janela do bichinho sem moldura, transparente, sempre no topo + uma janela separada para configurações
- `screen.getPrimaryDisplay().workAreaSize` — posiciona a janela do bichinho no canto inferior direito do display principal
- `Tray` + `Menu.buildFromTemplate` — ícone na bandeja com Alimentar / Brincar / Dormir / Configurações / Estatísticas / Sair
- `nativeImage.createFromDataURL` — monta o ícone de bandeja 16×16 a partir de uma data URL inline (sem arquivo de ícone externo)
- `Notification` — notificações nativas do SO quando o bichinho tem fome, está sozinho, acorda ou morre (com throttle no renderer)
- `ipcMain.on` e `ipcMain.handle` — endpoints IPC para `window-move`, `pet-notify`, `settings:get`, `settings:save`, `settings:open`
- `webContents.send` — transmite `settings:updated` para todo renderer aberto depois de um salvamento
- `webContents.openDevTools({ mode: 'detach' })` — DevTools em janela separada quando o app é iniciado com `--dev`

**Preload (`preload.js`):**

- `contextBridge.exposeInMainWorld('electronAPI', { … })` — a única ponte entre os renderers e o processo principal
- `ipcRenderer.send` / `invoke` / `on` — encapsulados para expor uma superfície de API pequena e um pouco mais tipada

**Defaults de segurança (em ambas as janelas):**

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox` no default (que é `true` no Electron 20+) — os renderers não têm acesso direto ao Node

**Plugins do Electron Forge (`forge.config.js`):**

- `@electron-forge/plugin-fuses` — grava Electron Fuses no binário: `RunAsNode: false`, `EnableCookieEncryption: true`, `EnableNodeOptionsEnvironmentVariable: false`, `EnableNodeCliInspectArguments: false`, `EnableEmbeddedAsarIntegrityValidation: true`, `OnlyLoadAppFromAsar: true`
- `@electron-forge/plugin-auto-unpack-natives` — lida com módulos nativos em runtime (nenhum está embarcado hoje, mas o plugin já está plugado)

**Não usados** (deliberadamente): `dialog`, `shell`, `clipboard`, `autoUpdater`, `remote` (deprecado). A superfície do projeto no Electron é apenas o que está acima.

### Arquitetura

| Arquivo | Processo | Função |
| --- | --- | --- |
| `main.js` | Main | Cria a janela do bichinho e a janela de configurações, monta o menu da bandeja, lida com `window-move`, `pet-notify` e os canais IPC `settings:get` / `settings:save` / `settings:open` |
| `preload.js` | Preload | Expõe `electronAPI` (`onAction`, `moveWindow`, `notify`, `getSettings`, `saveSettings`, `openSettings`, `onSettingsUpdated`) para ambos os renderers via `contextBridge` |
| `src/index.html` | Renderer (bichinho) | Layout do DOM — sprite do bichinho, barras de atributos, botões Alimentar/Brincar/Dormir/Configurações, texto de status |
| `src/pet.js` | Renderer (bichinho) | A classe `Pet` — máquina de estados, decaimento de atributos, lógica de humor, handlers das ações |
| `src/renderer.js` | Renderer (bichinho) | Conecta o DOM à instância de `Pet`, aplica configurações (variáveis CSS + nome do bichinho) na inicialização e em atualizações ao vivo, lida com ações da bandeja, implementa o arrastar para mover |
| `src/styles.css` | Renderer (ambos) | Variáveis de tema (`--color-pet`, `--color-bg`, `--color-accent`), contêiner do bichinho, animações do sprite, coloração das barras de atributos e estilos com escopo `.settings-window` para o formulário de configurações |
| `src/settings.html` | Renderer (configurações) | Layout do DOM da janela de configurações — campo de nome, três seletores de cor, botões Resetar / Cancelar / Salvar |
| `src/settings.js` | Renderer (configurações) | Carrega as configurações atuais via IPC, popula o formulário, lida com Salvar / Cancelar / Resetar, escuta atualizações ao vivo |
| `src/settings-schema.js` | Compartilhado | Módulo puro: exporta `SETTINGS_DEFAULTS` e uma função `validate()` que normaliza a entrada e cai nos valores padrão por campo. Carregado tanto no Node (main + testes) quanto no renderer do navegador |
| `src/utils/color.js` | Renderer (bichinho) | Helper puro `hexToRgba(hex, alpha)` usado para aplicar a cor de fundo do usuário preservando o alfa de 88% |
| `src/main/settings-store.js` | Main | Carregamento / salvamento seguros e `ensureExists` para `<userData>/settings.json` — arquivos corrompidos ou ausentes caem nos padrões sem travar |

Flags de janela definidas em `main.js`:

```js
transparent: true,
frame: false,
alwaysOnTop: true,
resizable: false,
skipTaskbar: true,
hasShadow: false,
```

O renderer nunca tem acesso direto ao Node.js — `contextIsolation: true` e `nodeIntegration: false` o mantêm em sandbox, e o script de preload é a única ponte.

### Persistência das configurações

As configurações ficam em um arquivo JSON em:

- **macOS** — `~/Library/Application Support/desktop-pet/settings.json`
- **Windows** — `%APPDATA%\desktop-pet\settings.json`
- **Linux** — `~/.config/desktop-pet/settings.json`

Formato:

```json
{
  "name": "Pixel",
  "colors": {
    "pet": "#ffffff",
    "background": "#1e1e28",
    "accent": "#4ade80"
  }
}
```

O arquivo é criado na primeira execução com valores padrão. A cada carregamento ele passa pela função `validate()` de `src/settings-schema.js`, que preenche quaisquer campos ausentes ou inválidos. Um arquivo corrompido registra um aviso e cai nos padrões — o app nunca trava com entrada inválida. O próximo salvamento reescreve o arquivo de forma limpa. Nenhuma dependência de terceiros é usada para armazenamento; apenas os módulos nativos `fs` e `path`.

Quando o usuário salva na janela de configurações, o processo principal transmite `settings:updated` para cada renderer, que então reaplica as três variáveis CSS e atualiza o nome exibido do bichinho — sem precisar reiniciar.

## Requisitos

- [Node.js](https://nodejs.org/) (qualquer LTS razoavelmente atual)
- npm (vem junto com o Node)

## Como Executar

Clone o repositório e instale as dependências:

```bash
git clone <url-deste-repo>
cd desktop-pet
npm install
```

Inicie o app:

```bash
npm start
```

O bichinho aparecerá no canto inferior direito do seu monitor principal.

### Modo de desenvolvimento

```bash
npm run dev
```

Isso inicia com `--dev`, que abre o DevTools do Chromium em uma janela separada para você inspecionar o renderer.

### Encerrando

Clique com o botão direito no ícone da bandeja e escolha **Sair**. Fechar a janela do bichinho também encerra o app.

## Testes

Os testes unitários dos módulos puros (`settings-schema.js`, `utils/color.js`) usam o test runner embutido do Node — nenhum framework de testes ou outra dependência é necessária.

```bash
npm test
```

Isso executa todos os arquivos `test/*.test.js` e imprime um resumo TAP. A suíte cobre os padrões do schema, a validação (tamanho do nome, formato hexadecimal das cores, entrada parcial / nula / inválida) e o helper `hexToRgba` (conversões válidas, insensibilidade a maiúsculas, entradas inválidas lançam erro).

## Gerando um Distribuível

O empacotamento é feito pelo [Electron Forge](https://www.electronforge.io/), configurado em `forge.config.js`.

### Apenas empacotar (app não comprimido)

```bash
npm run package
```

Produz um build executável não comprimido em `out/desktop-pet-<plataforma>-<arch>/` (por exemplo, `desktop-pet.app` no macOS, `desktop-pet.exe` no Windows ou um binário no Linux). Rápido — ideal para testes locais.

### Gerar distribuíveis (instaladores / arquivos únicos)

```bash
npm run make
```

Produz distribuíveis nativos de cada plataforma em `out/make/`:

| Plataforma | Saídas | Observações |
|---|---|---|
| **macOS** | `.dmg`, `.zip` | O `.dmg` é o instalador de arquivo único pronto para distribuição; o `.zip` contém o `.app` portátil |
| **Windows** | `.exe` (instalador Squirrel), `.zip` | O Squirrel cuida da instalação + atualização automática; o `.zip` é um build portátil |
| **Linux** | `.deb`, `.rpm`, `.zip` | Instaladores para gerenciadores de pacotes, mais um `.zip` portátil |

Verificado localmente em `darwin/arm64`: `npm run make` produz um `desktop-pet-0.1.0-arm64.dmg` de ~100 MB.

### Makers configurados

Em `forge.config.js`:

- `@electron-forge/maker-dmg` — `.dmg` do macOS
- `@electron-forge/maker-squirrel` — instalador do Windows
- `@electron-forge/maker-zip` — `.zip` portátil para todas as plataformas
- `@electron-forge/maker-deb`, `@electron-forge/maker-rpm` — instaladores de pacote para Linux

Para um executável de arquivo único real no Linux (`AppImage`), adicione um maker da comunidade como [`@reforged/maker-appimage`](https://github.com/reforged/maker-appimage).

### Builds multiplataforma

Cada SO só consegue gerar nativamente seus próprios alvos. Para produzir builds para todas as plataformas, execute `npm run make` em cada SO ou configure CI com um job por plataforma (GitHub Actions é a abordagem típica).

### Assinatura de código / notarização

Para distribuir a usuários finais sem avisos de segurança do SO:

- **macOS** — certificado Apple Developer ID + notarização (configure em `packagerConfig.osxSign` e `osxNotarize`).
- **Windows** — certificado de assinatura de código (configure no maker do Squirrel).
- **Linux** — nenhuma assinatura necessária.

Ambos são opcionais para uso pessoal / em desenvolvimento.

## Stack Técnica

- [Electron](https://www.electronjs.org/) `^35.0.0`
- [Electron Forge](https://www.electronforge.io/) `^7.11.2` para empacotamento e distribuição
- JavaScript, HTML e CSS puros — sem bundler, sem framework de UI

## Estrutura do Projeto

```
desktop-pet/
├── main.js                       # Processo principal do Electron (janelas de bichinho + configurações, bandeja, IPC)
├── preload.js                    # API exposta via contextBridge para ambos os renderers
├── forge.config.js               # Configuração do Electron Forge (packagers, makers, fuses)
├── package.json
├── src/
│   ├── index.html                # Markup da janela do bichinho
│   ├── pet.js                    # Máquina de estados do bichinho
│   ├── renderer.js               # Renderer do bichinho — aplica configurações, conecta a UI, arrastar para mover
│   ├── styles.css                # Variáveis de tema + estilos do bichinho + estilos com escopo das configurações
│   ├── settings.html             # Markup da janela de configurações
│   ├── settings.js               # Renderer das configurações — lógica do formulário
│   ├── settings-schema.js        # Padrões + validador puros (compartilhado, UMD)
│   ├── main/
│   │   └── settings-store.js     # Carregamento/salvamento no processo principal (JSON em userData)
│   └── utils/
│       └── color.js              # Helper puro hexToRgba (compartilhado, UMD)
├── test/
│   ├── settings-schema.test.js   # Suíte node:test para o validador de schema
│   └── color.test.js             # Suíte node:test para hexToRgba
└── out/                          # Saída do build (ignorado pelo git)
```
