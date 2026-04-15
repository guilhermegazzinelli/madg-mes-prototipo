-- MADG MES — Schema v1 com RLS multi-tenant
-- Rodar no Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. Empresa
-- ============================================================
CREATE TABLE empresa (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  segmento TEXT DEFAULT 'Outro',
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. Vinculo usuario <-> empresa (multi-tenant)
--    Cada usuario do Supabase Auth pertence a uma empresa
-- ============================================================
CREATE TABLE user_empresa (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  papel TEXT DEFAULT 'operador' CHECK (papel IN ('admin', 'gestor', 'operador', 'visualizador')),
  criado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, empresa_id)
);

-- Funcao helper: retorna o empresa_id do usuario logado
CREATE OR REPLACE FUNCTION auth_empresa_id()
RETURNS UUID AS $$
  SELECT empresa_id FROM user_empresa WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 3. Unidades fabris
-- ============================================================
CREATE TABLE unidades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresa(id),
  nome TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. Linhas de producao
-- ============================================================
CREATE TABLE linhas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. Produtos
-- ============================================================
CREATE TABLE produtos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresa(id),
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  unidade_medida TEXT NOT NULL DEFAULT 'kg',
  peso_unitario NUMERIC(10,4),
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. Taxas de producao (produto x linha)
-- ============================================================
CREATE TABLE taxas_producao (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  linha_id UUID NOT NULL REFERENCES linhas(id) ON DELETE CASCADE,
  velocidade NUMERIC(12,2) NOT NULL,
  unidade_velocidade TEXT DEFAULT 'un/h',
  criado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE(produto_id, linha_id)
);

-- ============================================================
-- 7. Motivos de parada
-- ============================================================
CREATE TABLE motivos_parada (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresa(id),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('planejada', 'nao_planejada', 'setup')),
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 8. Turnos
-- ============================================================
CREATE TABLE turnos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  dias_semana INTEGER[] DEFAULT '{1,2,3,4,5}',
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 9. Ordens de producao
-- ============================================================
CREATE TABLE ordens_producao (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  linha_id UUID NOT NULL REFERENCES linhas(id),
  produto_id UUID NOT NULL REFERENCES produtos(id),
  turno_id UUID REFERENCES turnos(id),
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  velocidade_padrao NUMERIC(12,2),
  tempo_planejado INTEGER DEFAULT 0,
  tempo_setup INTEGER DEFAULT 0,
  tempo_parada INTEGER DEFAULT 0,
  qtd_produzida NUMERIC(12,2) DEFAULT 0,
  qtd_rejeitada NUMERIC(12,2) DEFAULT 0,
  qtd_reprocesso NUMERIC(12,2) DEFAULT 0,
  observacao TEXT,
  criado_em TIMESTAMPTZ DEFAULT now(),
  criado_por UUID REFERENCES auth.users(id)
);

-- ============================================================
-- 10. Paradas (detalhe por ordem)
-- ============================================================
CREATE TABLE paradas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordem_id UUID NOT NULL REFERENCES ordens_producao(id) ON DELETE CASCADE,
  linha_id UUID NOT NULL REFERENCES linhas(id),
  hora_inicio TIME NOT NULL,
  hora_fim TIME,
  motivo_id UUID REFERENCES motivos_parada(id),
  descricao TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_user_empresa_user ON user_empresa(user_id);
CREATE INDEX idx_user_empresa_empresa ON user_empresa(empresa_id);
CREATE INDEX idx_unidades_empresa ON unidades(empresa_id);
CREATE INDEX idx_produtos_empresa ON produtos(empresa_id);
CREATE INDEX idx_motivos_empresa ON motivos_parada(empresa_id);
CREATE INDEX idx_linhas_unidade ON linhas(unidade_id);
CREATE INDEX idx_ordens_data ON ordens_producao(data);
CREATE INDEX idx_ordens_linha ON ordens_producao(linha_id);
CREATE INDEX idx_ordens_data_linha ON ordens_producao(data, linha_id);
CREATE INDEX idx_ordens_unidade ON ordens_producao(unidade_id);
CREATE INDEX idx_paradas_ordem ON paradas(ordem_id);
CREATE INDEX idx_taxas_produto_linha ON taxas_producao(produto_id, linha_id);

-- ============================================================
-- RLS — Row Level Security (isolamento por empresa)
-- ============================================================

-- Empresa: usuario so ve a propria
ALTER TABLE empresa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresa_select" ON empresa FOR SELECT
  USING (id = auth_empresa_id());

-- User-Empresa: usuario so ve seus proprios vinculos
ALTER TABLE user_empresa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_empresa_select" ON user_empresa FOR SELECT
  USING (user_id = auth.uid());

-- Unidades: filtro direto por empresa_id
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unidades_select" ON unidades FOR SELECT
  USING (empresa_id = auth_empresa_id());
CREATE POLICY "unidades_insert" ON unidades FOR INSERT
  WITH CHECK (empresa_id = auth_empresa_id());
CREATE POLICY "unidades_update" ON unidades FOR UPDATE
  USING (empresa_id = auth_empresa_id());
CREATE POLICY "unidades_delete" ON unidades FOR DELETE
  USING (empresa_id = auth_empresa_id());

-- Produtos: filtro direto por empresa_id
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produtos_select" ON produtos FOR SELECT
  USING (empresa_id = auth_empresa_id());
CREATE POLICY "produtos_insert" ON produtos FOR INSERT
  WITH CHECK (empresa_id = auth_empresa_id());
CREATE POLICY "produtos_update" ON produtos FOR UPDATE
  USING (empresa_id = auth_empresa_id());
CREATE POLICY "produtos_delete" ON produtos FOR DELETE
  USING (empresa_id = auth_empresa_id());

-- Motivos de Parada: filtro direto por empresa_id
ALTER TABLE motivos_parada ENABLE ROW LEVEL SECURITY;
CREATE POLICY "motivos_select" ON motivos_parada FOR SELECT
  USING (empresa_id = auth_empresa_id());
CREATE POLICY "motivos_insert" ON motivos_parada FOR INSERT
  WITH CHECK (empresa_id = auth_empresa_id());
CREATE POLICY "motivos_update" ON motivos_parada FOR UPDATE
  USING (empresa_id = auth_empresa_id());
CREATE POLICY "motivos_delete" ON motivos_parada FOR DELETE
  USING (empresa_id = auth_empresa_id());

-- Linhas: filtro via unidade -> empresa
ALTER TABLE linhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "linhas_select" ON linhas FOR SELECT
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "linhas_insert" ON linhas FOR INSERT
  WITH CHECK (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "linhas_update" ON linhas FOR UPDATE
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "linhas_delete" ON linhas FOR DELETE
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));

-- Turnos: filtro via unidade -> empresa
ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "turnos_select" ON turnos FOR SELECT
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "turnos_insert" ON turnos FOR INSERT
  WITH CHECK (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "turnos_update" ON turnos FOR UPDATE
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "turnos_delete" ON turnos FOR DELETE
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));

-- Taxas de Producao: filtro via produto -> empresa
ALTER TABLE taxas_producao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taxas_select" ON taxas_producao FOR SELECT
  USING (produto_id IN (SELECT id FROM produtos WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "taxas_insert" ON taxas_producao FOR INSERT
  WITH CHECK (produto_id IN (SELECT id FROM produtos WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "taxas_update" ON taxas_producao FOR UPDATE
  USING (produto_id IN (SELECT id FROM produtos WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "taxas_delete" ON taxas_producao FOR DELETE
  USING (produto_id IN (SELECT id FROM produtos WHERE empresa_id = auth_empresa_id()));

-- Ordens de Producao: filtro via unidade -> empresa
ALTER TABLE ordens_producao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ordens_select" ON ordens_producao FOR SELECT
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "ordens_insert" ON ordens_producao FOR INSERT
  WITH CHECK (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "ordens_update" ON ordens_producao FOR UPDATE
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));
CREATE POLICY "ordens_delete" ON ordens_producao FOR DELETE
  USING (unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id()));

-- Paradas: filtro via ordem -> unidade -> empresa
ALTER TABLE paradas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paradas_select" ON paradas FOR SELECT
  USING (ordem_id IN (
    SELECT id FROM ordens_producao
    WHERE unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id())
  ));
CREATE POLICY "paradas_insert" ON paradas FOR INSERT
  WITH CHECK (ordem_id IN (
    SELECT id FROM ordens_producao
    WHERE unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id())
  ));
CREATE POLICY "paradas_delete" ON paradas FOR DELETE
  USING (ordem_id IN (
    SELECT id FROM ordens_producao
    WHERE unidade_id IN (SELECT id FROM unidades WHERE empresa_id = auth_empresa_id())
  ));
