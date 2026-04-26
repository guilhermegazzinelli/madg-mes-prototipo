// MADG MES — Tests pro importer Excel→Supabase (Item 8a).
//
// Cobre as 5 categorias de erro do TODO-1 + validacao do sample fixture:
//   (a) MissingSheetError / MissingColumnError — Excel mal formatado
//   (b) InvalidCellTypeError — tipo de celula errado
//   (c) ForeignKeyViolationError — refs entre sheets
//   (d) UniqueConstraintError — duplicata de chave natural
//   (e) Network / Supabase errors — testaveis manualmente (DB integration)
//
// Tests rodam apenas validacao (phase 1 do two-phase) — nao tocam DB.
// Insert engine validado via smoke run manual (documented em README).

import { describe, it, expect } from 'vitest';
import { parseWorkbook, validateWorkbook, ValidationErrors, SHEETS } from '../scripts/import-loi.js';
import { resolve } from 'node:path';

const SAMPLE = resolve(process.cwd(), 'data/loi-sample.xlsx');

// Helper: builds a valid raw data dict (rows=arrays) covering all required sheets.
// Tests mutam este baseline pra introduzir erros especificos.
function makeValidWorkbookData() {
  return {
    empresa: [
      ['nome', 'segmento'],
      ['Test Co', 'Outro'],
    ],
    unidades: [
      ['nome'],
      ['Fab 1'],
    ],
    linhas: [
      ['unidade_nome', 'nome', 'descricao'],
      ['Fab 1', 'L01', 'Linha 1'],
    ],
    produtos: [
      ['codigo', 'descricao', 'unidade_medida', 'peso_unitario'],
      ['P-001', 'Produto Um', 'kg', 1.0],
      ['P-002', 'Produto Dois', 'un', 0.5],
    ],
    taxas: [
      ['produto_codigo', 'linha_nome', 'velocidade', 'unidade_velocidade'],
      ['P-001', 'L01', 100, 'un/h'],
    ],
    motivos: [
      ['nome', 'tipo'],
      ['Quebra', 'nao_planejada'],
    ],
    turnos: [
      ['unidade_nome', 'nome', 'hora_inicio', 'hora_fim'],
      ['Fab 1', 'Turno 1', '06:00', '14:00'],
    ],
    user: [
      ['email', 'senha_inicial'],
      ['admin@test.local', 'temp-2026-pwd'],
    ],
  };
}

describe('importer — schema definition', () => {
  it('exporta as 8 sheets esperadas', () => {
    const sheetNames = Object.keys(SHEETS);
    expect(sheetNames).toEqual([
      'empresa', 'unidades', 'linhas', 'produtos',
      'taxas', 'motivos', 'turnos', 'user',
    ]);
  });

  it('cada sheet tem columns + types definidos', () => {
    for (const [name, schema] of Object.entries(SHEETS)) {
      expect(schema.columns).toBeInstanceOf(Array);
      expect(schema.columns.length).toBeGreaterThan(0);
      expect(schema.types).toBeInstanceOf(Object);
    }
  });
});

describe('importer — validacao OK do baseline valido', () => {
  it('makeValidWorkbookData passa validacao limpa', () => {
    const data = makeValidWorkbookData();
    const parsed = validateWorkbook(data);
    expect(parsed.empresa).toHaveLength(1);
    expect(parsed.empresa[0].nome).toBe('Test Co');
    expect(parsed.produtos).toHaveLength(2);
  });
});

// ====================================================================
// CATEGORIA (a): Excel mal formatado — sheet ausente OU coluna ausente
// ====================================================================
describe('TODO-1 (a) — MissingColumnError', () => {
  it('falha quando coluna obrigatoria some do header', () => {
    const data = makeValidWorkbookData();
    // Remove "segmento" de empresa headers
    data.empresa = [['nome'], ['Test Co']];

    expect(() => validateWorkbook(data)).toThrow(ValidationErrors);
    try { validateWorkbook(data); } catch (e) {
      expect(e.errors[0].code).toBe('MissingColumnError');
      expect(e.errors[0].message).toContain('segmento');
    }
  });

  it('falha em multiple sheets — reporta TODOS de uma vez', () => {
    const data = makeValidWorkbookData();
    data.unidades = [['errado'], ['Fab 1']];     // header errado
    data.produtos = [['codigo'], ['P-001']];     // falta descricao+unidade_medida+peso

    try {
      validateWorkbook(data);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationErrors);
      const codes = e.errors.map(x => x.code);
      expect(codes).toContain('MissingColumnError');
      // Multiplas sheets reportam erros — TODO-1 explicitly: "show ALL errors at once"
      const sheets = new Set(e.errors.map(x => x.sheet));
      expect(sheets.size).toBeGreaterThanOrEqual(2);
    }
  });
});

// ====================================================================
// CATEGORIA (b): InvalidCellTypeError — tipo errado em celula
// ====================================================================
describe('TODO-1 (b) — InvalidCellTypeError', () => {
  it('peso_unitario com texto em vez de numero', () => {
    const data = makeValidWorkbookData();
    data.produtos = [
      ['codigo', 'descricao', 'unidade_medida', 'peso_unitario'],
      ['P-001', 'Produto', 'kg', 'NAO-EH-NUMERO'],
    ];

    expect(() => validateWorkbook(data)).toThrow(ValidationErrors);
    try { validateWorkbook(data); } catch (e) {
      const err = e.errors.find(x => x.code === 'InvalidCellTypeError');
      expect(err).toBeDefined();
      expect(err.message).toContain('peso_unitario');
      expect(err.message).toContain('numero');
    }
  });

  it('motivo.tipo com valor fora do enum', () => {
    const data = makeValidWorkbookData();
    data.motivos = [
      ['nome', 'tipo'],
      ['X', 'tipo-invalido-qualquer'],
    ];

    try {
      validateWorkbook(data);
      throw new Error('should have thrown');
    } catch (e) {
      const err = e.errors.find(x => x.code === 'InvalidCellTypeError');
      expect(err).toBeDefined();
      expect(err.message).toContain('planejada | nao_planejada | setup');
    }
  });

  it('hora_inicio com formato errado (nao HH:MM)', () => {
    const data = makeValidWorkbookData();
    data.turnos = [
      ['unidade_nome', 'nome', 'hora_inicio', 'hora_fim'],
      ['Fab 1', 'Turno', '6h', '14:00'],
    ];

    try { validateWorkbook(data); throw new Error('should have thrown'); } catch (e) {
      const err = e.errors.find(x => x.code === 'InvalidCellTypeError');
      expect(err).toBeDefined();
      expect(err.message).toContain('HH:MM');
    }
  });
});

// ====================================================================
// CATEGORIA (c): ForeignKeyViolationError
// ====================================================================
describe('TODO-1 (c) — ForeignKeyViolationError', () => {
  it('linha referencia unidade que nao existe', () => {
    const data = makeValidWorkbookData();
    data.linhas = [
      ['unidade_nome', 'nome', 'descricao'],
      ['Unidade Fantasma', 'L01', 'orphan'],
    ];

    try { validateWorkbook(data); throw new Error('should have thrown'); } catch (e) {
      const err = e.errors.find(x => x.code === 'ForeignKeyViolationError');
      expect(err).toBeDefined();
      expect(err.message).toContain('Unidade Fantasma');
      expect(err.message).toContain('unidades');
    }
  });

  it('taxa referencia produto E linha — ambos com 1 erro cada', () => {
    const data = makeValidWorkbookData();
    data.taxas = [
      ['produto_codigo', 'linha_nome', 'velocidade', 'unidade_velocidade'],
      ['P-FANTASMA', 'L01', 100, 'un/h'],     // produto FK fail
      ['P-001', 'L-FANTASMA', 100, 'un/h'],   // linha FK fail
    ];

    try { validateWorkbook(data); throw new Error('should have thrown'); } catch (e) {
      const fkErrors = e.errors.filter(x => x.code === 'ForeignKeyViolationError');
      expect(fkErrors.length).toBe(2);
    }
  });
});

// ====================================================================
// CATEGORIA (d): UniqueConstraintError
// ====================================================================
describe('TODO-1 (d) — UniqueConstraintError', () => {
  it('produto codigo duplicado', () => {
    const data = makeValidWorkbookData();
    data.produtos = [
      ['codigo', 'descricao', 'unidade_medida', 'peso_unitario'],
      ['P-001', 'Primeiro', 'kg', 1.0],
      ['P-001', 'Duplicado', 'un', 0.5],
    ];

    try { validateWorkbook(data); throw new Error('should have thrown'); } catch (e) {
      const err = e.errors.find(x => x.code === 'UniqueConstraintError');
      expect(err).toBeDefined();
      expect(err.message).toContain('P-001');
      expect(err.message).toContain('linha 2');  // primeira ocorrencia
    }
  });

  it('taxa (produto, linha) composto duplicado', () => {
    const data = makeValidWorkbookData();
    data.taxas = [
      ['produto_codigo', 'linha_nome', 'velocidade', 'unidade_velocidade'],
      ['P-001', 'L01', 100, 'un/h'],
      ['P-001', 'L01', 200, 'kg/h'],   // duplicado
    ];

    try { validateWorkbook(data); throw new Error('should have thrown'); } catch (e) {
      const err = e.errors.find(x => x.code === 'UniqueConstraintError');
      expect(err).toBeDefined();
      expect(err.message).toContain('produto_codigo+linha_nome');
    }
  });
});

// ====================================================================
// CATEGORIA (e): Network / Supabase errors — documented, testable manualmente
// ====================================================================
// Cobertura desses casos vive na propria insertWorkbook que captura
// errors do client supabase-js e re-throw como SupabaseInsertError. Pra
// testar fim-a-fim precisaria de um mock de Supabase ou um real Supabase
// local — mais escopo que esse PR. Smoke test manual cobre o happy path.
//
// Pre-cond auto-cleanup garante que falha mid-INSERT remove a empresa
// parcialmente inserida — testamos manualmente:
//   1. Run inicial: importa OK
//   2. Run com mesma empresa: falha com EmpresaJaImportadaError
//   3. Run com --replace: cascade-delete + reimport limpo
//
// Cobertura validada manualmente em local Supabase Docker stack.

// ====================================================================
// Sample fixture parse test (end-to-end leitura de Excel real)
// ====================================================================
describe('importer — sample fixture (Excel real)', () => {
  it('data/loi-sample.xlsx parse + validate sem erros', async () => {
    const data = await parseWorkbook(SAMPLE);
    const parsed = validateWorkbook(data);

    expect(parsed.empresa[0].nome).toBe('HAOMA Chocolates');
    expect(parsed.unidades).toHaveLength(1);
    expect(parsed.linhas).toHaveLength(2);
    expect(parsed.produtos).toHaveLength(8);
    expect(parsed.taxas).toHaveLength(8);
    expect(parsed.motivos).toHaveLength(8);
    expect(parsed.turnos).toHaveLength(3);
    expect(parsed.user[0].email).toBe('admin@haoma.local');
  });
});
