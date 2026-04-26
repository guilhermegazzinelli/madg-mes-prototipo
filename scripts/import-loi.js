#!/usr/bin/env node
// MADG MES — Importer Excel→Supabase pra onboarding de cliente novo (Item 8a).
//
// Uso:
//   export SUPABASE_URL=https://...
//   export SUPABASE_SERVICE_KEY=eyJ...
//   node scripts/import-loi.js <arquivo.xlsx>
//   node scripts/import-loi.js <arquivo.xlsx> --replace   # apaga empresa existente antes
//   node scripts/import-loi.js <arquivo.xlsx> --dry-run   # so' valida, nao insere
//
// Estrutura esperada do Excel (multi-sheet workbook):
//   - empresa   : nome | segmento
//   - unidades  : nome
//   - linhas    : unidade_nome | nome | descricao
//   - produtos  : codigo | descricao | unidade_medida | peso_unitario
//   - taxas     : produto_codigo | linha_nome | velocidade | unidade_velocidade
//   - motivos   : nome | tipo                                (planejada | nao_planejada | setup)
//   - turnos    : unidade_nome | nome | hora_inicio | hora_fim
//   - user      : email | senha_inicial
//
// Two-phase: valida TUDO primeiro (relata todos os erros), depois INSERT em
// transacao. ROLLBACK em qualquer falha => banco intocado em caso de erro.
//
// Filosofia (TODO-1 — Error & rescue table formal):
//   exception class                | rescued? | mensagem ao operador
//   -------------------------------|----------|--------------------------------
//   FileNotFoundError              | no       | "Arquivo nao encontrado: <path>"
//   MissingSheetError              | no       | "Sheet '<nome>' faltando no arquivo"
//   MissingColumnError             | no       | "Sheet '<sheet>' faltando coluna '<col>'"
//   InvalidCellTypeError           | no       | "Sheet '<sheet>' linha <N> coluna '<col>': esperado <tipo>, recebeu <valor>"
//   InvalidEnumValueError          | no       | "Sheet '<sheet>' linha <N> coluna '<col>': valor '<v>' nao permitido. Use: <opts>"
//   ForeignKeyViolationError       | no       | "Sheet '<sheet>' linha <N>: refere '<chave>' que nao existe em <tabela_pai>"
//   UniqueConstraintError          | no       | "Sheet '<sheet>' linha <N>: '<chave>' duplicado (ja' aparece na linha <M>)"
//   EmpresaJaImportadaError        | no       | "Empresa '<nome>' ja' existe. Use --replace pra apagar e reimportar."
//   SupabaseConnectionError        | no       | "Falha ao conectar Supabase: <detalhe>. Verifique SUPABASE_URL/SERVICE_KEY"
//   SupabaseInsertError            | yes (rollback) | "INSERT falhou em <tabela>: <detalhe>. Banco revertido."

import readXlsxFile from 'read-excel-file/node';
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// ==================================================================
// SCHEMA — definicao do que esperar em cada sheet
// ==================================================================
const SHEETS = {
  empresa: {
    columns: ['nome', 'segmento'],
    required: ['nome'],
    types: { nome: 'string', segmento: 'string' },
    minRows: 1,
    maxRows: 1, // Apenas uma empresa por arquivo
  },
  unidades: {
    columns: ['nome'],
    required: ['nome'],
    types: { nome: 'string' },
    minRows: 1,
    unique: ['nome'],
  },
  linhas: {
    columns: ['unidade_nome', 'nome', 'descricao'],
    required: ['unidade_nome', 'nome'],
    types: { unidade_nome: 'string', nome: 'string', descricao: 'string' },
    foreignKeys: [{ from: 'unidade_nome', toSheet: 'unidades', toColumn: 'nome' }],
    unique: [['unidade_nome', 'nome']], // mesma linha em outra unidade ok
  },
  produtos: {
    columns: ['codigo', 'descricao', 'unidade_medida', 'peso_unitario'],
    required: ['codigo', 'descricao'],
    types: { codigo: 'string', descricao: 'string', unidade_medida: 'string', peso_unitario: 'number?' },
    unique: ['codigo'],
  },
  taxas: {
    columns: ['produto_codigo', 'linha_nome', 'velocidade', 'unidade_velocidade'],
    required: ['produto_codigo', 'linha_nome', 'velocidade'],
    types: { produto_codigo: 'string', linha_nome: 'string', velocidade: 'number', unidade_velocidade: 'string' },
    foreignKeys: [
      { from: 'produto_codigo', toSheet: 'produtos', toColumn: 'codigo' },
      { from: 'linha_nome', toSheet: 'linhas', toColumn: 'nome' },
    ],
    unique: [['produto_codigo', 'linha_nome']],
  },
  motivos: {
    columns: ['nome', 'tipo'],
    required: ['nome', 'tipo'],
    types: { nome: 'string', tipo: 'enum:planejada,nao_planejada,setup' },
    unique: ['nome'],
  },
  turnos: {
    columns: ['unidade_nome', 'nome', 'hora_inicio', 'hora_fim'],
    required: ['unidade_nome', 'nome', 'hora_inicio', 'hora_fim'],
    types: { unidade_nome: 'string', nome: 'string', hora_inicio: 'time', hora_fim: 'time' },
    foreignKeys: [{ from: 'unidade_nome', toSheet: 'unidades', toColumn: 'nome' }],
  },
  user: {
    columns: ['email', 'senha_inicial'],
    required: ['email', 'senha_inicial'],
    types: { email: 'email', senha_inicial: 'string' },
    minRows: 1,
    maxRows: 1,
  },
};

// Ordem topologica de INSERT (parent → child)
const INSERT_ORDER = ['empresa', 'unidades', 'linhas', 'produtos', 'motivos', 'taxas', 'turnos', 'user'];

// ==================================================================
// ERROR CLASSES — uma por tipo (ver tabela no header)
// ==================================================================
class ImporterError extends Error {
  constructor(code, message, context = {}) {
    super(message);
    this.code = code;
    this.context = context;
  }
}

class ValidationErrors extends Error {
  constructor(errors) {
    super(`Validation failed: ${errors.length} error(s)`);
    this.errors = errors;
  }
}

// ==================================================================
// PARSER — le Excel multi-sheet
// ==================================================================
// read-excel-file v6+ retorna [{ sheet, data }, ...] sempre.
// Lemos uma vez, indexamos por sheet name.
async function parseWorkbook(filePath) {
  if (!existsSync(filePath)) {
    throw new ImporterError('FileNotFoundError', `Arquivo nao encontrado: ${filePath}`);
  }

  let allSheets;
  try {
    allSheets = await readXlsxFile(filePath);
  } catch (err) {
    throw new ImporterError('FileNotFoundError', `Falha ao ler ${filePath}: ${err.message}`);
  }

  // Indexa por nome
  const bySheet = Object.fromEntries(allSheets.map(s => [s.sheet, s.data]));

  // Confirma que todas as sheets esperadas estao presentes
  const data = {};
  for (const sheetName of Object.keys(SHEETS)) {
    if (!bySheet[sheetName]) {
      const available = allSheets.map(s => s.sheet).join(', ');
      throw new ImporterError('MissingSheetError',
        `Sheet '${sheetName}' nao encontrada. Sheets no arquivo: ${available}`);
    }
    if (bySheet[sheetName].length === 0) {
      throw new ImporterError('MissingSheetError', `Sheet '${sheetName}' vazia`);
    }
    data[sheetName] = bySheet[sheetName];
  }
  return data;
}

// ==================================================================
// VALIDATOR — phase 1 do two-phase
// ==================================================================
function validateWorkbook(data) {
  const errors = [];
  const parsed = {}; // sheet → array of typed objects

  for (const [sheetName, schema] of Object.entries(SHEETS)) {
    const rows = data[sheetName];
    const headers = rows[0]; // Linha 1 = header
    const dataRows = rows.slice(1).filter(r => r.some(cell => cell != null && cell !== '')); // ignora rows vazias

    // 1) Header check
    for (const expected of schema.columns) {
      if (!headers.includes(expected)) {
        errors.push({
          sheet: sheetName, line: 1, code: 'MissingColumnError',
          message: `Sheet '${sheetName}' faltando coluna '${expected}'. Headers atuais: ${headers.join(', ')}`,
        });
      }
    }
    if (errors.length) continue; // sem headers, nao da pra continuar

    const colIdx = Object.fromEntries(schema.columns.map(c => [c, headers.indexOf(c)]));

    // 2) Row count
    if (schema.minRows && dataRows.length < schema.minRows) {
      errors.push({
        sheet: sheetName, line: null, code: 'NotEnoughRowsError',
        message: `Sheet '${sheetName}' tem ${dataRows.length} rows, esperado >= ${schema.minRows}`,
      });
    }
    if (schema.maxRows && dataRows.length > schema.maxRows) {
      errors.push({
        sheet: sheetName, line: null, code: 'TooManyRowsError',
        message: `Sheet '${sheetName}' tem ${dataRows.length} rows, esperado <= ${schema.maxRows}`,
      });
    }

    // 3) Per-row type/required/enum checks
    const typedRows = [];
    dataRows.forEach((row, idx) => {
      const lineNum = idx + 2; // +1 pelo header, +1 pra contar 1-indexed
      const obj = {};

      for (const col of schema.columns) {
        const val = row[colIdx[col]];

        // Required check
        if ((schema.required || []).includes(col)) {
          if (val == null || val === '') {
            errors.push({
              sheet: sheetName, line: lineNum, code: 'RequiredFieldMissingError',
              message: `Sheet '${sheetName}' linha ${lineNum}: coluna '${col}' obrigatoria, vazia`,
            });
            continue;
          }
        }

        // Type check
        const type = schema.types[col];
        const typeError = validateType(val, type);
        if (typeError && val != null && val !== '') {
          errors.push({
            sheet: sheetName, line: lineNum, code: 'InvalidCellTypeError',
            message: `Sheet '${sheetName}' linha ${lineNum} coluna '${col}': ${typeError} (recebido: ${JSON.stringify(val)})`,
          });
          continue;
        }

        obj[col] = val;
      }
      typedRows.push({ ...obj, _line: lineNum });
    });
    parsed[sheetName] = typedRows;

    // 4) UNIQUE checks
    for (const uniqueDef of schema.unique || []) {
      const cols = Array.isArray(uniqueDef) ? uniqueDef : [uniqueDef];
      const seen = new Map();
      for (const r of typedRows) {
        const key = cols.map(c => r[c]).join('|');
        if (seen.has(key)) {
          errors.push({
            sheet: sheetName, line: r._line, code: 'UniqueConstraintError',
            message: `Sheet '${sheetName}' linha ${r._line}: ${cols.join('+')}=${key} duplicado (ja aparece na linha ${seen.get(key)})`,
          });
        } else {
          seen.set(key, r._line);
        }
      }
    }
  }

  // 5) FK checks (depois de todas as sheets parseadas)
  for (const [sheetName, schema] of Object.entries(SHEETS)) {
    if (!schema.foreignKeys) continue;
    for (const fk of schema.foreignKeys) {
      const validKeys = new Set((parsed[fk.toSheet] || []).map(r => r[fk.toColumn]));
      for (const r of (parsed[sheetName] || [])) {
        if (r[fk.from] != null && !validKeys.has(r[fk.from])) {
          errors.push({
            sheet: sheetName, line: r._line, code: 'ForeignKeyViolationError',
            message: `Sheet '${sheetName}' linha ${r._line}: ${fk.from}='${r[fk.from]}' nao existe em ${fk.toSheet}.${fk.toColumn}`,
          });
        }
      }
    }
  }

  if (errors.length) throw new ValidationErrors(errors);
  return parsed;
}

function validateType(val, type) {
  if (val == null || val === '') {
    if (type.endsWith('?')) return null; // optional
    return null; // pra required, ja foi capturado em RequiredFieldMissingError
  }
  const baseType = type.replace('?', '');

  if (baseType === 'string') {
    if (typeof val !== 'string') return `esperado string`;
  } else if (baseType === 'number') {
    if (typeof val !== 'number' || isNaN(val)) return `esperado numero`;
  } else if (baseType === 'time') {
    if (typeof val !== 'string' || !/^\d{1,2}:\d{2}$/.test(val)) return `esperado time HH:MM`;
  } else if (baseType === 'email') {
    if (typeof val !== 'string' || !val.includes('@')) return `esperado email valido`;
  } else if (baseType.startsWith('enum:')) {
    const allowed = baseType.substring(5).split(',');
    if (!allowed.includes(val)) return `valor '${val}' nao permitido. Use: ${allowed.join(' | ')}`;
  }
  return null;
}

// ==================================================================
// DELETE CASCADE — remove empresa + tudo que aponta pra ela
// ==================================================================
// Schema (0000) NAO declara ON DELETE CASCADE em FKs que referenciam
// empresa. Precisamos deletar children em ordem topologica reversa.
//
// Cascades existentes (do schema) que ajudam:
//   linhas.unidade_id    → ON DELETE CASCADE
//   turnos.unidade_id    → ON DELETE CASCADE
//   taxas.produto_id     → ON DELETE CASCADE
//   taxas.linha_id       → ON DELETE CASCADE
//   paradas.ordem_id     → ON DELETE CASCADE
//
// Ordem: ordens (cascada paradas) → user_empresa → motivos →
// produtos (cascada taxas via produto) → unidades (cascada linhas,
// turnos, taxas via linha) → empresa.
async function deleteEmpresaCascade(supabase, empresaId) {
  // Coleta unidade_ids pra delete de ordens (que referenciam unidade_id)
  const { data: unidades } = await supabase
    .from('unidades').select('id').eq('empresa_id', empresaId);
  const unidadeIds = (unidades || []).map(u => u.id);

  // Coleta user_ids vinculados (pra delete em auth.users tambem)
  const { data: links } = await supabase
    .from('user_empresa').select('user_id').eq('empresa_id', empresaId);
  const userIds = (links || []).map(l => l.user_id);

  const steps = [
    // 1. ordens_producao (cascada paradas via ordem_id)
    unidadeIds.length > 0
      ? () => supabase.from('ordens_producao').delete().in('unidade_id', unidadeIds)
      : null,
    // 2. user_empresa (FK pra empresa)
    () => supabase.from('user_empresa').delete().eq('empresa_id', empresaId),
    // 3. motivos_parada (FK pra empresa)
    () => supabase.from('motivos_parada').delete().eq('empresa_id', empresaId),
    // 4. produtos (cascada taxas via produto_id)
    () => supabase.from('produtos').delete().eq('empresa_id', empresaId),
    // 5. unidades (cascada linhas, turnos; cascada taxas remanescentes via linha_id)
    () => supabase.from('unidades').delete().eq('empresa_id', empresaId),
    // 6. empresa
    () => supabase.from('empresa').delete().eq('id', empresaId),
  ].filter(Boolean);

  for (const step of steps) {
    const { error } = await step();
    if (error) throw new ImporterError('SupabaseInsertError',
      `Falha durante cascade delete: ${error.message}`);
  }

  // 7. Auth users (best-effort: se falhar, deixa orfao em auth.users)
  for (const userId of userIds) {
    try { await supabase.auth.admin.deleteUser(userId); } catch {}
  }
}

// ==================================================================
// INSERTER — phase 2 do two-phase (transacao manual via cascade cleanup)
// ==================================================================
async function insertWorkbook(parsed, supabase, opts = {}) {
  return await insertWorkbookInternal(parsed, supabase, opts).catch(async (err) => {
    // Auto-cleanup em caso de falha mid-insert: se ja temos empresa_id,
    // remove a empresa parcial. Mantem promessa de "all-or-nothing" do
    // ponto de vista do operador.
    if (err.partialEmpresaId) {
      console.error(`\n  [auto-cleanup] removendo empresa parcial ${err.partialEmpresaId}`);
      try {
        await deleteEmpresaCascade(supabase, err.partialEmpresaId);
        console.error(`  [auto-cleanup] OK — banco intocado`);
      } catch (cleanupErr) {
        console.error(`  [auto-cleanup] FALHOU: ${cleanupErr.message}`);
        console.error(`  Manual: rode \`scripts/rollback-loi-${err.partialEmpresaId.slice(0, 8)}.sql\` ou use --replace na proxima tentativa.`);
      }
    }
    throw err;
  });
}

async function insertWorkbookInternal(parsed, supabase, opts = {}) {
  const empresaNome = parsed.empresa[0].nome;

  // Pre-check: empresa ja existe?
  const { data: existing, error: checkErr } = await supabase
    .from('empresa')
    .select('id, nome')
    .eq('nome', empresaNome)
    .maybeSingle();

  if (checkErr) {
    throw new ImporterError('SupabaseConnectionError', `Falha ao verificar empresa existente: ${checkErr.message}`);
  }

  if (existing && !opts.replace) {
    throw new ImporterError('EmpresaJaImportadaError',
      `Empresa '${empresaNome}' ja existe (id=${existing.id}). Use --replace pra apagar e reimportar.`);
  }

  if (existing && opts.replace) {
    await deleteEmpresaCascade(supabase, existing.id);
    console.log(`  [replace] empresa antiga (${existing.id}) e dependencias deletadas`);
  }

  const insertedIds = {
    empresa: null,
    unidades: new Map(), // nome → id
    linhas: new Map(),   // nome → id
    produtos: new Map(), // codigo → id
    motivos: new Map(),  // nome → id
    user: null,
  };

  // 1) INSERT empresa (devolve id)
  const empresa = parsed.empresa[0];
  const { data: empData, error: empErr } = await supabase
    .from('empresa')
    .insert({ nome: empresa.nome, segmento: empresa.segmento || 'Outro' })
    .select('id')
    .single();
  if (empErr) throw new ImporterError('SupabaseInsertError', `INSERT empresa: ${empErr.message}`);
  insertedIds.empresa = empData.id;
  console.log(`  empresa: ${empresa.nome} (${empData.id})`);

  // A partir daqui, qualquer falha precisa de auto-cleanup (delete empresa).
  // Wrapper try/catch anota o empresaId no error pra wrapper externo limpar.
  try {

  // 2) INSERT unidades
  for (const u of parsed.unidades) {
    const { data, error } = await supabase
      .from('unidades')
      .insert({ empresa_id: insertedIds.empresa, nome: u.nome })
      .select('id').single();
    if (error) throw new ImporterError('SupabaseInsertError', `INSERT unidade '${u.nome}': ${error.message}`);
    insertedIds.unidades.set(u.nome, data.id);
  }
  console.log(`  unidades: ${insertedIds.unidades.size}`);

  // 3) INSERT linhas
  for (const l of parsed.linhas) {
    const { data, error } = await supabase
      .from('linhas')
      .insert({
        unidade_id: insertedIds.unidades.get(l.unidade_nome),
        nome: l.nome,
        descricao: l.descricao || null,
      })
      .select('id').single();
    if (error) throw new ImporterError('SupabaseInsertError', `INSERT linha '${l.nome}' em '${l.unidade_nome}': ${error.message}`);
    insertedIds.linhas.set(l.nome, data.id);
  }
  console.log(`  linhas: ${insertedIds.linhas.size}`);

  // 4) INSERT produtos
  for (const p of parsed.produtos) {
    const { data, error } = await supabase
      .from('produtos')
      .insert({
        empresa_id: insertedIds.empresa,
        codigo: p.codigo,
        descricao: p.descricao,
        unidade_medida: p.unidade_medida || 'kg',
        peso_unitario: p.peso_unitario || null,
      })
      .select('id').single();
    if (error) throw new ImporterError('SupabaseInsertError', `INSERT produto '${p.codigo}': ${error.message}`);
    insertedIds.produtos.set(p.codigo, data.id);
  }
  console.log(`  produtos: ${insertedIds.produtos.size}`);

  // 5) INSERT motivos
  for (const m of parsed.motivos) {
    const { data, error } = await supabase
      .from('motivos_parada')
      .insert({ empresa_id: insertedIds.empresa, nome: m.nome, tipo: m.tipo })
      .select('id').single();
    if (error) throw new ImporterError('SupabaseInsertError', `INSERT motivo '${m.nome}': ${error.message}`);
    insertedIds.motivos.set(m.nome, data.id);
  }
  console.log(`  motivos: ${insertedIds.motivos.size}`);

  // 6) INSERT taxas
  for (const t of parsed.taxas) {
    const { error } = await supabase.from('taxas_producao').insert({
      produto_id: insertedIds.produtos.get(t.produto_codigo),
      linha_id: insertedIds.linhas.get(t.linha_nome),
      velocidade: t.velocidade,
      unidade_velocidade: t.unidade_velocidade || 'un/h',
    });
    if (error) throw new ImporterError('SupabaseInsertError',
      `INSERT taxa ${t.produto_codigo}+${t.linha_nome}: ${error.message}`);
  }
  console.log(`  taxas: ${parsed.taxas.length}`);

  // 7) INSERT turnos
  for (const t of parsed.turnos || []) {
    const { error } = await supabase.from('turnos').insert({
      unidade_id: insertedIds.unidades.get(t.unidade_nome),
      nome: t.nome,
      hora_inicio: t.hora_inicio,
      hora_fim: t.hora_fim,
    });
    if (error) throw new ImporterError('SupabaseInsertError',
      `INSERT turno '${t.nome}': ${error.message}`);
  }
  console.log(`  turnos: ${(parsed.turnos || []).length}`);

  // 8) Cria user em auth.users + vincula via user_empresa
  const userInfo = parsed.user[0];
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: userInfo.email,
    password: userInfo.senha_inicial,
    email_confirm: true,
  });
  if (authErr) throw new ImporterError('SupabaseInsertError', `Auth createUser: ${authErr.message}`);
  insertedIds.user = authData.user.id;

  const { error: linkErr } = await supabase.from('user_empresa').insert({
    user_id: authData.user.id,
    empresa_id: insertedIds.empresa,
    papel: 'admin',
  });
  if (linkErr) throw new ImporterError('SupabaseInsertError', `INSERT user_empresa: ${linkErr.message}`);
  console.log(`  user: ${userInfo.email} (${authData.user.id})`);

  return insertedIds;

  } catch (err) {
    // Anota empresaId pro auto-cleanup wrapper
    err.partialEmpresaId = insertedIds.empresa;
    throw err;
  }
}

// ==================================================================
// MAIN — CLI entry point
// ==================================================================
async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find(a => !a.startsWith('--'));
  const replace = args.includes('--replace');
  const dryRun = args.includes('--dry-run');

  if (!filePath) {
    console.error('Uso: node scripts/import-loi.js <arquivo.xlsx> [--replace] [--dry-run]');
    process.exit(1);
  }

  console.log(`\n→ Importando ${resolve(filePath)}`);
  if (dryRun) console.log('  [dry-run] sem alterar banco');
  if (replace) console.log('  [replace] empresa existente sera apagada antes');

  // Phase 0: Parse
  let data;
  try {
    data = await parseWorkbook(filePath);
  } catch (err) {
    if (err instanceof ImporterError) {
      console.error(`\n✗ ${err.code}: ${err.message}`);
      process.exit(2);
    }
    throw err;
  }

  // Phase 1: Validate (todos os erros de uma vez)
  let parsed;
  try {
    parsed = validateWorkbook(data);
  } catch (err) {
    if (err instanceof ValidationErrors) {
      console.error(`\n✗ Validacao falhou (${err.errors.length} erros):\n`);
      for (const e of err.errors) {
        console.error(`  [${e.code}] ${e.message}`);
      }
      console.error(`\nCorrija o Excel e rode de novo.`);
      process.exit(3);
    }
    throw err;
  }

  console.log(`\n✓ Validacao OK:`);
  for (const sheet of INSERT_ORDER) {
    if (parsed[sheet]) console.log(`  ${sheet}: ${parsed[sheet].length} rows`);
  }

  if (dryRun) {
    console.log('\n[dry-run] Skipping insert. Rode sem --dry-run pra aplicar.');
    process.exit(0);
  }

  // Phase 2: Insert
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('\n✗ SUPABASE_URL e SUPABASE_SERVICE_KEY obrigatorios em env vars');
    process.exit(4);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log(`\n→ Inserindo em ${url}`);
  try {
    const ids = await insertWorkbook(parsed, supabase, { replace });
    console.log(`\n✓ Import concluido. empresa_id = ${ids.empresa}`);
  } catch (err) {
    if (err instanceof ImporterError) {
      console.error(`\n✗ ${err.code}: ${err.message}`);
      // Mensagem so' relevante quando INSERT comecou (tem partialEmpresaId).
      // Pre-flight errors (EmpresaJaImportadaError, SupabaseConnectionError)
      // nao deixam state intermediario — auto-cleanup ja rodou se aplicavel.
      process.exit(5);
    }
    throw err;
  }
}

// Apenas roda main() se executado como CLI (nao como import)
// pathToFileURL trata espaços/caracteres especiais corretamente.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error('\n✗ Erro inesperado:', err);
    process.exit(99);
  });
}

// Exports pra tests
export { parseWorkbook, validateWorkbook, insertWorkbook, ImporterError, ValidationErrors, SHEETS };
