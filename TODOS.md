# MADG MES — TODOS

Pendências capturadas durante sessions de office-hours / eng-review / ceo-review / design-review (2026-04-25).
Itens sem prioridade-explicita assumem P3 (nice-to-have).

---

## Concluídos

### Item 1 — Vitest bootstrap + schema invariants + CI workflow

**Status: DONE** (2026-04-26, PR #2 mergeado em main como `925e6a3`)

Vitest 3.2 configurado, 26 schema invariants protegendo contra regressão silenciosa do dump pg, GitHub Actions workflow rodando em push + PR. Cross-tenant SPIKE (3 cases) iniciou Item 2.

Foi também: fix do GoTrue v2.188+ que falhava em NULL token cols no seed, fix de deploy Cloudflare Workers (assets agora em `public/`), wrangler.jsonc com fail-safe contra leak.

### Item 2 — Cross-tenant RLS test suite (full expansion)

**Status: DONE** (2026-04-26, branch `feature/cross-tenant-expansion`)

Audit log infrastructure (migration 0001) + 14 arquivos cobrindo 12 tabelas mutáveis + audit_log + super-admin lifecycle = ~99 cross-tenant cases + 17 schema invariants = 146 tests verde local.

Pattern: User A (divinissimo) logado, empresa B (colortech) alvo. Ground truth via service_role descarta falso positivo. Cada SELECT/INSERT/UPDATE/DELETE verificado: same-tenant happy path + cross-tenant silent ou 42501. INSERT same-tenant valida que audit row e' gerado com record_id correto + acted_as_super_admin marker.

Achados arquiteturais durante implementação:
- `paradas` não tem policy UPDATE (só SELECT/INSERT/DELETE). Sem policy = bloqueado por FORCE RLS. Pode ser intenção (paradas append-only) ou hole no design — vira **TODO-8** abaixo.
- `super_admins` sem policy UPDATE também (intencional — user_id é PK imutável).
- `auth_empresa_id()` retorna NULL quando super-admin sem context, fazendo predicados RLS filtrar tudo silenciosamente. Bom design — fail-safe.
- Audit log trigger AFTER INSERT/UPDATE/DELETE não dispara em ops bloqueadas por RLS — write nunca aconteceu, audit fica clean.

Seed: UUIDs estáveis em todas tabelas (50/60/70/80 prefixes pra taxas/turnos/ordens/paradas via UPDATE pos-INSERT). audit_log TRUNCATE no fim do seed pra tests partirem do zero.

Helper isSupabaseRunning() endurecido — probe duplo (auth health + REST contra empresa). Resolve falha "stack subido sem seed" do v1 SPIKE.

vitest.config.js: `fileParallelism: false` pra evitar race entre arquivos super-admin (todos compartilham 1 super-admin user no seed).

### Item 8a — Importer Excel→Supabase (scripts/import-loi.js)

**Status: DONE** (2026-04-26, branch `feature/importer-loi`)

Script Node.js (~470 linhas) que recebe `.xlsx` multi-sheet e popula Supabase via service_role. Substitui o caminho legacy de `sql/nova-empresa.sql` (substituir placeholders manualmente no SQL Editor).

**Stack:** `read-excel-file` (runtime) + `write-excel-file` (dev only, gera fixture). Zero npm vulnerabilities (`xlsx` original tinha 2 high severity sem fix). package.json ganhou `"type": "module"`.

**8 sheets** (uma por entidade): empresa, unidades, linhas, produtos, taxas, motivos, turnos, user.

**Two-phase architecture**:
- Phase 1: parse + validate ALL (relata TODOS os erros num run só, operador conserta de uma vez)
- Phase 2: INSERT em ordem topológica (empresa → unidades → linhas → produtos → motivos → taxas → turnos → user)
- Falha mid-INSERT dispara `deleteEmpresaCascade()` automaticamente — empresa parcial é removida, banco volta intocado

**Idempotência:** fresh-only por default (re-run aborta com `EmpresaJaImportadaError`). Flag `--replace` apaga empresa existente em ordem topológica reversa antes de reimportar.

**Auth:** env vars `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. Sem flags CLI (não vaza pra shell history).

**Fixture:** `data/loi-sample.xlsx` (~9KB, 8 sheets baseadas em `sql/exemplo-haoma.sql`). Gerado uma vez via `node scripts/generate-sample-xlsx.js`. Operadores duplicam pro próximo cliente.

**Tests:** 13 cases em `test/import-loi.test.js` cobrindo as 5 categorias de erro do TODO-1:
- (a) MissingColumnError — header mal formatado
- (b) InvalidCellTypeError — tipo errado, enum fora de lista, time não-HH:MM
- (c) ForeignKeyViolationError — refs entre sheets
- (d) UniqueConstraintError — duplicata simples e composta
- (e) Network/Supabase errors — documentados no header do importer; testáveis manualmente (precisaria mock pra unit-test)

**Smoke test manual (validado):**
1. `import-loi.js sample.xlsx` → HAOMA criada com 1 unidade, 2 linhas, 8 produtos, 8 motivos, 8 taxas, 3 turnos, 1 user
2. Re-run sem flag → aborta com `EmpresaJaImportadaError`
3. Re-run com `--replace` → cascade-delete + reimport limpo

### Item 1d — Playwright happy-path E2E

**Status: DONE** (2026-04-26, branch `feature/playwright-e2e`)

@playwright/test 1.59 + Chromium binary local. 24 cases em 5 arquivos cobrindo 9 paginas: auth flow (login/logout, sidebar role-based), cadastros (unidades/linhas/produtos/motivos full CRUD via modal, taxas list-only), dashboard OEE + paradas (filtros + render), ordens (lista + new form), admin/* (super-admin only routes).

Pattern: `public/js/supabase.js` ganhou hook `window.__SUPABASE_URL_OVERRIDE` / `__KEY_OVERRIDE`; testes injetam local Supabase (Docker) via `addInitScript` em `test/e2e/fixtures/auth.js`. Zero impacto em runtime de prod (mantem hardcoded URL como default).

Helpers compartilhados em `test/e2e/helpers.js`: navigateTo (sidebar click + spinner wait), waitModalOpen, saveModal (state-based, evita race de toast), createCadastro (DRY pra cadastros simples), deleteFirstRowMatching (confirma row sumiu apos UI.confirm).

Fixtures em `test/e2e/fixtures/auth.js`: `pageWithLocalSupabase`, `pageAsDivinissimo` (regular user), `pageAsSuperAdmin`. isSupabaseRunningAndSeeded probe duplo (auth health + REST com service_role).

`npm run test:e2e` (8080 server auto-spawned) ou `npm run test:e2e:ui` (debug interativo).

Local: 24/24 verde em 12.3s. CI nao roda Playwright (sem Supabase local) — vitest skipa cross-tenant E playwright skipa via probe duplo.

**Coberturas DEFERRED (TODO-5 ou follow-ups):**
- Ordem-form submissao COMPLETA (form pesado: 3 selects cascading, varios timing fields, tabela inline de paradas). Hoje testa render + cascading dropdown.
- Taxas full CRUD (UNIQUE constraint em (produto_id, linha_id) ocupa todos combos do seed; precisa fixture builder).
- Visual snapshots (`toHaveScreenshot()`) — escopo do TODO-5 que agora esta desbloqueado.

---

## P2 (importante, mas não bloqueia v1)

### TODO-8 — Auditar ausência de policy UPDATE em `paradas` (P2)

**Status: RESOLVED** (2026-04-26 — opcao (a) intencional, append-only by design)

**Veredicto:** É intencional, NÃO é hole. Três evidências:

1. **Histórico** — `sql/schema.sql` original (pre-Supabase CLI, commit `83d3c38` Apr 15) já declarava apenas 3 policies em paradas (linhas 257/262/267: select, insert, delete). Mesmo pattern desde o dia 1 — não é "esquecemos".

2. **UI confirma** — `public/js/pages/paradas.js` só chama `db.from('paradas').select(...)` (linha 11), `.delete().eq('id', ...)` (linha 74), `.insert(payload)` (linha 142). Nunca chama `.update()`. O botão "Salvar" (linha 111) aciona INSERT no submit do modal de criação.

3. **Fluxo do operador** — corrigir parada errada (motivo trocado, horário errado) = clicar lixeira na parada errada + criar nova com dados corretos. Audit trail registra ambos eventos no `audit_log` (DELETE da row antiga + INSERT da nova).

**Implementação da resolução:**
- `supabase/migrations/0002_doc_paradas_append_only.sql` — `COMMENT ON TABLE paradas` + `COMMENT ON POLICY` queryable via `\d+ paradas` (auto-documentação na própria DB)
- `test/cross-tenant/paradas.test.js` — descrições dos casos UPDATE deixam "append-only by design" explícito (não "comportamento observado")

**Completed:** 2026-04-26 (audit + 1 migration + 1 test description update).

---

### TODO-1 — Error & rescue table formal do importer Excel→SQL

**Status: DONE** (2026-04-26 — entregue junto com Item 8a)

**Tabela formalizada no header de `scripts/import-loi.js`** (linhas 24-37):

| exception class | rescued? | mensagem ao operador |
|---|---|---|
| FileNotFoundError | no | "Arquivo nao encontrado: <path>" |
| MissingSheetError | no | "Sheet '<nome>' faltando no arquivo" |
| MissingColumnError | no | "Sheet '<sheet>' faltando coluna '<col>'" |
| InvalidCellTypeError | no | "Sheet '<sheet>' linha <N> coluna '<col>': esperado <tipo>, recebeu <valor>" |
| InvalidEnumValueError | no | "Sheet '<sheet>' linha <N> coluna '<col>': valor '<v>' nao permitido. Use: <opts>" |
| ForeignKeyViolationError | no | "Sheet '<sheet>' linha <N>: refere '<chave>' que nao existe em <tabela_pai>" |
| UniqueConstraintError | no | "Sheet '<sheet>' linha <N>: '<chave>' duplicado (ja' aparece na linha <M>)" |
| EmpresaJaImportadaError | no | "Empresa '<nome>' ja existe. Use --replace pra apagar e reimportar." |
| SupabaseConnectionError | no | "Falha ao conectar Supabase: <detalhe>" |
| SupabaseInsertError | **yes** (auto-cleanup) | "INSERT falhou em <tabela>: <detalhe>. Banco revertido." |

**Validation reporta TODOS os erros de uma vez** — operador conserta tudo num pass, não precisa "rodar→consertar→rodar→consertar" linha por linha.

**Auto-cleanup em SupabaseInsertError** — wrapper externo detecta `err.partialEmpresaId` e chama `deleteEmpresaCascade()`. Falhas mid-INSERT deixam banco intocado do ponto de vista do operador.

**Tests:** 13 cases em `test/import-loi.test.js` cobrindo categorias (a)-(d) com fixtures sintéticos (sem DB). Categoria (e) documentada no header e validada via smoke run manual.

**Completed:** 2026-04-26 (mesmo PR que Item 8a).

---

## P3 (nice-to-have, claramente diferível)

### TODO-2 — Interaction edge cases UI completo

**What:** Mapa de interaction edge cases para o user journey "operador apontando ordem" e "founder importando dados do LOI". Cobrir: double-click submit, navegar away mid-action, slow connection, stale state, back button, retry while in-flight, sessão expirada mid-formulário.

**Why:** Em produção real, usuários quebram fluxos felizes. Plano atual cobre apontamento via cross-tenant test e CRUD refactor, mas não mapeou explicitamente as edge cases de interação. Cliente B2B vai bater nessas no 1º mês.

**Pros:**
- Pega bugs que aparecem só em uso real
- Reduz ticket support do cliente "isso travou"
- Builds trust com primeiro cliente

**Cons:**
- Trabalho contínuo (não é one-shot)
- Plano atual já tem cross-tenant test cobrindo segurança, edge cases de UX são camada acima

**Context:** Section 4 do skill plan-eng-review (Data Flow & Interaction Edge Cases) ficou parcialmente coberto. CEO review marcou como P3 — não bloqueia v1 mas é dívida UX.

**Effort estimate:** M (human team ~2 dias) → CC+gstack ~2-3h  
**Priority:** P3  
**Depends on:** v1 em produção (sem dados reais, edge cases são teóricos).

---

### TODO-3 — Operational dashboard externo (cliente vê)

**What:** Página pública (estilo `status.madgmes.com.br`) onde TI do cliente consegue ver: uptime últimos 30 dias, incidentes históricos, manutenções agendadas. Pode ser página estática gerada via UptimeRobot embed + comunicação de incidente manual via WhatsApp.

**Why:** Cliente B2B sério (TI rigorosa) pergunta "como vou saber se vocês estão operacionais?" Resposta atual: "vamos te avisar". Resposta melhor: URL público que mostra histórico.

**Pros:**
- Sinal de profissionalismo importante na hora de fechar contrato
- Reduz perguntas de "vocês caíram?" via WhatsApp
- Stack: Statuspage.io grátis ou simples HTML/Cloudflare

**Cons:**
- Não tem ROI até o 2º-3º cliente
- Manter atualizado durante incidentes é trabalho

**Context:** Section 8 (Observability) do plan-eng-review cobriu monitoring interno (UptimeRobot, Sentry, logs). Não cobriu dashboard externo para cliente.

**Effort estimate:** S (human team ~1 dia) → CC+gstack ~1-2h  
**Priority:** P3  
**Depends on:** None — pode ser feito em paralelo com onboarding LOI.

---

### TODO-4 — Feature flag strategy

**What:** Definir biblioteca/padrão pra feature flags (Cloudflare Workers + KV? PostgreSQL config table? Supabase RLS via flag column?). Aplicável quando lançar audit_log triggers em produção (deploy faseado: empresa-piloto antes de empresa-real).

**Why:** Hoje deploy é all-or-nothing. Quando ativar audit log no LOI, se trigger tiver bug de performance (>3x baseline), founder não tem switch pra desligar sem rollback de migration. Feature flag dá esse safety.

**Pros:**
- Reduz blast radius de mudanças cross-cutting
- Permite A/B test entre clientes futuros
- Standard B2B SaaS

**Cons:**
- Adiciona camada que não tem ROI no v1 com 1 cliente
- Pode levar a "scope creep" via flags abandonadas

**Context:** Section 9 (Deployment & Rollout) do plan-eng-review cobriu CI/CD + rollback via git tag, mas não feature flags. Pra v1 com 1 cliente o risco é gerenciável (rollback manual). Pra v1.1 com 2-3 clientes vira mais importante.

**Effort estimate:** M (human team ~1 semana) → CC+gstack ~6-10h  
**Priority:** P3  
**Depends on:** v1.1 (segundo cliente em produção).

---

## Itens já decididos no design doc (referência)

Coisas que **NÃO** vão pra TODOS porque já estão no design doc como decisões explícitas:

- Rails v2 — decisão pós-LOI Gate 1 (live ≥2 semanas)
- Multi-role granular — Gate 2 (3 clientes pagantes)
- Invite flow — Gate 2 quando atrito de onboarding for real
- Super-admin UI já existe (descoberta na eng review)
- Self-host opção comercial — Gate 3 (5+ clientes ARR R$100k+)
- Integração Totvs — Gate 2 quando virar diferencial de venda

---

*Lista vivente. Atualizar quando decisões forem feitas ou items novos emergirem.*

---

## Adicionados pelo /plan-design-review (2026-04-25)

### TODO-5 — Habilitar Playwright `toHaveScreenshot()` no Item 1d (P2)

**Status: DONE** (2026-04-26 — branch `feature/playwright-snapshots`)

**O que foi entregue:**
- `test/e2e/snapshots.spec.js` — 13 cases gerando 14 baselines (sidebar capturado isoladamente)
- Coverage: 2 auth states, 9 paginas regular-user (dashboards/listas/form/modal), 3 admin
- Baselines em `test/e2e/snapshots.spec.js-snapshots/` (~900KB total, 14 PNGs entre 23-105KB)

**Robustez:**
- `animations: 'disabled'` freeza CSS transitions
- `mask: [...]` obscura inputs de data dinamicos (current date diff entre runs)
- `waitForTimeout(1500)` apos navigate em paginas com ApexCharts pra render terminar
- `maxDiffPixels: 100` tolera anti-aliasing diff entre runs (~0.01%)

**Workflow:**
- Apos mudanca intencional de UI: `npm run test:e2e -- snapshots --update-snapshots`
- PRs futuros disparam diff-check automatico: regressao visual pixel-level vira CI fail

**Cross-platform:**
- Snapshots por OS (`-linux`/`-darwin`/`-win32` suffix). Repo versiona apenas `-linux` (Arch local + Ubuntu CI). Contributor em outro OS deve gerar baseline próprio sem commitar.

**Local: 14/14 verde idempotente em ~12s. Full E2E: 38/38 verde em 23s (24 functional + 14 snapshots).**

---

### TODO-6 — Criar DESIGN.md formal pós-LOI (P3)

**What:** Sistema de design vive hoje implícito em `css/styles.css` (CSS variables: `--azul`, `--laranja`, `--radius`, etc). Formalizar em `DESIGN.md` com: paleta + uso, tipografia + escala, espaçamento + grid, componentes + estados (button, badge, table, modal, form, card), padrões de motion, breakpoints responsive.

**Why:** Hoje protótipo tem AI-slop tells: (a) emoji como ícones de navegação, (b) `-apple-system` como font primária ("desisti de tipografia"), (c) componentes sem documentação central. Pra escalar past 1º cliente + atrair contribuidores + permitir future redesign sem regressão, DESIGN.md vira ancora.

**Pros:**
- Permite onboarding de designer/dev futuro sem caçar CSS variables
- Identifica explicitamente AI-slop pra remover (ou aceitar) consciente
- Pre-requisito pra qualquer rewrite/redesign futuro
- Reduz "isso aqui é diferente daquilo ali" durante implementação

**Cons:**
- Plano atual preserva visual existente; DESIGN.md formaliza sem mudar
- Não tem ROI até v1 estar live + 2º cliente entrar

**Context:** Design review notou AI-slop blacklist hits #7 (emojis) e #11 (system font primary). Não bloqueia v1 (decisão consciente: não redesign agora). Mas pra v1.1+ vira dívida de identidade.

**Effort estimate:** M (human ~2 dias) → CC+gstack ~3-4h  
**Priority:** P3  
**Depends on:** v1 live + decisão de redesign (provavelmente Gate 2: 3 clientes pagantes).

---

### TODO-7 — Auditar `rpc_admin_criar_usuario` exposta a anon (P2)

**Status: RESOLVED** (2026-04-26 — durante Item 2 schema mapping)

**Veredicto:** A função NÃO é vulnerabilidade. Linhas 132-150 do `supabase/migrations/0000_initial_schema.sql`:

```sql
CREATE FUNCTION rpc_admin_criar_usuario(...) RETURNS uuid
  SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Apenas super_admins podem criar usuarios';
  END IF;
  ...
END $$;
```

O gate `is_super_admin()` é a primeira instrução do body — anon role chama, mas a função imediatamente raise se não for super_admin. GRANT EXECUTE TO anon é necessário pro PostgREST roteador encontrar a função; a autorização real está no body.

**Verificações pendentes (originalmente sob TODO-7) — irrelevantes:**
1. ~~Limites no body?~~ Não precisa — gate de privilégio é absoluto
2. ~~Rate limit Supabase Auth?~~ Default suficiente (não permite spam pre-auth)
3. ~~CAPTCHA?~~ Não aplicável (esse RPC não é signup público)
4. ~~Revogar GRANT TO anon?~~ Não — quebraria o roteamento

**Original-context:** O dump exposing GRANT TO anon parecia suspeito sem ler o body. Após mapeamento completo do schema (Item 2 phase 0), confirmado seguro.

**Completed:** 2026-04-26 (sem código mudado, audit-only).
