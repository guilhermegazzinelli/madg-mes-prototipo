#!/usr/bin/env node
// MADG MES — Gerador do sample fixture pro importer.
//
// Roda apenas uma vez (e em CI quando dados de exemplo precisam ser refrescados).
// Output: data/loi-sample.xlsx
//
// Uso: node scripts/generate-sample-xlsx.js
//
// Os dados sao baseados em sql/exemplo-haoma.sql (HAOMA Chocolates).
// Operadores duplicam esse arquivo e editam pro proximo cliente.

import writeXlsxFile from 'write-excel-file/node';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'data', 'loi-sample.xlsx');

mkdirSync(dirname(OUT), { recursive: true });

// Helper: schema HEADER row + DATA rows -> formato write-excel-file
function sheet(headers, rows) {
  return [
    headers.map(h => ({ value: h, fontWeight: 'bold' })),
    ...rows.map(row => headers.map(h => ({ value: row[h] ?? null }))),
  ];
}

const SHEETS = {
  empresa: sheet(
    ['nome', 'segmento'],
    [{ nome: 'HAOMA Chocolates', segmento: 'Alimentos' }],
  ),
  unidades: sheet(
    ['nome'],
    [{ nome: 'Fabrica Sao Paulo' }],
  ),
  linhas: sheet(
    ['unidade_nome', 'nome', 'descricao'],
    [
      { unidade_nome: 'Fabrica Sao Paulo', nome: 'Linha 01 - Nuage', descricao: 'Envase de marshmallow em lata e pouch' },
      { unidade_nome: 'Fabrica Sao Paulo', nome: 'Linha 02 - Confeitos', descricao: 'Producao de bombons, pacocas e biscottinos' },
    ],
  ),
  produtos: sheet(
    ['codigo', 'descricao', 'unidade_medida', 'peso_unitario'],
    [
      { codigo: 'NUAGE-TRAD-120',  descricao: 'Nuage Tradicional Lata 120g',           unidade_medida: 'un', peso_unitario: 0.120 },
      { codigo: 'NUAGE-FV-120',    descricao: 'Nuage Frutas Vermelhas Lata 120g',      unidade_medida: 'un', peso_unitario: 0.120 },
      { codigo: 'NUAGE-MAR-120',   descricao: 'Nuage Maracuja Lata 120g',              unidade_medida: 'un', peso_unitario: 0.120 },
      { codigo: 'NUAGE-TRAD-180',  descricao: 'Nuage Tradicional Pouch 180g',          unidade_medida: 'un', peso_unitario: 0.180 },
      { codigo: 'BOMBOM-AVEL-80',  descricao: 'Bombom Avela Pack 80g',                 unidade_medida: 'un', peso_unitario: 0.080 },
      { codigo: 'BOMBOM-AMEND-80', descricao: 'Bombom Amendoim Pack 80g',              unidade_medida: 'un', peso_unitario: 0.080 },
      { codigo: 'PACOCA-CHOC-112', descricao: 'Pacoca Chocolate 56% 112,5g',           unidade_medida: 'un', peso_unitario: 0.1125 },
      { codigo: 'BISCOTT-CHOC-84', descricao: 'Biscottino Chocolate 56% 84g',          unidade_medida: 'un', peso_unitario: 0.084 },
    ],
  ),
  taxas: sheet(
    ['produto_codigo', 'linha_nome', 'velocidade', 'unidade_velocidade'],
    [
      { produto_codigo: 'NUAGE-TRAD-120',  linha_nome: 'Linha 01 - Nuage',     velocidade: 800, unidade_velocidade: 'un/h' },
      { produto_codigo: 'NUAGE-FV-120',    linha_nome: 'Linha 01 - Nuage',     velocidade: 800, unidade_velocidade: 'un/h' },
      { produto_codigo: 'NUAGE-MAR-120',   linha_nome: 'Linha 01 - Nuage',     velocidade: 800, unidade_velocidade: 'un/h' },
      { produto_codigo: 'NUAGE-TRAD-180',  linha_nome: 'Linha 01 - Nuage',     velocidade: 500, unidade_velocidade: 'un/h' },
      { produto_codigo: 'BOMBOM-AVEL-80',  linha_nome: 'Linha 02 - Confeitos', velocidade: 600, unidade_velocidade: 'un/h' },
      { produto_codigo: 'BOMBOM-AMEND-80', linha_nome: 'Linha 02 - Confeitos', velocidade: 600, unidade_velocidade: 'un/h' },
      { produto_codigo: 'PACOCA-CHOC-112', linha_nome: 'Linha 02 - Confeitos', velocidade: 450, unidade_velocidade: 'un/h' },
      { produto_codigo: 'BISCOTT-CHOC-84', linha_nome: 'Linha 02 - Confeitos', velocidade: 700, unidade_velocidade: 'un/h' },
    ],
  ),
  motivos: sheet(
    ['nome', 'tipo'],
    [
      { nome: 'Setup / Troca de sabor',      tipo: 'setup' },
      { nome: 'Troca de embalagem',          tipo: 'setup' },
      { nome: 'Falta de cobertura',          tipo: 'nao_planejada' },
      { nome: 'Falta de embalagem primaria', tipo: 'nao_planejada' },
      { nome: 'Quebra mecanica',             tipo: 'nao_planejada' },
      { nome: 'Limpeza entre lotes',         tipo: 'planejada' },
      { nome: 'Sanitizacao',                 tipo: 'planejada' },
      { nome: 'Manutencao preventiva',       tipo: 'planejada' },
    ],
  ),
  turnos: sheet(
    ['unidade_nome', 'nome', 'hora_inicio', 'hora_fim'],
    [
      { unidade_nome: 'Fabrica Sao Paulo', nome: '1o Turno',       hora_inicio: '06:00', hora_fim: '14:00' },
      { unidade_nome: 'Fabrica Sao Paulo', nome: '2o Turno',       hora_inicio: '14:00', hora_fim: '22:00' },
      { unidade_nome: 'Fabrica Sao Paulo', nome: 'Administrativo', hora_inicio: '08:00', hora_fim: '18:00' },
    ],
  ),
  user: sheet(
    ['email', 'senha_inicial'],
    [{ email: 'admin@haoma.local', senha_inicial: 'haoma-temp-2026' }],
  ),
};

// API v4 Node: writeExcelFile(...).toFile(path)
const sheetsData = Object.entries(SHEETS).map(([name, data]) => ({
  data,
  sheet: name,
}));

await writeXlsxFile(sheetsData).toFile(OUT);

console.log(`✓ Sample gerado em ${OUT}`);
