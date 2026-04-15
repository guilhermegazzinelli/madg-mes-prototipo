-- ============================================================
-- MADG MES — Correcao RLS + Empresas Demo (Pigmentos e Vidro)
-- Rodar no SQL Editor do Supabase
-- ============================================================

-- ============================================================
-- PARTE 1: CORRIGIR RLS (forcar habilitacao em todas as tabelas)
-- ============================================================

-- Dropar policies antigas (se existirem) e recriar
DO $$ BEGIN
  -- empresa
  DROP POLICY IF EXISTS "empresa_select" ON empresa;
  DROP POLICY IF EXISTS "allow_all" ON empresa;
  -- user_empresa
  DROP POLICY IF EXISTS "user_empresa_select" ON user_empresa;
  -- unidades
  DROP POLICY IF EXISTS "unidades_select" ON unidades;
  DROP POLICY IF EXISTS "unidades_insert" ON unidades;
  DROP POLICY IF EXISTS "unidades_update" ON unidades;
  DROP POLICY IF EXISTS "unidades_delete" ON unidades;
  -- produtos
  DROP POLICY IF EXISTS "produtos_select" ON produtos;
  DROP POLICY IF EXISTS "produtos_insert" ON produtos;
  DROP POLICY IF EXISTS "produtos_update" ON produtos;
  DROP POLICY IF EXISTS "produtos_delete" ON produtos;
  -- motivos_parada
  DROP POLICY IF EXISTS "motivos_select" ON motivos_parada;
  DROP POLICY IF EXISTS "motivos_insert" ON motivos_parada;
  DROP POLICY IF EXISTS "motivos_update" ON motivos_parada;
  DROP POLICY IF EXISTS "motivos_delete" ON motivos_parada;
  -- linhas
  DROP POLICY IF EXISTS "linhas_select" ON linhas;
  DROP POLICY IF EXISTS "linhas_insert" ON linhas;
  DROP POLICY IF EXISTS "linhas_update" ON linhas;
  DROP POLICY IF EXISTS "linhas_delete" ON linhas;
  -- turnos
  DROP POLICY IF EXISTS "turnos_select" ON turnos;
  DROP POLICY IF EXISTS "turnos_insert" ON turnos;
  DROP POLICY IF EXISTS "turnos_update" ON turnos;
  DROP POLICY IF EXISTS "turnos_delete" ON turnos;
  -- taxas_producao
  DROP POLICY IF EXISTS "taxas_select" ON taxas_producao;
  DROP POLICY IF EXISTS "taxas_insert" ON taxas_producao;
  DROP POLICY IF EXISTS "taxas_update" ON taxas_producao;
  DROP POLICY IF EXISTS "taxas_delete" ON taxas_producao;
  -- ordens_producao
  DROP POLICY IF EXISTS "ordens_select" ON ordens_producao;
  DROP POLICY IF EXISTS "ordens_insert" ON ordens_producao;
  DROP POLICY IF EXISTS "ordens_update" ON ordens_producao;
  DROP POLICY IF EXISTS "ordens_delete" ON ordens_producao;
  -- paradas
  DROP POLICY IF EXISTS "paradas_select" ON paradas;
  DROP POLICY IF EXISTS "paradas_insert" ON paradas;
  DROP POLICY IF EXISTS "paradas_delete" ON paradas;
END $$;

-- Recriar funcao helper
CREATE OR REPLACE FUNCTION auth_empresa_id()
RETURNS UUID AS $$
  SELECT empresa_id FROM public.user_empresa WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- HABILITAR RLS em todas as tabelas
ALTER TABLE empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE motivos_parada ENABLE ROW LEVEL SECURITY;
ALTER TABLE linhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxas_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordens_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE paradas ENABLE ROW LEVEL SECURITY;

-- Forcar RLS tambem para o owner da tabela (sem isso, superuser/owner bypassa)
ALTER TABLE empresa FORCE ROW LEVEL SECURITY;
ALTER TABLE user_empresa FORCE ROW LEVEL SECURITY;
ALTER TABLE unidades FORCE ROW LEVEL SECURITY;
ALTER TABLE produtos FORCE ROW LEVEL SECURITY;
ALTER TABLE motivos_parada FORCE ROW LEVEL SECURITY;
ALTER TABLE linhas FORCE ROW LEVEL SECURITY;
ALTER TABLE turnos FORCE ROW LEVEL SECURITY;
ALTER TABLE taxas_producao FORCE ROW LEVEL SECURITY;
ALTER TABLE ordens_producao FORCE ROW LEVEL SECURITY;
ALTER TABLE paradas FORCE ROW LEVEL SECURITY;

-- POLICIES: empresa
CREATE POLICY "empresa_select" ON empresa FOR SELECT
  USING (id = auth_empresa_id());

-- POLICIES: user_empresa
CREATE POLICY "user_empresa_select" ON user_empresa FOR SELECT
  USING (user_id = auth.uid());

-- POLICIES: unidades
CREATE POLICY "unidades_select" ON unidades FOR SELECT
  USING (empresa_id = auth_empresa_id());
CREATE POLICY "unidades_insert" ON unidades FOR INSERT
  WITH CHECK (empresa_id = auth_empresa_id());
CREATE POLICY "unidades_update" ON unidades FOR UPDATE
  USING (empresa_id = auth_empresa_id());
CREATE POLICY "unidades_delete" ON unidades FOR DELETE
  USING (empresa_id = auth_empresa_id());

-- POLICIES: produtos
CREATE POLICY "produtos_select" ON produtos FOR SELECT
  USING (empresa_id = auth_empresa_id());
CREATE POLICY "produtos_insert" ON produtos FOR INSERT
  WITH CHECK (empresa_id = auth_empresa_id());
CREATE POLICY "produtos_update" ON produtos FOR UPDATE
  USING (empresa_id = auth_empresa_id());
CREATE POLICY "produtos_delete" ON produtos FOR DELETE
  USING (empresa_id = auth_empresa_id());

-- POLICIES: motivos_parada
CREATE POLICY "motivos_select" ON motivos_parada FOR SELECT
  USING (empresa_id = auth_empresa_id());
CREATE POLICY "motivos_insert" ON motivos_parada FOR INSERT
  WITH CHECK (empresa_id = auth_empresa_id());
CREATE POLICY "motivos_update" ON motivos_parada FOR UPDATE
  USING (empresa_id = auth_empresa_id());
CREATE POLICY "motivos_delete" ON motivos_parada FOR DELETE
  USING (empresa_id = auth_empresa_id());

-- POLICIES: linhas (via unidade -> empresa)
CREATE POLICY "linhas_select" ON linhas FOR SELECT
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "linhas_insert" ON linhas FOR INSERT
  WITH CHECK (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "linhas_update" ON linhas FOR UPDATE
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "linhas_delete" ON linhas FOR DELETE
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));

-- POLICIES: turnos (via unidade -> empresa)
CREATE POLICY "turnos_select" ON turnos FOR SELECT
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "turnos_insert" ON turnos FOR INSERT
  WITH CHECK (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "turnos_update" ON turnos FOR UPDATE
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "turnos_delete" ON turnos FOR DELETE
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));

-- POLICIES: taxas_producao (via produto -> empresa)
CREATE POLICY "taxas_select" ON taxas_producao FOR SELECT
  USING (produto_id IN (SELECT id FROM produtos WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "taxas_insert" ON taxas_producao FOR INSERT
  WITH CHECK (produto_id IN (SELECT id FROM produtos WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "taxas_update" ON taxas_producao FOR UPDATE
  USING (produto_id IN (SELECT id FROM produtos WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "taxas_delete" ON taxas_producao FOR DELETE
  USING (produto_id IN (SELECT id FROM produtos WHERE empresa_id = auth_empresa_id()));

-- POLICIES: ordens_producao (via unidade -> empresa)
CREATE POLICY "ordens_select" ON ordens_producao FOR SELECT
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "ordens_insert" ON ordens_producao FOR INSERT
  WITH CHECK (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "ordens_update" ON ordens_producao FOR UPDATE
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "ordens_delete" ON ordens_producao FOR DELETE
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));

-- POLICIES: paradas (via ordem -> unidade -> empresa)
CREATE POLICY "paradas_select" ON paradas FOR SELECT
  USING (ordem_id IN (SELECT id FROM ordens_producao WHERE unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id())));
CREATE POLICY "paradas_insert" ON paradas FOR INSERT
  WITH CHECK (ordem_id IN (SELECT id FROM ordens_producao WHERE unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id())));
CREATE POLICY "paradas_delete" ON paradas FOR DELETE
  USING (ordem_id IN (SELECT id FROM ordens_producao WHERE unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id())));

-- Verificar resultado
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;


-- ============================================================
-- PARTE 2: EMPRESA 3 — ColorTech Pigmentos
-- ============================================================

INSERT INTO empresa (id, nome, segmento) VALUES
  ('00000000-0000-0000-0000-000000000003', 'ColorTech Pigmentos', 'Quimico');

-- Unidades
INSERT INTO unidades (id, empresa_id, nome) VALUES
  ('10000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000003', 'Planta Dispersao'),
  ('10000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000003', 'Planta Moagem');

-- Linhas
INSERT INTO linhas (id, unidade_id, nome, descricao) VALUES
  -- Dispersao
  ('20000000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000030', 'Dispersor D-01', 'Dispersor de alta rotacao 500L'),
  ('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000030', 'Dispersor D-02', 'Dispersor de alta rotacao 1000L'),
  ('20000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000030', 'Envase E-01', 'Linha de envase automatica'),
  -- Moagem
  ('20000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000031', 'Moinho M-01', 'Moinho de esferas horizontal'),
  ('20000000-0000-0000-0000-000000000034', '10000000-0000-0000-0000-000000000031', 'Moinho M-02', 'Moinho de esferas vertical');

-- Produtos (pigmentos)
INSERT INTO produtos (id, empresa_id, codigo, descricao, unidade_medida, peso_unitario) VALUES
  ('30000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000003', 'PG-AZ-001', 'Pigmento Azul Ftalocianina', 'kg', NULL),
  ('30000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000003', 'PG-VM-002', 'Pigmento Vermelho Oxido de Ferro', 'kg', NULL),
  ('30000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000003', 'PG-AM-003', 'Pigmento Amarelo Cromato', 'kg', NULL),
  ('30000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000003', 'PG-BR-004', 'Pigmento Branco Dioxido Titanio', 'kg', NULL),
  ('30000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000003', 'PG-PT-005', 'Pigmento Preto Negro Fumo', 'kg', NULL),
  ('30000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000003', 'DS-AZ-010', 'Dispersao Azul Concentrada 50%', 'litros', NULL),
  ('30000000-0000-0000-0000-000000000036', '00000000-0000-0000-0000-000000000003', 'DS-VM-011', 'Dispersao Vermelha Concentrada 45%', 'litros', NULL),
  ('30000000-0000-0000-0000-000000000037', '00000000-0000-0000-0000-000000000003', 'DS-BR-012', 'Dispersao Branca TiO2 60%', 'litros', NULL);

-- Taxas de producao (kg/h ou litros/h)
INSERT INTO taxas_producao (produto_id, linha_id, velocidade, unidade_velocidade) VALUES
  -- Moagem de pigmentos (kg/h)
  ('30000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000033', 85, 'kg/h'),
  ('30000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000034', 110, 'kg/h'),
  ('30000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000033', 120, 'kg/h'),
  ('30000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000034', 150, 'kg/h'),
  ('30000000-0000-0000-0000-000000000032', '20000000-0000-0000-0000-000000000033', 95, 'kg/h'),
  ('30000000-0000-0000-0000-000000000033', '20000000-0000-0000-0000-000000000033', 200, 'kg/h'),
  ('30000000-0000-0000-0000-000000000033', '20000000-0000-0000-0000-000000000034', 250, 'kg/h'),
  ('30000000-0000-0000-0000-000000000034', '20000000-0000-0000-0000-000000000034', 180, 'kg/h'),
  -- Dispersao (litros/h)
  ('30000000-0000-0000-0000-000000000035', '20000000-0000-0000-0000-000000000030', 320, 'kg/h'),
  ('30000000-0000-0000-0000-000000000035', '20000000-0000-0000-0000-000000000031', 580, 'kg/h'),
  ('30000000-0000-0000-0000-000000000036', '20000000-0000-0000-0000-000000000030', 290, 'kg/h'),
  ('30000000-0000-0000-0000-000000000036', '20000000-0000-0000-0000-000000000031', 520, 'kg/h'),
  ('30000000-0000-0000-0000-000000000037', '20000000-0000-0000-0000-000000000031', 600, 'kg/h'),
  -- Envase
  ('30000000-0000-0000-0000-000000000035', '20000000-0000-0000-0000-000000000032', 450, 'kg/h'),
  ('30000000-0000-0000-0000-000000000036', '20000000-0000-0000-0000-000000000032', 450, 'kg/h'),
  ('30000000-0000-0000-0000-000000000037', '20000000-0000-0000-0000-000000000032', 500, 'kg/h');

-- Motivos de parada
INSERT INTO motivos_parada (empresa_id, nome, tipo) VALUES
  ('00000000-0000-0000-0000-000000000003', 'Limpeza de moinho', 'planejada'),
  ('00000000-0000-0000-0000-000000000003', 'Troca de cor (flush)', 'setup'),
  ('00000000-0000-0000-0000-000000000003', 'Troca de esferas', 'planejada'),
  ('00000000-0000-0000-0000-000000000003', 'Entupimento de peneira', 'nao_planejada'),
  ('00000000-0000-0000-0000-000000000003', 'Falta de materia-prima', 'nao_planejada'),
  ('00000000-0000-0000-0000-000000000003', 'Ajuste de viscosidade', 'setup'),
  ('00000000-0000-0000-0000-000000000003', 'Quebra de selo mecanico', 'nao_planejada'),
  ('00000000-0000-0000-0000-000000000003', 'Intervalo', 'planejada');

-- Turnos
INSERT INTO turnos (unidade_id, nome, hora_inicio, hora_fim) VALUES
  ('10000000-0000-0000-0000-000000000030', '1o Turno', '06:00', '14:00'),
  ('10000000-0000-0000-0000-000000000030', '2o Turno', '14:00', '22:00'),
  ('10000000-0000-0000-0000-000000000031', '1o Turno', '06:00', '14:00');

-- Ordens de producao (abril 2026)
INSERT INTO ordens_producao (unidade_id, linha_id, produto_id, data, hora_inicio, hora_fim, velocidade_padrao, tempo_planejado, tempo_setup, tempo_parada, qtd_produzida, qtd_rejeitada, qtd_reprocesso, observacao) VALUES
  -- 01/abr - Moagem Azul no M-01
  ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000033', '30000000-0000-0000-0000-000000000030',
   '2026-04-01', '06:00', '14:00', 85, 60, 30, 15, 395, 12, 5, 'Batelada azul ftalocianina - granulometria ok'),
  -- 01/abr - Dispersao Azul no D-02
  ('10000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000035',
   '2026-04-01', '08:00', '15:30', 580, 45, 20, 0, 3890, 45, 0, 'Dispersao concentrada 50% azul'),
  -- 02/abr - Moagem Vermelho no M-02
  ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000034', '30000000-0000-0000-0000-000000000031',
   '2026-04-02', '06:00', '13:00', 150, 60, 45, 20, 585, 8, 15, 'Oxido de ferro - lote grande'),
  -- 02/abr - Envase
  ('10000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000032', '30000000-0000-0000-0000-000000000035',
   '2026-04-02', '06:30', '12:00', 450, 30, 15, 10, 2100, 30, 0, 'Envase baldes 20L azul'),
  -- 03/abr - Branco TiO2 moagem
  ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000034', '30000000-0000-0000-0000-000000000033',
   '2026-04-03', '06:00', '14:00', 250, 60, 15, 25, 1420, 18, 30, 'TiO2 rutilo - dispersao dificil'),
  -- 03/abr - Dispersao Branca
  ('10000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000037',
   '2026-04-03', '07:00', '14:30', 600, 45, 30, 10, 3050, 25, 0, 'Dispersao TiO2 60%'),
  -- 07/abr - Preto negro fumo
  ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000034', '30000000-0000-0000-0000-000000000034',
   '2026-04-07', '06:00', '12:00', 180, 45, 60, 0, 660, 5, 10, 'Negro fumo - setup longo (flush de cor)'),
  -- 07/abr - Dispersao Vermelha D-01
  ('10000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000030', '30000000-0000-0000-0000-000000000036',
   '2026-04-07', '06:00', '13:00', 290, 60, 25, 15, 1280, 20, 0, 'Dispersao vermelha concentrada 45%'),
  -- 08/abr - Amarelo
  ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000033', '30000000-0000-0000-0000-000000000032',
   '2026-04-08', '06:00', '14:00', 95, 60, 20, 30, 450, 15, 8, 'Cromato amarelo - controle de finura'),
  -- 09/abr - Branco + Envase
  ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000033', '30000000-0000-0000-0000-000000000033',
   '2026-04-09', '06:00', '14:00', 200, 60, 10, 20, 1260, 10, 20, 'TiO2 segundo lote'),
  ('10000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000032', '30000000-0000-0000-0000-000000000037',
   '2026-04-09', '07:00', '15:00', 500, 30, 10, 15, 3200, 40, 0, 'Envase dispersao branca tambores'),
  -- 14/abr - Dia completo
  ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000034', '30000000-0000-0000-0000-000000000030',
   '2026-04-14', '06:00', '14:00', 110, 60, 20, 40, 480, 22, 8, 'Azul ftalocianina M-02 - problema peneira'),
  ('10000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000030', '30000000-0000-0000-0000-000000000036',
   '2026-04-14', '06:00', '14:00', 290, 60, 15, 25, 1350, 18, 0, 'Dispersao vermelha');


-- ============================================================
-- PARTE 3: EMPRESA 4 — VitroMax Vidros
-- ============================================================

INSERT INTO empresa (id, nome, segmento) VALUES
  ('00000000-0000-0000-0000-000000000004', 'VitroMax Vidros', 'Vidro');

-- Unidades
INSERT INTO unidades (id, empresa_id, nome) VALUES
  ('10000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000004', 'Forno e Conformacao'),
  ('10000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000004', 'Beneficiamento');

-- Linhas
INSERT INTO linhas (id, unidade_id, nome, descricao) VALUES
  -- Forno e Conformacao
  ('20000000-0000-0000-0000-000000000040', '10000000-0000-0000-0000-000000000040', 'Forno F-01', 'Forno de fusao 50 ton/dia'),
  ('20000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000040', 'Float Line', 'Banho de estanho + recozimento'),
  ('20000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000040', 'Corte Primario', 'Corte automatico de chapas'),
  -- Beneficiamento
  ('20000000-0000-0000-0000-000000000043', '10000000-0000-0000-0000-000000000041', 'Tempera T-01', 'Forno de tempera horizontal'),
  ('20000000-0000-0000-0000-000000000044', '10000000-0000-0000-0000-000000000041', 'Lapidacao L-01', 'Retifica bilateral'),
  ('20000000-0000-0000-0000-000000000045', '10000000-0000-0000-0000-000000000041', 'Serigrafia S-01', 'Impressao serigrafada');

-- Produtos (vidros)
INSERT INTO produtos (id, empresa_id, codigo, descricao, unidade_medida, peso_unitario) VALUES
  ('30000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000004', 'VF-INC-4', 'Vidro Float Incolor 4mm', 'un', 10.0),
  ('30000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000004', 'VF-INC-6', 'Vidro Float Incolor 6mm', 'un', 15.0),
  ('30000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000004', 'VF-INC-8', 'Vidro Float Incolor 8mm', 'un', 20.0),
  ('30000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000004', 'VF-VD-6', 'Vidro Float Verde 6mm', 'un', 15.0),
  ('30000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000004', 'VT-INC-6', 'Vidro Temperado Incolor 6mm', 'un', 15.0),
  ('30000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000004', 'VT-INC-8', 'Vidro Temperado Incolor 8mm', 'un', 20.0),
  ('30000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000004', 'VL-INC-4', 'Vidro Lapidado Incolor 4mm', 'un', 10.0),
  ('30000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000000004', 'VS-SER-6', 'Vidro Serigrafado 6mm', 'un', 15.0);

-- Taxas de producao (un/h = chapas por hora)
INSERT INTO taxas_producao (produto_id, linha_id, velocidade, unidade_velocidade) VALUES
  -- Float Line (chapas grandes por hora)
  ('30000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000041', 45, 'un/h'),
  ('30000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000041', 30, 'un/h'),
  ('30000000-0000-0000-0000-000000000042', '20000000-0000-0000-0000-000000000041', 22, 'un/h'),
  ('30000000-0000-0000-0000-000000000043', '20000000-0000-0000-0000-000000000041', 28, 'un/h'),
  -- Corte Primario
  ('30000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000042', 120, 'un/h'),
  ('30000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000042', 100, 'un/h'),
  ('30000000-0000-0000-0000-000000000042', '20000000-0000-0000-0000-000000000042', 80, 'un/h'),
  -- Tempera
  ('30000000-0000-0000-0000-000000000044', '20000000-0000-0000-0000-000000000043', 40, 'un/h'),
  ('30000000-0000-0000-0000-000000000045', '20000000-0000-0000-0000-000000000043', 32, 'un/h'),
  -- Lapidacao
  ('30000000-0000-0000-0000-000000000046', '20000000-0000-0000-0000-000000000044', 55, 'un/h'),
  -- Serigrafia
  ('30000000-0000-0000-0000-000000000047', '20000000-0000-0000-0000-000000000045', 25, 'un/h');

-- Motivos de parada
INSERT INTO motivos_parada (empresa_id, nome, tipo) VALUES
  ('00000000-0000-0000-0000-000000000004', 'Troca de espessura', 'setup'),
  ('00000000-0000-0000-0000-000000000004', 'Troca de cor do vidro', 'setup'),
  ('00000000-0000-0000-0000-000000000004', 'Quebra no banho de estanho', 'nao_planejada'),
  ('00000000-0000-0000-0000-000000000004', 'Defeito de superficie (bolha)', 'nao_planejada'),
  ('00000000-0000-0000-0000-000000000004', 'Manutencao de refratario', 'planejada'),
  ('00000000-0000-0000-0000-000000000004', 'Troca de disco de corte', 'setup'),
  ('00000000-0000-0000-0000-000000000004', 'Quebra na tempera', 'nao_planejada'),
  ('00000000-0000-0000-0000-000000000004', 'Limpeza da tela serigrafica', 'planejada'),
  ('00000000-0000-0000-0000-000000000004', 'Ajuste de alinhamento', 'setup'),
  ('00000000-0000-0000-0000-000000000004', 'Intervalo', 'planejada');

-- Turnos (24h - forno nao para)
INSERT INTO turnos (unidade_id, nome, hora_inicio, hora_fim) VALUES
  ('10000000-0000-0000-0000-000000000040', 'Turno A', '06:00', '14:00'),
  ('10000000-0000-0000-0000-000000000040', 'Turno B', '14:00', '22:00'),
  ('10000000-0000-0000-0000-000000000040', 'Turno C', '22:00', '06:00'),
  ('10000000-0000-0000-0000-000000000041', 'Comercial', '07:00', '17:00');

-- Ordens de producao (abril 2026)
INSERT INTO ordens_producao (unidade_id, linha_id, produto_id, data, hora_inicio, hora_fim, velocidade_padrao, tempo_planejado, tempo_setup, tempo_parada, qtd_produzida, qtd_rejeitada, qtd_reprocesso, observacao) VALUES
  -- 01/abr - Float + Corte incolor 4mm
  ('10000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000041', '30000000-0000-0000-0000-000000000040',
   '2026-04-01', '06:00', '14:00', 45, 30, 0, 15, 300, 8, 0, 'Float 4mm incolor - turno A'),
  ('10000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000042', '30000000-0000-0000-0000-000000000040',
   '2026-04-01', '07:00', '15:00', 120, 30, 10, 5, 845, 22, 0, 'Corte primario 4mm'),
  ('10000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000044', '30000000-0000-0000-0000-000000000046',
   '2026-04-01', '07:00', '17:00', 55, 60, 15, 20, 375, 12, 0, 'Lapidacao pecas sob medida'),
  -- 02/abr - Float 6mm + Tempera
  ('10000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000041', '30000000-0000-0000-0000-000000000041',
   '2026-04-02', '06:00', '14:00', 30, 30, 20, 10, 180, 5, 0, 'Float 6mm - troca de espessura'),
  ('10000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000043', '30000000-0000-0000-0000-000000000044',
   '2026-04-02', '07:00', '16:00', 40, 60, 10, 25, 255, 18, 0, 'Tempera 6mm - 18 quebras no forno'),
  -- 03/abr - Float 8mm + Corte
  ('10000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000041', '30000000-0000-0000-0000-000000000042',
   '2026-04-03', '06:00', '14:00', 22, 30, 15, 20, 125, 4, 0, 'Float 8mm incolor'),
  ('10000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000042', '30000000-0000-0000-0000-000000000042',
   '2026-04-03', '07:00', '14:00', 80, 30, 10, 0, 440, 10, 0, 'Corte 8mm - poucas paradas'),
  -- 07/abr - Verde 6mm + Serigrafia
  ('10000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000041', '30000000-0000-0000-0000-000000000043',
   '2026-04-07', '06:00', '14:00', 28, 30, 45, 10, 140, 6, 0, 'Float verde 6mm - setup longo troca cor'),
  ('10000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000045', '30000000-0000-0000-0000-000000000047',
   '2026-04-07', '07:00', '16:00', 25, 60, 30, 15, 120, 8, 0, 'Serigrafia faixa decorativa'),
  -- 08/abr - Tempera 8mm
  ('10000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000043', '30000000-0000-0000-0000-000000000045',
   '2026-04-08', '07:00', '17:00', 32, 60, 15, 30, 185, 25, 0, 'Tempera 8mm - alto indice de quebra'),
  -- 09/abr - Float 4mm turno longo + Lapidacao
  ('10000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000041', '30000000-0000-0000-0000-000000000040',
   '2026-04-09', '06:00', '22:00', 45, 60, 0, 20, 620, 15, 0, 'Float 4mm dois turnos seguidos'),
  ('10000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000044', '30000000-0000-0000-0000-000000000046',
   '2026-04-09', '07:00', '17:00', 55, 60, 10, 15, 400, 8, 0, 'Lapidacao encomenda especial'),
  -- 14/abr - Dia completo
  ('10000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000041', '30000000-0000-0000-0000-000000000041',
   '2026-04-14', '06:00', '14:00', 30, 30, 10, 25, 155, 7, 0, 'Float 6mm - problema de bolhas'),
  ('10000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000042', '30000000-0000-0000-0000-000000000041',
   '2026-04-14', '07:00', '15:00', 100, 30, 5, 10, 670, 15, 0, 'Corte 6mm'),
  ('10000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000043', '30000000-0000-0000-0000-000000000044',
   '2026-04-14', '07:00', '16:00', 40, 60, 10, 20, 260, 14, 0, 'Tempera 6mm para fachada');


-- ============================================================
-- PARTE 4: Criar usuarios demo para novas empresas
-- (via admin API - rode os comandos abaixo apos este SQL)
-- ============================================================

-- Verificacao final
SELECT 'Empresas' as tipo, count(*) as total FROM empresa
UNION ALL
SELECT 'Unidades', count(*) FROM unidades
UNION ALL
SELECT 'Linhas', count(*) FROM linhas
UNION ALL
SELECT 'Produtos', count(*) FROM produtos
UNION ALL
SELECT 'Taxas', count(*) FROM taxas_producao
UNION ALL
SELECT 'Motivos', count(*) FROM motivos_parada
UNION ALL
SELECT 'Ordens', count(*) FROM ordens_producao;
