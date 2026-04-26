


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."auth_empresa_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."auth_empresa_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid());
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_last_super_admin_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (SELECT COUNT(*) FROM super_admins) <= 1 THEN
    RAISE EXCEPTION 'Nao e possivel remover o ultimo super_admin do sistema';
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."prevent_last_super_admin_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_admin_criar_usuario"("p_email" "text", "p_password" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."rpc_admin_criar_usuario"("p_email" "text", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_admin_listar_usuarios"() RETURNS TABLE("user_id" "uuid", "email" "text", "criado_em" timestamp with time zone, "ultimo_login" timestamp with time zone, "is_super_admin" boolean, "vinculos" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."rpc_admin_listar_usuarios"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_admin_selecionar_empresa"("p_empresa_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."rpc_admin_selecionar_empresa"("p_empresa_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."empresa" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nome" "text" NOT NULL,
    "segmento" "text" DEFAULT 'Outro'::"text",
    "criado_em" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."empresa" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."empresa" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."linhas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "unidade_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text",
    "ativo" boolean DEFAULT true,
    "criado_em" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."linhas" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."linhas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."motivos_parada" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "ativo" boolean DEFAULT true,
    "criado_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "motivos_parada_tipo_check" CHECK (("tipo" = ANY (ARRAY['planejada'::"text", 'nao_planejada'::"text", 'setup'::"text"])))
);

ALTER TABLE ONLY "public"."motivos_parada" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."motivos_parada" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ordens_producao" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "unidade_id" "uuid" NOT NULL,
    "linha_id" "uuid" NOT NULL,
    "produto_id" "uuid" NOT NULL,
    "turno_id" "uuid",
    "data" "date" DEFAULT CURRENT_DATE NOT NULL,
    "hora_inicio" time without time zone NOT NULL,
    "hora_fim" time without time zone NOT NULL,
    "velocidade_padrao" numeric(12,2),
    "tempo_planejado" integer DEFAULT 0,
    "tempo_setup" integer DEFAULT 0,
    "tempo_parada" integer DEFAULT 0,
    "qtd_produzida" numeric(12,2) DEFAULT 0,
    "qtd_rejeitada" numeric(12,2) DEFAULT 0,
    "qtd_reprocesso" numeric(12,2) DEFAULT 0,
    "observacao" "text",
    "criado_em" timestamp with time zone DEFAULT "now"(),
    "criado_por" "uuid"
);

ALTER TABLE ONLY "public"."ordens_producao" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."ordens_producao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."paradas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ordem_id" "uuid" NOT NULL,
    "linha_id" "uuid" NOT NULL,
    "hora_inicio" time without time zone NOT NULL,
    "hora_fim" time without time zone,
    "motivo_id" "uuid",
    "descricao" "text",
    "criado_em" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."paradas" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."paradas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."produtos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "codigo" "text" NOT NULL,
    "descricao" "text" NOT NULL,
    "unidade_medida" "text" DEFAULT 'kg'::"text" NOT NULL,
    "peso_unitario" numeric(10,4),
    "ativo" boolean DEFAULT true,
    "criado_em" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."produtos" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."produtos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."super_admin_context" (
    "user_id" "uuid" NOT NULL,
    "selected_empresa_id" "uuid",
    "atualizado_em" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."super_admin_context" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."super_admin_context" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."super_admins" (
    "user_id" "uuid" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"(),
    "criado_por" "uuid"
);

ALTER TABLE ONLY "public"."super_admins" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."super_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."taxas_producao" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "produto_id" "uuid" NOT NULL,
    "linha_id" "uuid" NOT NULL,
    "velocidade" numeric(12,2) NOT NULL,
    "unidade_velocidade" "text" DEFAULT 'un/h'::"text",
    "criado_em" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."taxas_producao" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."taxas_producao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."turnos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "unidade_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "hora_inicio" time without time zone NOT NULL,
    "hora_fim" time without time zone NOT NULL,
    "dias_semana" integer[] DEFAULT '{1,2,3,4,5}'::integer[],
    "criado_em" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."turnos" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."turnos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unidades" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "ativo" boolean DEFAULT true,
    "criado_em" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."unidades" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."unidades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_empresa" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "papel" "text" DEFAULT 'operador'::"text",
    "criado_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_empresa_papel_check" CHECK (("papel" = ANY (ARRAY['admin'::"text", 'gestor'::"text", 'operador'::"text", 'visualizador'::"text"])))
);

ALTER TABLE ONLY "public"."user_empresa" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_empresa" OWNER TO "postgres";


ALTER TABLE ONLY "public"."empresa"
    ADD CONSTRAINT "empresa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."linhas"
    ADD CONSTRAINT "linhas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."motivos_parada"
    ADD CONSTRAINT "motivos_parada_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordens_producao"
    ADD CONSTRAINT "ordens_producao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."paradas"
    ADD CONSTRAINT "paradas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."super_admin_context"
    ADD CONSTRAINT "super_admin_context_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."taxas_producao"
    ADD CONSTRAINT "taxas_producao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."taxas_producao"
    ADD CONSTRAINT "taxas_producao_produto_id_linha_id_key" UNIQUE ("produto_id", "linha_id");



ALTER TABLE ONLY "public"."turnos"
    ADD CONSTRAINT "turnos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unidades"
    ADD CONSTRAINT "unidades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_empresa"
    ADD CONSTRAINT "user_empresa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_empresa"
    ADD CONSTRAINT "user_empresa_user_id_empresa_id_key" UNIQUE ("user_id", "empresa_id");



CREATE INDEX "idx_linhas_unidade" ON "public"."linhas" USING "btree" ("unidade_id");



CREATE INDEX "idx_motivos_empresa" ON "public"."motivos_parada" USING "btree" ("empresa_id");



CREATE INDEX "idx_ordens_data" ON "public"."ordens_producao" USING "btree" ("data");



CREATE INDEX "idx_ordens_data_linha" ON "public"."ordens_producao" USING "btree" ("data", "linha_id");



CREATE INDEX "idx_ordens_linha" ON "public"."ordens_producao" USING "btree" ("linha_id");



CREATE INDEX "idx_ordens_unidade" ON "public"."ordens_producao" USING "btree" ("unidade_id");



CREATE INDEX "idx_paradas_ordem" ON "public"."paradas" USING "btree" ("ordem_id");



CREATE INDEX "idx_produtos_empresa" ON "public"."produtos" USING "btree" ("empresa_id");



CREATE INDEX "idx_taxas_produto_linha" ON "public"."taxas_producao" USING "btree" ("produto_id", "linha_id");



CREATE INDEX "idx_unidades_empresa" ON "public"."unidades" USING "btree" ("empresa_id");



CREATE INDEX "idx_user_empresa_empresa" ON "public"."user_empresa" USING "btree" ("empresa_id");



CREATE INDEX "idx_user_empresa_user" ON "public"."user_empresa" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "trg_prevent_last_super_admin_delete" BEFORE DELETE ON "public"."super_admins" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_last_super_admin_delete"();



ALTER TABLE ONLY "public"."linhas"
    ADD CONSTRAINT "linhas_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."motivos_parada"
    ADD CONSTRAINT "motivos_parada_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id");



ALTER TABLE ONLY "public"."ordens_producao"
    ADD CONSTRAINT "ordens_producao_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ordens_producao"
    ADD CONSTRAINT "ordens_producao_linha_id_fkey" FOREIGN KEY ("linha_id") REFERENCES "public"."linhas"("id");



ALTER TABLE ONLY "public"."ordens_producao"
    ADD CONSTRAINT "ordens_producao_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id");



ALTER TABLE ONLY "public"."ordens_producao"
    ADD CONSTRAINT "ordens_producao_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id");



ALTER TABLE ONLY "public"."ordens_producao"
    ADD CONSTRAINT "ordens_producao_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id");



ALTER TABLE ONLY "public"."paradas"
    ADD CONSTRAINT "paradas_linha_id_fkey" FOREIGN KEY ("linha_id") REFERENCES "public"."linhas"("id");



ALTER TABLE ONLY "public"."paradas"
    ADD CONSTRAINT "paradas_motivo_id_fkey" FOREIGN KEY ("motivo_id") REFERENCES "public"."motivos_parada"("id");



ALTER TABLE ONLY "public"."paradas"
    ADD CONSTRAINT "paradas_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "public"."ordens_producao"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id");



ALTER TABLE ONLY "public"."super_admin_context"
    ADD CONSTRAINT "super_admin_context_selected_empresa_id_fkey" FOREIGN KEY ("selected_empresa_id") REFERENCES "public"."empresa"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."super_admin_context"
    ADD CONSTRAINT "super_admin_context_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."taxas_producao"
    ADD CONSTRAINT "taxas_producao_linha_id_fkey" FOREIGN KEY ("linha_id") REFERENCES "public"."linhas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."taxas_producao"
    ADD CONSTRAINT "taxas_producao_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."turnos"
    ADD CONSTRAINT "turnos_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unidades"
    ADD CONSTRAINT "unidades_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id");



ALTER TABLE ONLY "public"."user_empresa"
    ADD CONSTRAINT "user_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_empresa"
    ADD CONSTRAINT "user_empresa_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."empresa" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "empresa_delete" ON "public"."empresa" FOR DELETE USING ("public"."is_super_admin"());



CREATE POLICY "empresa_insert" ON "public"."empresa" FOR INSERT WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "empresa_select" ON "public"."empresa" FOR SELECT USING ((("id" = "public"."auth_empresa_id"()) OR "public"."is_super_admin"()));



CREATE POLICY "empresa_update" ON "public"."empresa" FOR UPDATE USING ("public"."is_super_admin"());



ALTER TABLE "public"."linhas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "linhas_delete" ON "public"."linhas" FOR DELETE USING (("unidade_id" IN ( SELECT "unidades"."id"
   FROM "public"."unidades"
  WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))));



CREATE POLICY "linhas_insert" ON "public"."linhas" FOR INSERT WITH CHECK (("unidade_id" IN ( SELECT "unidades"."id"
   FROM "public"."unidades"
  WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))));



CREATE POLICY "linhas_select" ON "public"."linhas" FOR SELECT USING (("unidade_id" IN ( SELECT "unidades"."id"
   FROM "public"."unidades"
  WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))));



CREATE POLICY "linhas_update" ON "public"."linhas" FOR UPDATE USING (("unidade_id" IN ( SELECT "unidades"."id"
   FROM "public"."unidades"
  WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))));



CREATE POLICY "motivos_delete" ON "public"."motivos_parada" FOR DELETE USING (("empresa_id" = "public"."auth_empresa_id"()));



CREATE POLICY "motivos_insert" ON "public"."motivos_parada" FOR INSERT WITH CHECK (("empresa_id" = "public"."auth_empresa_id"()));



ALTER TABLE "public"."motivos_parada" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "motivos_select" ON "public"."motivos_parada" FOR SELECT USING (("empresa_id" = "public"."auth_empresa_id"()));



CREATE POLICY "motivos_update" ON "public"."motivos_parada" FOR UPDATE USING (("empresa_id" = "public"."auth_empresa_id"()));



CREATE POLICY "ordens_delete" ON "public"."ordens_producao" FOR DELETE USING (("unidade_id" IN ( SELECT "unidades"."id"
   FROM "public"."unidades"
  WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))));



CREATE POLICY "ordens_insert" ON "public"."ordens_producao" FOR INSERT WITH CHECK (("unidade_id" IN ( SELECT "unidades"."id"
   FROM "public"."unidades"
  WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))));



ALTER TABLE "public"."ordens_producao" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ordens_select" ON "public"."ordens_producao" FOR SELECT USING (("unidade_id" IN ( SELECT "unidades"."id"
   FROM "public"."unidades"
  WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))));



CREATE POLICY "ordens_update" ON "public"."ordens_producao" FOR UPDATE USING (("unidade_id" IN ( SELECT "unidades"."id"
   FROM "public"."unidades"
  WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))));



ALTER TABLE "public"."paradas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "paradas_delete" ON "public"."paradas" FOR DELETE USING (("ordem_id" IN ( SELECT "ordens_producao"."id"
   FROM "public"."ordens_producao"
  WHERE ("ordens_producao"."unidade_id" IN ( SELECT "unidades"."id"
           FROM "public"."unidades"
          WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))))));



CREATE POLICY "paradas_insert" ON "public"."paradas" FOR INSERT WITH CHECK (("ordem_id" IN ( SELECT "ordens_producao"."id"
   FROM "public"."ordens_producao"
  WHERE ("ordens_producao"."unidade_id" IN ( SELECT "unidades"."id"
           FROM "public"."unidades"
          WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))))));



CREATE POLICY "paradas_select" ON "public"."paradas" FOR SELECT USING (("ordem_id" IN ( SELECT "ordens_producao"."id"
   FROM "public"."ordens_producao"
  WHERE ("ordens_producao"."unidade_id" IN ( SELECT "unidades"."id"
           FROM "public"."unidades"
          WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))))));



ALTER TABLE "public"."produtos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "produtos_delete" ON "public"."produtos" FOR DELETE USING (("empresa_id" = "public"."auth_empresa_id"()));



CREATE POLICY "produtos_insert" ON "public"."produtos" FOR INSERT WITH CHECK (("empresa_id" = "public"."auth_empresa_id"()));



CREATE POLICY "produtos_select" ON "public"."produtos" FOR SELECT USING (("empresa_id" = "public"."auth_empresa_id"()));



CREATE POLICY "produtos_update" ON "public"."produtos" FOR UPDATE USING (("empresa_id" = "public"."auth_empresa_id"()));



ALTER TABLE "public"."super_admin_context" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "super_admin_context_all" ON "public"."super_admin_context" USING ((("user_id" = "auth"."uid"()) AND "public"."is_super_admin"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."is_super_admin"()));



ALTER TABLE "public"."super_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "super_admins_delete" ON "public"."super_admins" FOR DELETE USING ("public"."is_super_admin"());



CREATE POLICY "super_admins_insert" ON "public"."super_admins" FOR INSERT WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "super_admins_select" ON "public"."super_admins" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "taxas_delete" ON "public"."taxas_producao" FOR DELETE USING (("produto_id" IN ( SELECT "produtos"."id"
   FROM "public"."produtos"
  WHERE ("produtos"."empresa_id" = "public"."auth_empresa_id"()))));



CREATE POLICY "taxas_insert" ON "public"."taxas_producao" FOR INSERT WITH CHECK (("produto_id" IN ( SELECT "produtos"."id"
   FROM "public"."produtos"
  WHERE ("produtos"."empresa_id" = "public"."auth_empresa_id"()))));



ALTER TABLE "public"."taxas_producao" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "taxas_select" ON "public"."taxas_producao" FOR SELECT USING (("produto_id" IN ( SELECT "produtos"."id"
   FROM "public"."produtos"
  WHERE ("produtos"."empresa_id" = "public"."auth_empresa_id"()))));



CREATE POLICY "taxas_update" ON "public"."taxas_producao" FOR UPDATE USING (("produto_id" IN ( SELECT "produtos"."id"
   FROM "public"."produtos"
  WHERE ("produtos"."empresa_id" = "public"."auth_empresa_id"()))));



ALTER TABLE "public"."turnos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "turnos_delete" ON "public"."turnos" FOR DELETE USING (("unidade_id" IN ( SELECT "unidades"."id"
   FROM "public"."unidades"
  WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))));



CREATE POLICY "turnos_insert" ON "public"."turnos" FOR INSERT WITH CHECK (("unidade_id" IN ( SELECT "unidades"."id"
   FROM "public"."unidades"
  WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))));



CREATE POLICY "turnos_select" ON "public"."turnos" FOR SELECT USING (("unidade_id" IN ( SELECT "unidades"."id"
   FROM "public"."unidades"
  WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))));



CREATE POLICY "turnos_update" ON "public"."turnos" FOR UPDATE USING (("unidade_id" IN ( SELECT "unidades"."id"
   FROM "public"."unidades"
  WHERE ("unidades"."empresa_id" = "public"."auth_empresa_id"()))));



ALTER TABLE "public"."unidades" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "unidades_delete" ON "public"."unidades" FOR DELETE USING (("empresa_id" = "public"."auth_empresa_id"()));



CREATE POLICY "unidades_insert" ON "public"."unidades" FOR INSERT WITH CHECK (("empresa_id" = "public"."auth_empresa_id"()));



CREATE POLICY "unidades_select" ON "public"."unidades" FOR SELECT USING (("empresa_id" = "public"."auth_empresa_id"()));



CREATE POLICY "unidades_update" ON "public"."unidades" FOR UPDATE USING (("empresa_id" = "public"."auth_empresa_id"()));



ALTER TABLE "public"."user_empresa" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_empresa_delete" ON "public"."user_empresa" FOR DELETE USING ("public"."is_super_admin"());



CREATE POLICY "user_empresa_insert" ON "public"."user_empresa" FOR INSERT WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "user_empresa_select" ON "public"."user_empresa" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "user_empresa_update" ON "public"."user_empresa" FOR UPDATE USING ("public"."is_super_admin"());





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."auth_empresa_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_empresa_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_empresa_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_last_super_admin_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_last_super_admin_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_last_super_admin_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_admin_criar_usuario"("p_email" "text", "p_password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_admin_criar_usuario"("p_email" "text", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_admin_criar_usuario"("p_email" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_admin_criar_usuario"("p_email" "text", "p_password" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_admin_listar_usuarios"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_admin_listar_usuarios"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_admin_listar_usuarios"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_admin_listar_usuarios"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_admin_selecionar_empresa"("p_empresa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_admin_selecionar_empresa"("p_empresa_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_admin_selecionar_empresa"("p_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_admin_selecionar_empresa"("p_empresa_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."empresa" TO "anon";
GRANT ALL ON TABLE "public"."empresa" TO "authenticated";
GRANT ALL ON TABLE "public"."empresa" TO "service_role";



GRANT ALL ON TABLE "public"."linhas" TO "anon";
GRANT ALL ON TABLE "public"."linhas" TO "authenticated";
GRANT ALL ON TABLE "public"."linhas" TO "service_role";



GRANT ALL ON TABLE "public"."motivos_parada" TO "anon";
GRANT ALL ON TABLE "public"."motivos_parada" TO "authenticated";
GRANT ALL ON TABLE "public"."motivos_parada" TO "service_role";



GRANT ALL ON TABLE "public"."ordens_producao" TO "anon";
GRANT ALL ON TABLE "public"."ordens_producao" TO "authenticated";
GRANT ALL ON TABLE "public"."ordens_producao" TO "service_role";



GRANT ALL ON TABLE "public"."paradas" TO "anon";
GRANT ALL ON TABLE "public"."paradas" TO "authenticated";
GRANT ALL ON TABLE "public"."paradas" TO "service_role";



GRANT ALL ON TABLE "public"."produtos" TO "anon";
GRANT ALL ON TABLE "public"."produtos" TO "authenticated";
GRANT ALL ON TABLE "public"."produtos" TO "service_role";



GRANT ALL ON TABLE "public"."super_admin_context" TO "anon";
GRANT ALL ON TABLE "public"."super_admin_context" TO "authenticated";
GRANT ALL ON TABLE "public"."super_admin_context" TO "service_role";



GRANT ALL ON TABLE "public"."super_admins" TO "anon";
GRANT ALL ON TABLE "public"."super_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."super_admins" TO "service_role";



GRANT ALL ON TABLE "public"."taxas_producao" TO "anon";
GRANT ALL ON TABLE "public"."taxas_producao" TO "authenticated";
GRANT ALL ON TABLE "public"."taxas_producao" TO "service_role";



GRANT ALL ON TABLE "public"."turnos" TO "anon";
GRANT ALL ON TABLE "public"."turnos" TO "authenticated";
GRANT ALL ON TABLE "public"."turnos" TO "service_role";



GRANT ALL ON TABLE "public"."unidades" TO "anon";
GRANT ALL ON TABLE "public"."unidades" TO "authenticated";
GRANT ALL ON TABLE "public"."unidades" TO "service_role";



GRANT ALL ON TABLE "public"."user_empresa" TO "anon";
GRANT ALL ON TABLE "public"."user_empresa" TO "authenticated";
GRANT ALL ON TABLE "public"."user_empresa" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































RESET ALL;
