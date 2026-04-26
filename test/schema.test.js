// Schema invariants — guarda contra regressão silenciosa quando o dump
// for re-capturado ou migrations futuras forem aplicadas.
//
// Estes testes leem o arquivo do schema diretamente (não conectam ao DB).
// Não substituem o cross-tenant test (Item 2 do plano), só protegem
// contra "dump perdeu uma tabela" e "pg_dump 17 metacomandos voltaram".

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCHEMA_PATH = resolve(process.cwd(), 'supabase/migrations/0000_initial_schema.sql');
const AUDIT_PATH  = resolve(process.cwd(), 'supabase/migrations/0001_audit_log.sql');
const SEED_PATH   = resolve(process.cwd(), 'supabase/seed.sql');

const schema = readFileSync(SCHEMA_PATH, 'utf-8');
const audit  = readFileSync(AUDIT_PATH,  'utf-8');
const seed   = readFileSync(SEED_PATH,   'utf-8');

describe('Schema migration — tabelas operacionais', () => {
  // Lista derivada do design doc + super-admin schema.
  // Se uma destas sumir do dump, é regressão crítica.
  const TABELAS_ESPERADAS = [
    'empresa',
    'user_empresa',
    'super_admins',
    'super_admin_context',
    'unidades',
    'linhas',
    'produtos',
    'taxas_producao',
    'motivos_parada',
    'turnos',
    'ordens_producao',
    'paradas',
  ];

  it.each(TABELAS_ESPERADAS)('contém tabela "%s"', (tabela) => {
    const re = new RegExp(`CREATE TABLE\\s+(IF NOT EXISTS\\s+)?"public"\\."${tabela}"`);
    expect(schema).toMatch(re);
  });

  it('tem exatamente 12 tabelas no schema public (initial migration)', () => {
    const matches = schema.match(/^CREATE TABLE\s+(IF NOT EXISTS\s+)?"public"\."[^"]+"/gm) || [];
    expect(matches.length).toBe(12);
  });
});

describe('Migration 0001 — audit_log infrastructure', () => {
  // 0001_audit_log adiciona trilha de auditoria com triggers AFTER em todas
  // as 12 tabelas mutáveis + acted_as_super_admin pra rastrear impersonacao.

  const TABELAS_AUDITADAS = [
    'empresa',
    'linhas',
    'motivos_parada',
    'ordens_producao',
    'paradas',
    'produtos',
    'super_admin_context',
    'super_admins',
    'taxas_producao',
    'turnos',
    'unidades',
    'user_empresa',
  ];

  it('cria tabela public.audit_log', () => {
    expect(audit).toMatch(/CREATE\s+TABLE\s+(IF NOT EXISTS\s+)?public\.audit_log/i);
  });

  it('audit_log tem coluna acted_as_super_admin (rastreio de impersonacao)', () => {
    expect(audit).toMatch(/acted_as_super_admin\s+boolean/i);
  });

  it('audit_log forca FORCE ROW LEVEL SECURITY (não basta ENABLE)', () => {
    expect(audit).toMatch(/audit_log\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
  });

  it('audit_log permite SELECT mas bloqueia INSERT/UPDATE/DELETE direto', () => {
    // Apenas a function log_audit (SECURITY DEFINER) deve escrever.
    // Só esperamos UMA policy: audit_log_select.
    const policies = audit.match(/CREATE POLICY\s+\w+\s+ON\s+public\.audit_log/g) || [];
    expect(policies.length).toBe(1);
    expect(audit).toMatch(/CREATE POLICY\s+audit_log_select/);
  });

  it('function log_audit é SECURITY DEFINER (bypassa RLS pra escrever)', () => {
    expect(audit).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.log_audit[\s\S]*?SECURITY\s+DEFINER/i);
  });

  it.each(TABELAS_AUDITADAS)('trigger trg_audit_%s instalado', (tabela) => {
    const re = new RegExp(`CREATE TRIGGER trg_audit_${tabela}\\s+AFTER`, 'i');
    expect(audit).toMatch(re);
  });

  it('cobre 12 tabelas mutáveis (1 trigger por tabela)', () => {
    const matches = audit.match(/CREATE TRIGGER\s+trg_audit_\w+/g) || [];
    expect(matches.length).toBe(12);
  });
});

describe('Schema migration — segurança multi-tenant', () => {
  it('FORCE ROW LEVEL SECURITY habilitado (não basta ENABLE)', () => {
    // FORCE garante que owner não bypassa RLS. Crítico pra multi-tenant.
    expect(schema).toMatch(/FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
  });

  it('função auth_empresa_id existe (base de toda RLS policy)', () => {
    expect(schema).toMatch(/CREATE\s+(OR REPLACE\s+)?FUNCTION\s+"public"\."auth_empresa_id"/);
  });

  it('função is_super_admin existe (gate de super-admin)', () => {
    expect(schema).toMatch(/CREATE\s+(OR REPLACE\s+)?FUNCTION\s+"public"\."is_super_admin"/);
  });

  it('anti-lockout trigger preserva último super-admin', () => {
    // super-admin.sql cria função prevent_last_super_admin_delete().
    // Se sumir do dump, super-admins podem ser todos deletados, lockout permanente.
    expect(schema).toMatch(/prevent_last_super_admin_delete/);
  });
});

describe('Schema migration — limpo de pg_dump 17 metacommands', () => {
  // pg_dump 17+ adiciona \restrict / \unrestrict no topo. Esses são
  // metacomandos psql, NÃO SQL. supabase db reset falha se voltarem.
  // Workflow de strip está documentado em CLAUDE.md / checkpoint.

  it('não tem \\restrict residual', () => {
    expect(schema).not.toMatch(/^\\restrict\s/m);
  });

  it('não tem \\unrestrict residual', () => {
    expect(schema).not.toMatch(/^\\unrestrict\s/m);
  });

  it('não tem outros metacomandos psql no início de linha', () => {
    // Lista de metacomandos psql conhecidos que pg_dump pode emitir.
    // \set é OK (é meta mas o Postgres aceita via SET ...).
    // Bloqueia: \connect, \c, \restrict, \unrestrict, \i, \include
    const proibidos = /^\\(connect|c|restrict|unrestrict|i|include)\s/m;
    expect(schema).not.toMatch(proibidos);
  });
});

describe('Seed local — empresas demo', () => {
  // Seed precisa ter as 4 empresas pra cross-tenant test (Item 2)
  // ter dados determinísticos.
  const EMPRESAS_ESPERADAS = [
    'Divinissimo Alimentos',
    'Metalurgica Exemplo',
    'ColorTech Pigmentos',
    'VitroMax Vidros',
  ];

  it.each(EMPRESAS_ESPERADAS)('seed contém empresa "%s"', (empresa) => {
    expect(seed).toContain(`'${empresa}'`);
  });

  it('cria 5 usuários auth com domínio @madg.local', () => {
    const matches = seed.match(/@madg\.local/g) || [];
    // 5 users × (1 INSERT em auth.users + 1 INSERT em auth.identities com 2 refs no JSONB)
    // Exato count tolerante: pelo menos 5, mais é OK
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  it('seed declara que senha aparece só em local Docker', () => {
    // Sanity check: header do seed avisa sobre o hardcoded password.
    // Se alguém remover esse aviso, é code smell.
    expect(seed).toMatch(/madglocal2026.*local Docker|local Docker.*madglocal2026/is);
  });
});
