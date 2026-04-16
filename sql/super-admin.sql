-- ============================================================
-- MADG MES — Super Admin (Fase 1: fundacao DB + RLS)
-- ============================================================
--
-- O QUE ESTE SCRIPT FAZ:
--   1. Cria tabela super_admins (flag global, sem vinculo a empresa)
--   2. Cria tabela super_admin_context (empresa "selecionada" para contexto)
--   3. Cria funcao is_super_admin()
--   4. REESCREVE auth_empresa_id() para ser consciente do contexto do super_admin
--   5. Reaplica todas as RLS policies com suporte a super_admin
--   6. Adiciona policies de INSERT/UPDATE/DELETE em empresa e user_empresa
--      (so super_admin pode criar empresas e vincular usuarios)
--   7. Cria trigger anti-lockout (impede deletar o ultimo super_admin)
--   8. Cria funcao rpc_admin_listar_usuarios() para listagem global via UI
--
-- DESIGN KEY:
--   Apos rodar este script, o super_admin pode usar TODAS as paginas de
--   cadastro existentes (unidades, linhas, produtos, etc.) em nome de
--   qualquer empresa, bastando "selecionar" a empresa no painel admin.
--   Isso funciona porque auth_empresa_id() passa a retornar a empresa
--   selecionada pelo super_admin, em vez do seu user_empresa normal.
--
-- COMO USAR:
--   1. schema.sql ja aplicado
--   2. Rode este script inteiro no Supabase SQL Editor (ja esta em
--      transacao atomica — se falhar, rollback completo)
--   3. Crie o primeiro super_admin via INSERT manual (ver final do arquivo)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. TABELA super_admins
-- ============================================================
CREATE TABLE IF NOT EXISTS super_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ DEFAULT now(),
  criado_por UUID REFERENCES auth.users(id)
);

-- ============================================================
-- 2. TABELA super_admin_context
--    Guarda qual empresa o super_admin esta "impersonando" no momento.
--    Ao selecionar uma empresa no painel, o frontend faz um UPSERT aqui.
-- ============================================================
CREATE TABLE IF NOT EXISTS super_admin_context (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_empresa_id UUID REFERENCES empresa(id) ON DELETE SET NULL,
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. FUNCAO is_super_admin()
-- ============================================================
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 4. REESCRITA de auth_empresa_id()
--    Se super_admin com contexto selecionado: retorna empresa selecionada.
--    Senao: comportamento antigo (empresa do user_empresa).
-- ============================================================
CREATE OR REPLACE FUNCTION auth_empresa_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    (SELECT selected_empresa_id
       FROM super_admin_context
      WHERE user_id = auth.uid()
        AND selected_empresa_id IS NOT NULL
      LIMIT 1),
    (SELECT empresa_id
       FROM user_empresa
      WHERE user_id = auth.uid()
      LIMIT 1)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 5. RLS em super_admins e super_admin_context
-- ============================================================
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admins_select" ON super_admins;
CREATE POLICY "super_admins_select" ON super_admins FOR SELECT
  USING (user_id = auth.uid() OR is_super_admin());

DROP POLICY IF EXISTS "super_admins_insert" ON super_admins;
CREATE POLICY "super_admins_insert" ON super_admins FOR INSERT
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "super_admins_delete" ON super_admins;
CREATE POLICY "super_admins_delete" ON super_admins FOR DELETE
  USING (is_super_admin());

ALTER TABLE super_admin_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admin_context FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_context_all" ON super_admin_context;
CREATE POLICY "super_admin_context_all" ON super_admin_context FOR ALL
  USING (user_id = auth.uid() AND is_super_admin())
  WITH CHECK (user_id = auth.uid() AND is_super_admin());

-- ============================================================
-- 6. POLICIES DE empresa — super_admin pode CRIAR/EDITAR/DELETAR
--    Usuarios normais continuam com SELECT apenas da propria empresa.
-- ============================================================
DROP POLICY IF EXISTS "empresa_select" ON empresa;
CREATE POLICY "empresa_select" ON empresa FOR SELECT
  USING (id = auth_empresa_id() OR is_super_admin());

DROP POLICY IF EXISTS "empresa_insert" ON empresa;
CREATE POLICY "empresa_insert" ON empresa FOR INSERT
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "empresa_update" ON empresa;
CREATE POLICY "empresa_update" ON empresa FOR UPDATE
  USING (is_super_admin());

DROP POLICY IF EXISTS "empresa_delete" ON empresa;
CREATE POLICY "empresa_delete" ON empresa FOR DELETE
  USING (is_super_admin());

-- ============================================================
-- 7. POLICIES DE user_empresa — super_admin gerencia todos os vinculos
--    Usuarios normais continuam vendo apenas seus proprios vinculos.
-- ============================================================
DROP POLICY IF EXISTS "user_empresa_select" ON user_empresa;
CREATE POLICY "user_empresa_select" ON user_empresa FOR SELECT
  USING (user_id = auth.uid() OR is_super_admin());

DROP POLICY IF EXISTS "user_empresa_insert" ON user_empresa;
CREATE POLICY "user_empresa_insert" ON user_empresa FOR INSERT
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "user_empresa_update" ON user_empresa;
CREATE POLICY "user_empresa_update" ON user_empresa FOR UPDATE
  USING (is_super_admin());

DROP POLICY IF EXISTS "user_empresa_delete" ON user_empresa;
CREATE POLICY "user_empresa_delete" ON user_empresa FOR DELETE
  USING (is_super_admin());

-- ============================================================
-- 8. TRIGGER anti-lockout
--    Impede deletar o ultimo super_admin do sistema.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_last_super_admin_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM super_admins) <= 1 THEN
    RAISE EXCEPTION 'Nao e possivel remover o ultimo super_admin do sistema';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_last_super_admin_delete ON super_admins;
CREATE TRIGGER trg_prevent_last_super_admin_delete
  BEFORE DELETE ON super_admins
  FOR EACH ROW
  EXECUTE FUNCTION prevent_last_super_admin_delete();

-- ============================================================
-- 9. FUNCAO rpc_admin_listar_usuarios()
--    Retorna usuarios + vinculos para o painel super_admin.
--    Usa SECURITY DEFINER para acessar auth.users (restrito no PostgREST).
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_admin_listar_usuarios()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  criado_em TIMESTAMPTZ,
  ultimo_login TIMESTAMPTZ,
  is_super_admin BOOLEAN,
  vinculos JSONB
) AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::TEXT,
    u.created_at,
    u.last_sign_in_at,
    EXISTS (SELECT 1 FROM super_admins sa WHERE sa.user_id = u.id),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'empresa_id', ue.empresa_id,
          'empresa_nome', e.nome,
          'papel', ue.papel
        ))
         FROM user_empresa ue
         JOIN empresa e ON e.id = ue.empresa_id
        WHERE ue.user_id = u.id),
      '[]'::jsonb
    )
  FROM auth.users u
  ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION rpc_admin_listar_usuarios() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_admin_listar_usuarios() TO authenticated;

-- ============================================================
-- 10. FUNCAO rpc_admin_criar_usuario(email, password)
--     Cria usuario em auth.users direto (mesmo padrao do exemplo-haoma.sql).
--     So super_admin pode chamar. Util para o painel convidar usuarios sem
--     exigir Edge Function.
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_admin_criar_usuario(
  p_email TEXT,
  p_password TEXT
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'Email ja cadastrado: %', p_email;
  END IF;

  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    p_email,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    'email',
    now(), now(), now()
  );

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION rpc_admin_criar_usuario(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_admin_criar_usuario(TEXT, TEXT) TO authenticated;

-- ============================================================
-- 11. FUNCAO rpc_admin_selecionar_empresa(empresa_id)
--     Troca o contexto do super_admin para operar como empresa X.
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_admin_selecionar_empresa(p_empresa_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin';
  END IF;

  -- p_empresa_id pode ser NULL para limpar o contexto
  IF p_empresa_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM empresa WHERE id = p_empresa_id) THEN
    RAISE EXCEPTION 'Empresa nao encontrada: %', p_empresa_id;
  END IF;

  INSERT INTO super_admin_context (user_id, selected_empresa_id, atualizado_em)
  VALUES (auth.uid(), p_empresa_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET selected_empresa_id = EXCLUDED.selected_empresa_id,
        atualizado_em = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION rpc_admin_selecionar_empresa(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_admin_selecionar_empresa(UUID) TO authenticated;

COMMIT;

-- ============================================================
-- BOOTSTRAP — crie o PRIMEIRO super_admin manualmente
-- ============================================================
-- 1. Garanta que o usuario existe em auth.users (signup no app ou Dashboard)
-- 2. Rode o INSERT abaixo com o email correto:
--
-- INSERT INTO super_admins (user_id)
-- SELECT id FROM auth.users WHERE email = 'seu@email.com';
--
-- 3. Faca logout e login novamente no app para o contexto ser recarregado
--
-- VERIFICACAO:
-- SELECT u.email, s.criado_em
-- FROM super_admins s
-- JOIN auth.users u ON u.id = s.user_id;
-- ============================================================
