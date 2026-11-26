# Zueira FPS

FPS 3D multiplayer com Three.js no navegador e Node.js/Socket.IO no servidor. Crie uma sala privada por código, escolha entre quatro agentes e jogue rounds em Shibuya Night ou Templo Sakura. O estado, dano e habilidades são validados no servidor; cada sala recebe apenas os eventos da própria partida.

## GitHub Pages

O site estático é publicado em `https://kukarthur.github.io/ZUEIRA-KKKKKJ/` pelo workflow `.github/workflows/deploy-pages.yml`.

Como GitHub Pages não executa o servidor Node.js, o cliente precisa apontar para uma instancia do backend via segredo ou variável `VITE_SOCKET_URL` nas GitHub Actions. Sem essa configuração, a interface será publicada, mas salas multiplayer não conseguirão conectar.

## Requisitos

- Node.js 20 ou superior
- npm

## Executar em desenvolvimento

```bash
npm install
npm run dev
```

Abra <http://localhost:5173>. O cliente usa `io()` na origem atual; o proxy Vite encaminha `/socket.io` (incluindo WebSocket) para `http://localhost:3000`, também quando a página é acessada pelo domínio HTTPS do Codespaces. As animações dos membros acompanham o movimento replicado e os quatro tentáculos ondulam continuamente.

## Comandos

- `npm run dev`: inicia cliente e servidor
- `npm run build`: gera a versão de produção em `dist/`
- `npm start`: inicia o servidor; depois do build, ele também serve os arquivos de `dist/`
- `npm test`: executa os testes da simulação e dos disparos

## Menu e partidas

1. Informe um nickname e crie uma sala ou entre com um código de cinco caracteres.
2. No lobby, selecione seu agente; o anfitrião escolhe Shibuya Night ou Templo Sakura e inicia a partida com pelo menos dois jogadores.
3. Partidas começam no Round 1, alternam rounds após eliminação/tempo e terminam quando uma equipe vence sete rounds.
4. No lobby, cada pessoa escolhe Atacantes ou Defensores; a partida exige ao menos um jogador em cada equipe.
5. Um atacante aleatório recebe a bomba. Segure **F** por 3 s em um bombsite para plantar; defensores seguram **F** por 4 s perto da bomba para desarmar. Se não for desarmada em 35 s, os Atacantes vencem. Antes do plant, eliminar todos os atacantes vence a rodada para os Defensores.
6. Sensibilidade, qualidade/brilho, FOV, cor/tamanho da mira, inversão do eixo Y, FPS e preferência pelo HUD Mobile são salvos em `localStorage`. O HUD Mobile é ativado por padrão em dispositivos touch e pode ser ligado ou desligado nas configurações. O formulário de feedback registra as mensagens no log do servidor.

O bootstrap do menu não carrega Three.js nem os dados do mapa. O runtime e o renderer são importados quando a partida é iniciada e seus recursos são descartados ao retornar ao lobby.

## Controles

- **WASD**: movimentação
- **Space**: pular
- **Ctrl esquerdo / Shift esquerdo**: agachar (hitbox de 1,1 m e 40% menos velocidade)
- **Mouse**: mira (clique em **Entrar na partida** para capturar o mouse)
- **Clique esquerdo**: dispara
- **Mobile:** analógico virtual move; arrastar na metade direita mira; segurar **ATIRAR** dispara continuamente e também permite arrastar para mirar. Botões touch controlam pulo, agachamento, bomba e habilidades C/Q/E/X. Use a tela na horizontal.
- **Kaneca:** C dash de até 12 m; Q chicote; E escudo frontal; X Modo Fúria.
- **Satoro Bozo:** C teleporte curto; Q esfera de atração; E repulsão; X Vazio Roxo.
- **Barutcho:** C Pulso Sísmico; Q Granada de Luz; E Propulsão Lateral; X Canhão Sônico.
- **Zorbão:** C Muralha de Gelo; Q Campo Congelante; E Blindagem Térmica; X Nevasca Tática.
- **Barutcho:** o Pulso revela inimigos a 10 m por 3 s (15 s de recarga); a Granada ofusca quem olha para ela por 2 s (16 s); a Propulsão percorre até 8 m e dá +20% de velocidade por 3 s (18 s); o Canhão Sônico atravessa uma linha de 18 m, causa 110 de dano e empurra (custa 7 pontos).
- **Zorbão:** a Muralha bloqueia passagem e tiros por 8 s, com 200 HP (18 s); o Campo Congelante reduz a velocidade em 45% numa área de 5 m por 6 s (16 s); a Blindagem adiciona 40 de escudo por 5 s (20 s); a Nevasca atinge inimigos em 14 m por 7 s, causando 15 de dano/s e lentidão (custa 7 pontos).
- **ESC**: libera o mouse
- **F**: segurar para plantar, desarmar ou recolher a bomba solta

Tiros são hitscan e aplicam 120 de dano na cabeça, 40 no tronco ou 25 nas pernas; headshots exibem um hitmarker vermelho. A regeneração de Kaneca recupera 1 HP a cada 5 s fora de combate, até 50 HP por rodada e 100 HP no total. O Modo Fúria concede 25% de velocidade e 20% de cadência; durante ele, **Q** vira um golpe em área de 4,5 m que causa 90 de dano. Acertos confirmados carregam a ultimate.

Por padrão, o servidor escuta apenas em `127.0.0.1`. Para disponibilizá-lo a outros dispositivos em uma rede confiável, defina `HOST=0.0.0.0` e configure as regras de firewall apropriadas.

## Estrutura

- `src/CrimsonStalker.js`: modelo geométrico low-poly de Kaneca, tentáculos animados e efeitos visuais.
- `src/SatoroBozo.js`: modelo low-poly, venda, cabelo espetado e aura de Satoro Bozo.
- `src/Barutcho.js` e `src/Zorbao.js`: modelos 3D low-poly e animações dos novos agentes.
- `src/main.js`: bootstrap leve do menu, lobby, configurações e conexão Socket.IO.
- `src/game-runtime.js`: runtime Three.js carregado sob demanda para as partidas.
- `src/map.js`: cenários Three.js, luzes econômicas, `EffectComposer` com `UnrealBloomPass` e colliders exportados como `THREE.Box3`.
- `src/map-data.js`: layouts, spawns e dimensões dos dois mapas compartilhados entre cliente e servidor.
- `server/crimson-stalker.js`: movimento vertical, hitboxes regionais, cura, cooldowns e habilidades de Kaneca.
- `server/satoro-bozo.js`: habilidades de Satoro validadas pelo servidor.
- `server/tactical-agents.js`: habilidades, efeitos de área, escudos, muralhas e dano periódico dos novos agentes.
- `server/rooms.js`: códigos, lobby, anfitrião, seleção de agente/mapa e rounds.
- `server/spike.js`: atribuição e estado autoritativo da bomba, plantio, desarme e detonação.
- `server/index.js`: eventos Socket.IO isolados por sala e simulação autoritativa.

Esta é uma base jogável para desenvolvimento, sem contas, persistência ou proteção contra trapaças em produção.
