# Aquecimento de perfis · AdsPower

Abre os perfis do AdsPower em rodízio, navega como uma persona (por país do proxy) e mostra tudo num dashboard.

## Uso

```bash
npm install
npm start            # dashboard em http://127.0.0.1:4747
npm run bench -- 12 45 --apply   # testa até 12 perfis, 45s por passo, e salva a concorrência recomendada
```

No dashboard: **Iniciar rodízio**. A chave da API fica em `data/config.json` (ou variável `ADSPOWER_API_KEY`).

## Como funciona

- **Rodízio**: abre `concorrência` perfis por vez; cada um navega `sliceMinutes` (±20%); ao terminar, fecha (salva cookies) e abre o próximo da fila. Quando todos passaram, começa nova rodada. A fila prioriza quem navegou há mais tempo.
- **Persona** (determinística por perfil): nome, idade, 3–4 interesses, ritmo de leitura, profundidade de cliques.
- **País**: vem do `ip_country` do proxy no AdsPower. Sites e buscas (Google local, idioma) saem do catálogo `src/sites.js`. Países sem catálogo usam sites globais.
- **Navegação**: 3 tipos de passo – site direto, busca no Google + clique em resultado orgânico, vídeo no YouTube. Rolagem com pausas, mouse em curva, cliques em links internos.
- **Pular em vez de travar**: captcha, "verifique que é humano", login obrigatório, banner de cookies que cobre a tela, HTTP ≥ 400, timeout → registra o motivo e vai para outra página. Domínio com 2 falhas é evitado naquela sessão. Não clica em banners nem resolve captcha.
- **Proteção do Mac**: não abre novo perfil se CPU média > `cpuMax` ou RAM livre < `memMinMB`; em sobrecarga severa encerra o perfil mais novo mais cedo.
- Credenciais do proxy nunca são salvas nem exibidas.

## Ideias para melhorar

1. **Aquecimento progressivo**: perfis novos com sessões curtas e poucos sites; aumentar tempo/dia ao longo de 7–14 dias.
2. **Horário por fuso do proxy**: navegar mais em horas "acordadas" do país do proxy.
3. **Mais variedade de sinais**: Google Maps, Wikipedia, clima, login em conta já existente do próprio perfil (manual, uma vez) para cookies de sessão reais.
4. **Aceitar/rejeitar cookies opcional** (hoje só pula) para sites que cobrem a tela.
5. **Health check do proxy** antes de abrir (IP/país reais vs. AdsPower) e alerta quando divergir.
6. **Alertas** (Telegram/Slack) quando taxa de páginas puladas > X% ou perfil falhar 3 rodadas seguidas.
7. **Pontuação por perfil**: dias aquecidos, sites únicos, taxa de captcha – para decidir quando está "pronto".
8. **Rodar como serviço** (launchd) com `caffeinate` para o Mac não dormir.
9. Ajustar catálogo por nicho de uso final do perfil (ex.: perfis de e-commerce → mais sites de compras).

## Publicar no NAS (Hub, Google e AdsPower no PC)

O app roda no NAS (Docker). O AdsPower continua no PC e o app o controla pela rede local, por uma **ponte** que roda no PC.

```
Hub ──login único──► app (NAS, :4747) ──rede local──► ponte (PC, :50326) ──► AdsPower / navegadores
```

### 1. No PC (onde o AdsPower está aberto)
1. Instale o Node 22+ e copie a pasta `tools/` (só o arquivo `pc-bridge.js`).
2. Rode `tools\iniciar-ponte.ps1` (botão direito > Executar com o PowerShell). Ele gera o token na primeira vez, mostra a URL e o token para colar na tela do app e libera o Firewall se estiver como administrador. (Manual: `$env:BRIDGE_TOKEN='seu-token'; node tools\pc-bridge.js`)
3. Libere a porta **50326** no Firewall do Windows (só rede local). A ponte aceita apenas IPs da rede local e exige o token.
4. Deixe o PC ligado e sem suspender enquanto o aquecimento rodar.

**No Mac:** instale o Node (nodejs.org ou `brew install node`), copie a pasta `tools/` e rode `bash tools/iniciar-ponte.sh`. Ele gera o token, mostra a URL (`http://IP-DO-MAC:50326`) e mantém o Mac acordado enquanto roda. Clique em Permitir se o macOS perguntar sobre conexões do `node`. **Não use a porta 50325 do AdsPower direto no app:** a API responde na rede, mas a porta de controle de cada navegador só abre em `127.0.0.1`, então só a ponte (50326) funciona.

### 2. No NAS
1. Copie o projeto (sem `node_modules`, `data`, `.git`) para `\10.1.1.60\docker\jrh_digital\jrh_adspower`.
2. Copie `.env.example` para `.env` e preencha: `GOOGLE_CLIENT_ID/SECRET` (os mesmos do Hub), `ALLOWED_EMAILS`, `SSO_SECRET` (o mesmo do Hub), `ADSPOWER_URL=http://IP-DO-PC:50326`, `ADSPOWER_BRIDGE_TOKEN` (o mesmo da ponte) e `COFRE_API_KEY`.
3. No Google Cloud (credenciais OAuth), acrescente os URIs de redirecionamento:
   `https://aquecimento.nas2800.com/auth/google/callback` e `https://aquecimento.nas2800.duckdns.org/auth/google/callback`.
4. Suba: `docker compose up -d --build` (ou crie a stack no Dockhand). Teste: `http://10.1.1.60:4747/health` → `{"ok":true,...}`.
5. Endereço público: no túnel Cloudflare, `aquecimento.nas2800.com` → `http://10.1.1.60:4747`; no Nginx Proxy Manager, o mesmo para o DuckDNS.

**Atualizar depois:** copie os arquivos novos (`src`, `public`, `tools`, `package.json`) para a pasta do NAS e **recrie a stack** — o código é montado de fora, então não precisa reconstruir a imagem. Só reconstrua (`docker compose up -d --build`) se `package-lock.json` mudar. A versão em uso aparece no topo da tela e em `/health`.

### 3. No Hub
Acrescente este cartão em `config/ferramentas.json` do Hub (ele atualiza sozinho):

```json
{
  "id": "aquecimento",
  "nome": "Aquecimento AdsPower",
  "descricao": "Aquece perfis e páginas do Facebook pelo AdsPower, com histórico e relatórios.",
  "categoria": "Produção",
  "icone": "robo",
  "cor": "#4f46e5",
  "url": "https://aquecimento.nas2800.com",
  "interno": "http://10.1.1.60:4747/health"
}
```

Quem entra no Hub abre o aquecimento sem novo login (cookie `jrhsso`, mesmo `SSO_SECRET`). Quem pode usar é decidido por `ALLOWED_EMAILS` deste app.

### Configurações
Todas ficam na tela (**Configurações**): quem aquecer (perfis do Facebook, novos, demais, sem proxy), páginas do Facebook, navegação, rodízio, conexões e acesso. AdsPower (URL, chave e token da ponte), Cofre e Hub vêm do `.env` só como valor inicial: o que você salvar na tela vale no lugar, então dá para trocar de computador sem mexer no NAS. Os dados de acesso (Google, e-mails, segredo do Hub) ficam travados ("definido pelo servidor") e nunca são gravados em `data/`. Segredos nunca voltam para o navegador.

### Limites do modo NAS
- O monitor de CPU/RAM mostra o **PC** (medido pela ponte), não o NAS.
- A janela dos perfis abre no PC; com `headless` ligado, não aparece janela.
- Se o PC dormir ou a ponte cair, as sessões falham e o rodízio tenta de novo mais tarde.
