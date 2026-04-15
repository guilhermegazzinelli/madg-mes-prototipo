# MADG MES — Protótipo

Sistema de monitoramento de OEE (Overall Equipment Effectiveness) para indústrias de qualquer porte e segmento.

## O que é

O MADG MES coleta dados de produção no chão de fábrica e calcula automaticamente:

- **Disponibilidade** — do tempo programado, quanto a máquina realmente produziu?
- **Performance** — produziu na velocidade esperada?
- **Qualidade** — do que produziu, quanto estava bom?
- **OEE = D × P × Q** — indicador único de eficiência

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML / CSS / JS vanilla (SPA, sem framework) |
| Backend | Supabase (PostgreSQL + REST API + Auth) |
| Deploy | Arquivos estáticos (Live Server, Vercel, Netlify) |
| Dependências | Supabase JS v2 (CDN) |

Zero build step. Abre o `index.html` e funciona.

## Funcionalidades

### Cadastros
- Unidades fabris (plantas)
- Linhas de produção (máquinas)
- Produtos com código e unidade de medida
- Taxas de produção — velocidade de cada produto em cada linha
- Motivos de parada (planejada, não planejada, setup)

### Coleta de dados
- Apontamento de produção: data, linha, produto, horários, tempos, quantidades
- Cálculo OEE ao vivo enquanto preenche o formulário
- Registro detalhado de paradas por ordem

### Visualização
- Dashboard com gauges OEE, consolidação por linha, tendência histórica
- Lista de ordens com filtros e OEE calculado por registro
- Navegação por data com sugestão de dias com produção

### Segurança
- Autenticação por email/senha (Supabase Auth)
- Row Level Security (RLS) com isolamento total por empresa
- Multi-tenant: cada empresa vê apenas seus dados

## Estrutura

```
├── index.html              SPA shell (header, sidebar, bottom nav, main)
├── css/styles.css          Design system (variáveis, grid, componentes)
├── js/
│   ├── supabase.js         Conexão Supabase + auth + login/logout
│   ├── router.js           Router hash-based (#/rota)
│   ├── app.js              Bootstrap e registro de rotas
│   ├── utils.js            Cálculos OEE, formatadores, consolidação
│   ├── components.js       Tabela, modal, toast, gauge, select
│   └── pages/
│       ├── dashboard.js    Dashboard OEE com tendência
│       ├── ordens.js       Lista de ordens + filtros
│       ├── ordem-form.js   Formulário de apontamento
│       ├── paradas.js      Detalhe de paradas por ordem
│       ├── unidades.js     CRUD unidades
│       ├── linhas.js       CRUD linhas
│       ├── produtos.js     CRUD produtos
│       ├── taxas.js        CRUD taxas de produção
│       └── motivos.js      CRUD motivos de parada
└── sql/
    ├── schema.sql          DDL completo (tabelas + RLS + policies)
    ├── seed.sql            Dados demo (Divinissimo + Metalúrgica)
    ├── fix-rls-e-demos.sql Correção RLS + ColorTech + VitroMax
    ├── nova-empresa.sql    Template para criar nova empresa com usuário
    └── vincular-usuario.sql Helper para vincular usuário existente
```

## Como rodar

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com)
2. No SQL Editor, rode `sql/schema.sql`
3. Rode `sql/seed.sql` para dados demo
4. (Opcional) Rode `sql/fix-rls-e-demos.sql` para mais empresas demo

### 2. Configurar
Edite `js/supabase.js` com a URL e anon key do seu projeto:
```js
const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_KEY = 'eyJ...SUA-ANON-KEY...';
```

### 3. Abrir
```bash
# Opção 1: Python
cd Prototipo && python3 -m http.server 8080

# Opção 2: Node
npx serve .

# Opção 3: VS Code Live Server
```
Acesse http://localhost:8080

### 4. Primeiro acesso
1. Crie uma conta na tela de login
2. No SQL Editor do Supabase, vincule o usuário:
```sql
-- Descubrir UUID
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 1;

-- Vincular à empresa
INSERT INTO user_empresa (user_id, empresa_id, papel)
VALUES ('UUID-AQUI', '00000000-0000-0000-0000-000000000001', 'admin');
```
3. Faça login novamente

### 5. Criar nova empresa
Use o template `sql/nova-empresa.sql` — substitua os valores marcados e rode no SQL Editor.

## Cálculos OEE

```
Tempo Programado = (Hora Fim - Hora Início) - Tempo Planejado
Tempo Produtivo  = Tempo Programado - Setup - Parada
Disponibilidade  = Tempo Produtivo / Tempo Programado
Qtd Teórica      = Velocidade Padrão × (Tempo Produtivo / 60)
Performance      = Qtd Produzida / Qtd Teórica
Qualidade        = Qtd Produzida / (Qtd Produzida + Qtd Rejeitada)
OEE              = D × P × Q
```

OEE nunca é armazenado — sempre calculado client-side a partir dos dados brutos.

## Modelo de dados

```
Empresa
  └── Unidade Fabril
        └── Linha de Produção
  └── Produto
        └── Taxa de Produção (Produto × Linha → velocidade)
  └── Motivo de Parada

Ordem de Produção (data, linha, produto, tempos, quantidades)
  └── Parada (detalhe com motivo)

User → user_empresa → Empresa (RLS)
```

## Licença

Proprietário — MADG MES
