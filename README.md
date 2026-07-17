# Chris — O Jogo

Jogo de ação side-scrolling em Canvas criado como homenagem de aniversário, com combate, transformação, trilha e créditos.

## Estado do projeto

Aplicação web estática executada no navegador. O repositório não define etapa de instalação nem de compilação, salvo quando indicado abaixo.

## Funcionalidades

- Combate lateral
- Personagens Chris, Nico e Thomas
- Modo automático e manual
- Ataque especial
- Transformação
- Controles desktop/touch
- Créditos sincronizados

## Tecnologias

- HTML5 Canvas
- CSS
- JavaScript
- Áudio HTML5

## Estrutura principal

- `index.html — shell`
- `game.js — motor`
- `styles.css — interface`
- `chris.png e fundo.png — imagens`
- `intro.mp3, mapatrilha.mp3 e final.mp3 — áudio`
- `netlify.toml — deploy`

## Executar localmente

Não há dependências de pacote nem comando de build registrado para este projeto. Abra `index.html` em um navegador moderno.

## Controles

- Mover: setas ou WASD.
- Soco: J ou Z.
- Pulo: K, X ou espaço.
- No celular, use os controles touch exibidos.

## Testes

Não foi identificado script de teste automatizado. Valide manualmente os fluxos descritos em **Como usar**, em desktop e em viewport móvel.

## Publicação

- O `netlify.toml` publica `.` sem build e configura cache longo para MP3.

## Limitações e segurança

- Autoplay de áudio pode ser bloqueado até a primeira interação.
- Não há suíte automatizada.
- Confirme autorização para redistribuir imagens e músicas.

## Repositório

[redobrai-del/thomas-projetos](https://github.com/redobrai-del/thomas-projetos)