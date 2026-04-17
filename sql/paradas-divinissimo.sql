-- =============================================================================
-- MADG MES — Dados detalhados de paradas para Divinissimo Alimentos
-- Rodar APOS seed.sql
-- Distribui os tempos declarados nas ordens em eventos individuais realistas
-- =============================================================================

DO $$
DECLARE
  v_ord UUID;

  -- Linhas (IDs fixos do seed)
  ln_unica  UUID := '20000000-0000-0000-0000-000000000001';
  ln_01     UUID := '20000000-0000-0000-0000-000000000010';
  ln_02     UUID := '20000000-0000-0000-0000-000000000011';
  ln_11     UUID := '20000000-0000-0000-0000-000000000014';

  -- Motivos de parada (IDs fixos do seed)
  m_quebra      UUID := '40000000-0000-0000-0000-000000000001';  -- nao_planejada
  m_setup       UUID := '40000000-0000-0000-0000-000000000002';  -- setup
  m_material    UUID := '40000000-0000-0000-0000-000000000003';  -- nao_planejada
  m_operador    UUID := '40000000-0000-0000-0000-000000000004';  -- nao_planejada
  m_limpeza     UUID := '40000000-0000-0000-0000-000000000005';  -- planejada
  m_refeicao    UUID := '40000000-0000-0000-0000-000000000006';  -- planejada
  m_preventiva  UUID := '40000000-0000-0000-0000-000000000007';  -- planejada
  m_qualidade   UUID := '40000000-0000-0000-0000-000000000008';  -- nao_planejada
  m_energia     UUID := '40000000-0000-0000-0000-000000000009';  -- nao_planejada
  m_ajuste      UUID := '40000000-0000-0000-0000-000000000010';  -- setup

BEGIN

  -- =====================================================================
  -- ORDEM 1: 2026-04-01 | Fabrica PDQ | Linha Unica | PdQ Hora Forno 800G
  -- 05:50–16:09 | planejado=60  setup=0  parada=0
  -- =====================================================================
  SELECT id INTO v_ord FROM ordens_producao
    WHERE data = '2026-04-01' AND linha_id = ln_unica AND hora_inicio = '05:50';

  INSERT INTO paradas (ordem_id, linha_id, hora_inicio, hora_fim, motivo_id, descricao) VALUES
    (v_ord, ln_unica, '11:30', '12:30', m_refeicao, 'Almoco equipe');

  -- =====================================================================
  -- ORDEM 2: 2026-04-07 | Fabrica PDQ | Linha Unica | PdQ Hora Forno 800G
  -- 05:55–16:16 | planejado=58  setup=0  parada=10
  -- =====================================================================
  SELECT id INTO v_ord FROM ordens_producao
    WHERE data = '2026-04-07' AND linha_id = ln_unica AND hora_inicio = '05:55';

  INSERT INTO paradas (ordem_id, linha_id, hora_inicio, hora_fim, motivo_id, descricao) VALUES
    (v_ord, ln_unica, '11:32', '12:30', m_refeicao, 'Almoco equipe'),
    (v_ord, ln_unica, '14:20', '14:30', m_quebra,   'Rolamento esteira transportadora travou');

  -- =====================================================================
  -- ORDEM 3: 2026-04-08 | Fabrica PDQ | Linha Unica | PdQ Trad 800G
  -- 05:50–16:14 | planejado=56  setup=0  parada=6
  -- =====================================================================
  SELECT id INTO v_ord FROM ordens_producao
    WHERE data = '2026-04-08' AND linha_id = ln_unica AND hora_inicio = '05:50';

  INSERT INTO paradas (ordem_id, linha_id, hora_inicio, hora_fim, motivo_id, descricao) VALUES
    (v_ord, ln_unica, '11:34', '12:30', m_refeicao,   'Almoco equipe'),
    (v_ord, ln_unica, '09:15', '09:21', m_qualidade,   'Massa com textura irregular — ajuste na mistura');

  -- =====================================================================
  -- ORDEM 4: 2026-04-09 | Fabrica PDQ | Linha Unica | PdQ Hora Forno 800G
  -- 05:50–14:56 | planejado=50  setup=0  parada=0
  -- =====================================================================
  SELECT id INTO v_ord FROM ordens_producao
    WHERE data = '2026-04-09' AND linha_id = ln_unica AND hora_inicio = '05:50';

  INSERT INTO paradas (ordem_id, linha_id, hora_inicio, hora_fim, motivo_id, descricao) VALUES
    (v_ord, ln_unica, '11:30', '12:20', m_refeicao, 'Almoco equipe — turno reduzido');

  -- =====================================================================
  -- ORDEM 5: 2026-04-14 manha | Fabrica PDQ | Linha Unica | PdQ Palito 800G
  -- 05:50–08:08 | planejado=0  setup=20  parada=3
  -- =====================================================================
  SELECT id INTO v_ord FROM ordens_producao
    WHERE data = '2026-04-14' AND linha_id = ln_unica AND hora_inicio = '05:50';

  INSERT INTO paradas (ordem_id, linha_id, hora_inicio, hora_fim, motivo_id, descricao) VALUES
    (v_ord, ln_unica, '05:50', '06:10', m_setup,    'Troca de formato para palito'),
    (v_ord, ln_unica, '07:30', '07:33', m_material,  'Aguardando polvilho do estoque');

  -- =====================================================================
  -- ORDEM 6: 2026-04-14 tarde | Fabrica PDQ | Linha Unica | PdQ Trad 800G
  -- 08:28–15:35 | planejado=0  setup=0  parada=36
  -- =====================================================================
  SELECT id INTO v_ord FROM ordens_producao
    WHERE data = '2026-04-14' AND linha_id = ln_unica AND hora_inicio = '08:28';

  INSERT INTO paradas (ordem_id, linha_id, hora_inicio, hora_fim, motivo_id, descricao) VALUES
    (v_ord, ln_unica, '10:15', '10:40', m_quebra,     'Cilindro laminador desalinhado — manutencao corretiva'),
    (v_ord, ln_unica, '13:50', '14:01', m_qualidade,   'Produto fora do peso — recalibracao balanca');

  -- =====================================================================
  -- ORDEM 7: 2026-04-01 | Fabrica Salgados | Linha 02 | Escondidinho
  -- 07:57–11:10 | planejado=0  setup=0  parada=32
  -- =====================================================================
  SELECT id INTO v_ord FROM ordens_producao
    WHERE data = '2026-04-01' AND linha_id = ln_02 AND hora_inicio = '07:57';

  INSERT INTO paradas (ordem_id, linha_id, hora_inicio, hora_fim, motivo_id, descricao) VALUES
    (v_ord, ln_02, '08:30', '08:50', m_material,   'Atraso entrega carne desfiada do fornecedor'),
    (v_ord, ln_02, '10:00', '10:12', m_operador,   'Operador do selador saiu para exame medico');

  -- =====================================================================
  -- ORDEM 8: 2026-04-01 | Fabrica Salgados | Linha 01 | Coxinha
  -- 09:36–14:19 | planejado=120  setup=0  parada=36
  -- =====================================================================
  SELECT id INTO v_ord FROM ordens_producao
    WHERE data = '2026-04-01' AND linha_id = ln_01 AND hora_inicio = '09:36';

  INSERT INTO paradas (ordem_id, linha_id, hora_inicio, hora_fim, motivo_id, descricao) VALUES
    -- Planejadas (120 min total)
    (v_ord, ln_01, '09:36', '10:06', m_preventiva, 'Lubrificacao e inspecao programada enchedora'),
    (v_ord, ln_01, '11:30', '12:30', m_refeicao,   'Almoco equipe salgados'),
    (v_ord, ln_01, '13:00', '13:30', m_limpeza,     'Sanitizacao obrigatoria — norma ANVISA'),
    -- Nao planejadas (36 min total)
    (v_ord, ln_01, '10:30', '10:50', m_quebra,      'Bico formador de coxinha entupiu'),
    (v_ord, ln_01, '14:00', '14:16', m_energia,     'Queda de energia parcial — disjuntor secao B');

  -- =====================================================================
  -- ORDEM 9: 2026-04-07 | Fabrica Salgados | Linha 1.1 | Coxinha
  -- 07:52–14:19 | planejado=0  setup=0  parada=85
  -- =====================================================================
  SELECT id INTO v_ord FROM ordens_producao
    WHERE data = '2026-04-07' AND linha_id = ln_11 AND hora_inicio = '07:52';

  INSERT INTO paradas (ordem_id, linha_id, hora_inicio, hora_fim, motivo_id, descricao) VALUES
    (v_ord, ln_11, '09:00', '09:45', m_quebra,     'Motor principal superaqueceu — substituicao de correia'),
    (v_ord, ln_11, '11:30', '11:50', m_material,   'Falta de massa pronta — misturador atrasou'),
    (v_ord, ln_11, '13:00', '13:20', m_qualidade,  'Coxinhas abrindo no oleo — ajuste ponto da massa');

END $$;

-- =====================================================================
-- Resumo dos dados gerados:
--
-- 19 eventos de parada distribuidos em 9 ordens
--
-- Por motivo:
--   Quebra mecanica ......... 4x  (100 min) — TOP causa no Pareto
--   Intervalo/Refeicao ...... 5x  (284 min) — maior volume planejado
--   Falta de material ....... 3x   (43 min)
--   Problema de qualidade ... 3x   (37 min)
--   Limpeza ................. 1x   (30 min)
--   Manutencao preventiva ... 1x   (30 min)
--   Falta de operador ....... 1x   (12 min)
--   Falta de energia ........ 1x   (16 min)
--   Setup / Troca ........... 1x   (20 min)
--   Ajuste de maquina ....... 0x
--
-- Por tipo:
--   nao_planejada ........... 12 eventos (208 min)
--   planejada ...............  7 eventos (344 min)
--   setup ...................  1 evento   (20 min)
--
-- Pareto esperado (nao planejadas):
--   1. Quebra mecanica    100 min  48%  (acum 48%)
--   2. Falta de material   43 min  21%  (acum 69%)
--   3. Problema qualidade  37 min  18%  (acum 87%) ← passa 80% aqui
--   4. Falta de energia    16 min   8%  (acum 94%)
--   5. Falta de operador   12 min   6%  (acum 100%)
-- =====================================================================
