# ⚽ SoccerScore

Plataforma **demonstrativa** de apostas esportivas em português (pt-BR): campeonatos nacionais e
internacionais com os brasileiros priorizados na tela principal, **1.500 mercados por partida**
(apenas 1X2/draw visível até clicar no nome de um time), depósito via **PIX ou cartão de crédito**
(simulados), login/cadastro e cupom de apostas.

> ⚠️ Ambiente de demonstração: odds e resultados são simulados, nenhum pagamento real é processado
> e a liquidação é apenas para fins ilustrativos. Aposte com responsabilidade (+18).

**Site ao vivo:** https://soccerscore-eta.vercel.app

## Funcionalidades

- **Tela principal** com filtros por dia (7 dias) e região; Brasileirão Série A em primeiro lugar.
- **1.500 mercados por jogo** gerados deterministicamente (modelo de Poisson com margem de casa).
  Só o 1X2 aparece no cartão; clique no nome do time para abrir a gaveta completa, com busca,
  abas por categoria e “Todos os 1500”.
- **Cupom de apostas** flutuante: uma seleção por partida, recálculo de odd, validação de saldo e
  revalidação de odds no servidor ao apostar.
- **Depósito** por **PIX** (BR Code EMV + QR Code) ou **cartão de crédito** (validação de Luhn e
  aprovação simulada). Saldo creditado na hora. Nenhum outro método é aceito.
- **Conta**: saldo, apostas (em aberto/ganhas/perdidas) e extrato de transações.
- **Login/cadastro** obrigatório antes de acessar o site (sessão em cookie httpOnly por 30 dias).
- **Liquidação automática** das apostas quando as partidas terminam.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack, TypeScript, Tailwind CSS v4)
- [Turso](https://turso.tech) (libSQL) via `@libsql/client`
- `bcryptjs` para hash de senha, `qrcode` para o QR Code do PIX

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
    (site)/              # páginas protegidas: início, depósito, conta
    api/                 # auth, odds, deposits, bets
  components/            # MatchCard, OddsDrawer, BetSlip, Header, AuthForm, DepositTabs…
  lib/
    odds/                # modelo Poisson + gerador dos 1500 mercados + avaliação de resultados
    sports.ts            # jogos do dia (determinísticos por data)
    wallet.ts            # validação de cupom, aposta, crédito e liquidação
    pix.ts               # BR Code EMV + CRC16
    db.ts / auth.ts      # Turso/libSQL e sessões
  proxy.ts               # middleware: exige login nas áreas protegidas
```
