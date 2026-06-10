[English](README.md) | **Português (Brasil)**

# Desktop Pet

Um companheiro de mesa estilo Tamagotchi feito com [Electron](https://www.electronjs.org/). Uma pequena janela transparente, sempre no topo, fica no canto da sua tela com um bichinho em arte ASCII que você precisa alimentar, brincar e colocar para dormir — ou ele morre.

## Sobre o Electron

[Electron](https://www.electronjs.org/) é um framework para criar aplicações desktop multiplataforma usando tecnologias web (HTML, CSS, JavaScript). Ele empacota o Chromium para renderização e o Node.js para acesso ao sistema, permitindo que uma única base de código rode no macOS, Windows e Linux. Apps como VS Code, Slack e Discord são feitos com ele.

Aplicações Electron são divididas em dois tipos de processos:

- **Processo principal (main)** — um processo Node.js que controla o ciclo de vida da aplicação, cria janelas e acessa APIs nativas do SO (bandeja, notificações, sistema de arquivos).
- **Processo de renderização (renderer)** — um processo Chromium que executa a UI (o HTML/JS/CSS).

Um **script de preload** atua como uma ponte segura entre eles, expondo uma API mínima ao renderer via `contextBridge`.

## Sobre Este Projeto

`desktop-pet` é um exemplo mínimo de aplicação Electron com estado que vive em uma janela sem moldura, transparente e sempre no topo, no canto inferior direito da sua tela.

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
