# Documentação do Projeto: Desktop Pet

Este documento fornece uma visão geral sobre o Electron, a tecnologia base deste projeto, e detalhes específicos sobre o funcionamento do **Desktop Pet**.

---

## 1. O que é o Electron?

O **Electron** é um framework de código aberto que permite o desenvolvimento de aplicativos de desktop nativos utilizando tecnologias web padrão: **HTML, CSS e JavaScript**. Ele combina o motor de renderização **Chromium** (o mesmo do Google Chrome) com o ambiente de execução **Node.js**, permitindo que desenvolvedores criem apps multiplataforma (Windows, macOS e Linux) com uma única base de código.

### Como funciona?

O Electron utiliza uma arquitetura de múltiplos processos:

*   **Processo Principal (Main Process):** É o "cérebro" do aplicativo. Ele roda em um ambiente Node.js puro, gerencia o ciclo de vida do app, cria janelas (BrowserWindows) e tem acesso direto às APIs nativas do sistema operacional (como arquivos, notificações e menus).
*   **Processo de Renderização (Renderer Process):** Cada janela do Electron roda seu próprio processo de renderização. Ele funciona como uma página web comum, sendo responsável pela interface do usuário (UI) e interação.
*   **Preload Scripts:** Atuam como uma ponte segura entre o Main e o Renderer. Eles permitem expor APIs específicas do Node.js ou do Main Process para a web de forma controlada, garantindo a segurança do aplicativo (Context Isolation).

### Vantagens do Electron

1.  **Multiplataforma:** Escreva uma vez, execute em qualquer lugar.
2.  **Tecnologias Familiares:** Utiliza o ecossistema web (React, Vue, TypeScript, CSS, etc.).
3.  **Acesso ao Sistema:** Diferente de um site comum, o Electron pode interagir com o hardware e sistema de arquivos.
4.  **Comunidade e Ecossistema:** Vasta gama de bibliotecas e ferramentas disponíveis via npm.

### Desvantagens do Electron

1.  **Consumo de Recursos:** Como cada app inclui uma instância do Chromium, o uso de memória RAM e espaço em disco costuma ser superior ao de aplicações nativas puras.
2.  **Tamanho do Pacote:** O instalador final é maior porque carrega consigo todo o motor do browser e o Node.js.

---

## 2. O Projeto: Desktop Pet

O **Desktop Pet** é um companheiro virtual para desktop estilo "Tamagotchi", desenvolvido com Electron e TypeScript. Ele vive no canto da sua tela, interagindo com você enquanto você trabalha.

### Funcionalidades Principais

*   **Estado Persistente:** O pet "lembra" de sua fome, felicidade e energia mesmo após fechar o programa.
*   **Sistema de XP e Níveis:** O pet ganha experiência ao ser alimentado ou ao brincar. Ao acumular XP suficiente, ele sobe de nível, o que é exibido ao lado do seu nome.
*   **Balões de Pensamento (Speech Bubbles):** O pet se comunica visualmente através de balões que aparecem aleatoriamente ou em reação a ações (como comer ou dormir).
*   **Interface Minimalista:** Janela transparente, sem bordas, que flutua acima de outras janelas.
*   **Interações:** Você pode alimentar, brincar ou colocar o pet para dormir através de cliques, atalhos de teclado ou pelo menu da bandeja (Tray).
*   **Sistema de Notificações:** O pet avisa quando está com fome ou precisa de atenção.
*   **Diferentes Tipos de Pets:** Suporta múltiplos estilos (Pixel, Tama, Bot, Ghost) com animações próprias.

### Arquitetura do Projeto

O código está organizado para separar a lógica de negócio da interface e das APIs do sistema:

*   **`src/main/`**: Contém o Processo Principal. Gerencia a janela, o ícone na bandeja (tray) e a persistência de dados no disco (`state-store.ts`).
*   **`src/renderer/`**: Contém a lógica da interface.
    *   `pet.ts`: A "Máquina de Estados" do pet. É lógica pura (TypeScript), sem dependências de DOM, facilitando testes.
    *   `animation-queue.ts`: Gerencia as sequências de sprites para as animações.
    *   `index.ts`: O orquestrador que conecta a lógica do pet ao DOM e ao Processo Principal.
*   **`src/shared/`**: Contém tipos e configurações compartilhadas entre o Main e o Renderer, garantindo consistência (como `config.ts` e `ipc-types.ts`).
*   **`src/preload/`**: Define a interface de comunicação segura via `contextBridge`.

### Fluxo de Dados e Persistência

A aplicação utiliza um fluxo de salvamento otimizado:
1. O **Renderer** monitora mudanças no estado do pet.
2. Quando ocorre uma mudança, ele envia um "snapshot" para o **Main** via IPC (Inter-Process Communication).
3. O **Main** utiliza um sistema de *debounce* (espera 500ms de inatividade) para gravar o arquivo `state.json` de forma atômica, evitando corrupção de dados e excesso de escrita no disco.

### Como Executar

1.  Instale as dependências: `npm install`
2.  Inicie em modo de desenvolvimento: `npm run dev`
3.  Para gerar a build final: `npm run build`

---

*Desenvolvido como parte do projeto de Programação Web - 5º Semestre.*
