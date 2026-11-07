# Corrida dos Amigos: versão online

Kart 3D com os 8 pilotos, a pista Mata do Saci e **multijogador online para até 6 amigos**.
Esta pasta já é o site completo: o servidor (`server.js`) entrega o jogo e cuida das salas.

## Como funciona o online

1. Na abertura, toque em **Multijogador**, digite seu nome e toque em **Criar sala**.
2. Aparece a sala de espera com o código de 4 números. Toque em **Convidar no WhatsApp**: o link já leva o amigo direto para a sala.
3. Cada um escolhe um piloto na barra de baixo (um piloto por pessoa) e toca em **Estou pronto!**
4. Quando **todo mundo que está na sala** estiver pronto, a largada sai em 3 segundos. Os pilotos que ninguém escolheu correm com a IA.
5. No fim, **Voltar à sala** leva todos de volta à espera para a próxima corrida.

Se alguém cair no meio da corrida, o kart dele vira IA e a corrida continua. Se quem criou a sala sair, outro jogador assume as IAs sozinho.

## Colocar no ar (uma vez só, cerca de 15 minutos)

### 1. Subir os arquivos no GitHub
1. Entre em github.com e toque em **New repository**. Nome sugerido: `corrida-dos-amigos`. Pode ser público ou privado. Crie.
2. Na página do repositório, toque em **uploading an existing file** (ou **Add file → Upload files**).
3. Arraste **todo o conteúdo desta pasta** (`server.js`, `package.json`, `README.md`, `.gitignore` e a pasta `public`) e toque em **Commit changes**.

### 2. Publicar no Render (servidor gratuito)
1. Entre em render.com e crie a conta usando **Sign in with GitHub**.
2. Toque em **New → Web Service** e escolha o repositório `corrida-dos-amigos`.
3. Preencha:
   - **Language/Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Toque em **Deploy Web Service**. Em 2 a 4 minutos aparece o endereço, algo como `https://corrida-dos-amigos.onrender.com`.
5. Abra esse endereço, crie uma sala e mande o convite no grupo.

### 3. Instalar no celular (opcional)
- **Android (Chrome):** abra o endereço, toque no menu ⋮ e em **Instalar app** ou **Adicionar à tela inicial**.
- **iPhone (Safari):** abra o endereço, toque em **Compartilhar** e em **Adicionar à Tela de Início**.

O jogo abre em tela cheia com o ícone do Saci, como um aplicativo.

## Bom saber
- **Servidor dormindo:** no plano gratuito, o servidor dorme depois de 15 minutos sem ninguém jogando. A primeira pessoa a entrar espera cerca de 1 minuto até ele acordar (a tela avisa). Depois disso fica rápido.
- **Limite gratuito:** 750 horas de servidor por mês, o que sobra para um grupo de amigos.
- **Atualizar o jogo:** quando houver uma versão nova, suba os arquivos novos no mesmo repositório do GitHub. O Render publica sozinho.
- **Jogar sozinho:** o botão **Começar** continua funcionando como antes, contra 7 IAs.

## Para quem for mexer no código
- `server.js`: servidor HTTP + WebSocket (`/ws`), salas de até 6, largada quando todos estão prontos e repasse do estado dos karts (20 vezes por segundo).
- `public/index.html`: o jogo inteiro (three.js r128, carregado do cdnjs).
- `public/assets/lobby/`: cenário da sala e animações dos personagens em pé.
- Para rodar no computador: `npm install` e depois `npm start`, e abra http://localhost:3000
