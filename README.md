# ⚽ SoccerScore

Plataforma **demonstrativa** de apostas esportivas em português (pt-BR): a tela principal mostra
**somente jogos ao vivo** de dezenas de campeonatos (dados do Flashscore), com os brasileiros
priorizados, **1.500 mercados por partida** (apenas 1X2/draw visível até clicar no nome de um time),
depósito via **PIX ou cartão de crédito** (simulados), login/cadastro e cupom de apostas.

> ⚠️ Ambiente de demonstração: odds, mercados e pagamentos são simulados; nenhum valor real é
> movimentado e a liquidação é apenas ilustrativa. Aposte com responsabilidade (+18).

**Site ao vivo:** https://soccerscore-eta.vercel.app

## Funcionalidades

- **Tela principal 100% ao vivo**: jogos em andamento agora (placar e período vindos do Flashscore),
  agrupados por competição, com filtros por região, contagem por região, atualização automática a
  cada 45s e brasileiros sempre no topo.
- **1.500 mercados por jogo** gerados deterministicamente (modelo de Poisson com margem de casa).
  Só o 1X2 aparece no cartão; clique no nome do time para abrir a gaveta completa, com busca,
  abas por categoria e “Todos os 1500”.
- **Cupom de apostas** flutuante: uma seleção por partida, recálculo de odd, validação de saldo e
  revalidação de odds no servidor ao apostar. Apostas em jogos ao vivo são permitidas.
- **Depósito** por **PIX** (BR Code EMV + QR Code) ou **cartão de crédito** (validação de Luhn e
  aprovação simulada). Saldo creditado na hora. Nenhum outro método é aceito.
- **Conta**: saldo, apostas (em aberto/ganhas/perdidas) e extrato de transações.
- **Login/cadastro** obrigatório antes de acessar o site (sessão em cookie httpOnly por 30 dias).
- **Liquidação automática** das apostas quando as partidas terminam. Para jogos ao vivo, mercados de
  resultado/placar/totais usam o **placar real final**; mercados que dependem de estatísticas
  (escanteios, cartões, jogadores, 1º tempo) caem no simulador determinístico.

## Dados ao vivo (Flashscore)

Os jogos ao vivo vêm dos feeds públicos de resultados do Flashscore:

| Feed                  | Uso                                          |
| --------------------- | -------------------------------------------- |
| `f_1_0_3_pt_1`        | partidas de hoje — filtradas por `AB=2` (ao vivo) |
| `f_1_0_2_pt_1` / `f_1_-1_2_pt_1` | placares finais de hoje/ontem (liquidação) |

- Requisições com cabeçalho `x-fsign` e timeout de 9s, com host alternativo (`flashscore.ninja`).
- Cache em memória de 45s no servidor para não sobrecarregar o feed; a lista é renovada no cliente.
- Se o feed falhar, a tela mantém a última leitura e mostra um aviso — nada de tela em branco.
- O período exibido (“1º tempo”, “Intervalo”, “2º tempo”) é estimado pelo horário de início; o feed
  não expõe o minuto exato do cronômetro.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack, TypeScript, Tailwind CSS v4)
- [Turso](https://turso.tech) (libSQL) via `@libsql/client`
- `bcryptjs` para hash de senha, `qrcode` para o QR Code do PIX
- Feeds públicos de resultados do Flashscore para os jogos ao vivo (sem dependências extras)

## Como rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha com suas credenciais do Turso
npm run dev
```

Sem `TURSO_DATABASE_URL` o app usa automaticamente um banco local `file:local.db`.

```bash
npm run build   # build de produção
npm start       # servidor de produção
```

## Variáveis de ambiente

| Variável             | Descrição                                              |
| -------------------- | ------------------------------------------------------ |
| `TURSO_DATABASE_URL` | URL do banco (`libsql://...turso.io`)                  |
| `TURSO_AUTH_TOKEN`   | Token de acesso ao banco (leitura e escrita)           |

O schema (`users`, `sessions`, `transactions`, `bets`) é criado automaticamente na primeira consulta.

## Estrutura

```
src/
  app/
    (auth)/login/        # entrar + criar conta
    (site)/              # páginas protegidas: ao vivo (início), depósito, conta
    api/                 # auth, live, odds, deposits, bets
  components/            # LiveBoard, MatchCard, OddsDrawer, BetSlip, Header, AuthForm, DepositTabs…
  lib/
    live/                # feeds do Flashscore: parser, cache, períodos e fixture por jogo
    odds/                # modelo Poisson + gerador dos 1500 mercados + avaliação de resultados
    sports.ts            # jogos simulados do dia (fallback/catálogo interno)
    wallet.ts            # validação de cupom, aposta, crédito e liquidação (simulada + ao vivo)
    pix.ts               # BR Code EMV + CRC16
    db.ts / auth.ts      # Turso/libSQL e sessões
  proxy.ts               # middleware: exige login nas áreas protegidas
```
