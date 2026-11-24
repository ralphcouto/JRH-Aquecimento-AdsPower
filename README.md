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
