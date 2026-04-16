// MADG MES — Supabase Client + Auth
// Substituir pelos valores do seu projeto Supabase

const SUPABASE_URL = 'https://twitebntywrlvtsigonb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aXRlYm50eXdybHZ0c2lnb25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjY3NDAsImV4cCI6MjA5MTg0Mjc0MH0.v-Sfh75MayzkHISUvJvUCN477dGDkdKu2DW-uvIsGcM';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Estado global do usuario
let currentUser = null;
let currentEmpresaId = null;
let isSuperAdmin = false;
let currentEmpresaNome = null;

/**
 * Inicializa auth: verifica sessao existente e escuta mudancas
 */
async function initAuth() {
  // Verificar sessao existente
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    await setUserContext(session.user);
  } else {
    showLogin();
  }

  // Escutar mudancas de auth
  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await setUserContext(session.user);
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentEmpresaId = null;
      isSuperAdmin = false;
      currentEmpresaNome = null;
      showLogin();
    }
  });
}

/**
 * Carrega o contexto do usuario (empresa vinculada + flag de super_admin)
 */
async function setUserContext(user) {
  currentUser = user;

  // 1. Verificar se e super_admin
  const { data: saRow } = await db
    .from('super_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  isSuperAdmin = !!saRow;

  // 2. Buscar vinculo normal (pode nao existir para super_admin)
  const { data: vinculo } = await db
    .from('user_empresa')
    .select('empresa_id, papel, empresa(nome)')
    .eq('user_id', user.id)
    .maybeSingle();

  // 3. Super_admin: buscar contexto de empresa selecionada
  let contextoSuper = null;
  if (isSuperAdmin) {
    const { data: ctx } = await db
      .from('super_admin_context')
      .select('selected_empresa_id, empresa:selected_empresa_id(nome)')
      .eq('user_id', user.id)
      .maybeSingle();
    if (ctx?.selected_empresa_id) contextoSuper = ctx;
  }

  // 4. Usuario normal sem vinculo e nao-super_admin → bloquear
  if (!vinculo && !isSuperAdmin) {
    document.getElementById('main-content').innerHTML = `
      <div class="empty-state">
        <div class="icon">🔒</div>
        <p>Seu usuario nao esta vinculado a nenhuma empresa.</p>
        <p class="text-muted">Peca ao administrador para adicionar seu acesso.</p>
        <button class="btn btn-outline mt-2" onclick="doLogout()">Sair</button>
      </div>`;
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.bottom-nav').style.display = 'none';
    return;
  }

  // 5. Definir contexto de empresa (prioridade: contexto super_admin > vinculo normal)
  if (contextoSuper) {
    currentEmpresaId = contextoSuper.selected_empresa_id;
    currentEmpresaNome = contextoSuper.empresa?.nome || null;
  } else if (vinculo) {
    currentEmpresaId = vinculo.empresa_id;
    currentEmpresaNome = vinculo.empresa?.nome || null;
  } else {
    currentEmpresaId = null;
    currentEmpresaNome = null;
  }

  // 6. Atualizar header
  const headerRight = document.querySelector('.header-right');
  if (headerRight) {
    const badgeSuper = isSuperAdmin
      ? '<span style="background:var(--laranja);color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:4px;margin-right:8px">SUPER ADMIN</span>'
      : '';
    const contextoLabel = currentEmpresaNome
      ? currentEmpresaNome + (isSuperAdmin ? ' <small style="opacity:0.8">(contexto)</small>' : '')
      : (isSuperAdmin ? '<small style="opacity:0.8">sem contexto</small>' : '');
    headerRight.innerHTML = `${badgeSuper}${contextoLabel} <button class="btn btn-sm" style="margin-left:8px;color:var(--branco);border:1px solid rgba(255,255,255,0.3);padding:4px 10px" onclick="doLogout()">Sair</button>`;
  }

  // 7. Exibir itens de menu super_admin se aplicavel
  document.querySelectorAll('.super-admin-only').forEach(el => {
    el.style.display = isSuperAdmin ? '' : 'none';
  });

  // 8. Mostrar navegacao e iniciar router
  document.querySelector('.sidebar').style.display = '';
  document.querySelector('.bottom-nav').style.display = '';

  // Super_admin sem contexto → forcar painel de empresas
  if (isSuperAdmin && !currentEmpresaId && (!location.hash || !location.hash.startsWith('#/admin/'))) {
    location.hash = '#/admin/empresas';
  }

  Router.init();
}

/**
 * Super admin: troca o contexto de empresa via RPC
 */
async function selecionarEmpresa(empresaId) {
  const { error } = await db.rpc('rpc_admin_selecionar_empresa', { p_empresa_id: empresaId });
  if (error) { UI.toast('Erro ao trocar contexto: ' + error.message, 'error'); return false; }
  // Recarrega contexto e redireciona para dashboard
  await setUserContext(currentUser);
  location.hash = empresaId ? '#/dashboard' : '#/admin/empresas';
  return true;
}

/**
 * Mostra tela de login
 */
function showLogin() {
  document.querySelector('.sidebar').style.display = 'none';
  document.querySelector('.bottom-nav').style.display = 'none';

  document.getElementById('main-content').innerHTML = `
    <div style="max-width:360px; margin:40px auto; text-align:center">
      <h1 style="color:var(--azul); font-size:2rem; margin-bottom:8px">MADG <span style="color:var(--laranja)">MES</span></h1>
      <p class="text-muted mb-2">Monitoramento de Eficiencia Produtiva</p>

      <div class="card">
        <div id="login-error" style="display:none; color:var(--vermelho); font-size:0.85rem; margin-bottom:12px"></div>

        <div class="form-group">
          <label>Email</label>
          <input type="email" class="form-control" id="login-email" placeholder="seu@email.com">
        </div>
        <div class="form-group">
          <label>Senha</label>
          <input type="password" class="form-control" id="login-senha" placeholder="••••••••">
        </div>

        <button class="btn btn-primary w-full" id="btn-login" style="width:100%">Entrar</button>

        <div style="margin-top:16px; font-size:0.8rem">
          <a href="javascript:void(0)" id="btn-show-signup" style="color:var(--azul)">Criar conta</a>
        </div>
      </div>
    </div>`;

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('login-senha').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('btn-show-signup').addEventListener('click', showSignup);
}

/**
 * Mostra tela de cadastro
 */
function showSignup() {
  document.getElementById('main-content').innerHTML = `
    <div style="max-width:360px; margin:40px auto; text-align:center">
      <h1 style="color:var(--azul); font-size:2rem; margin-bottom:8px">MADG <span style="color:var(--laranja)">MES</span></h1>
      <p class="text-muted mb-2">Criar nova conta</p>

      <div class="card">
        <div id="signup-error" style="display:none; color:var(--vermelho); font-size:0.85rem; margin-bottom:12px"></div>
        <div id="signup-success" style="display:none; color:var(--verde); font-size:0.85rem; margin-bottom:12px"></div>

        <div class="form-group">
          <label>Email</label>
          <input type="email" class="form-control" id="signup-email" placeholder="seu@email.com">
        </div>
        <div class="form-group">
          <label>Senha (minimo 6 caracteres)</label>
          <input type="password" class="form-control" id="signup-senha" placeholder="••••••••">
        </div>

        <button class="btn btn-primary w-full" id="btn-signup" style="width:100%">Criar Conta</button>

        <div style="margin-top:16px; font-size:0.8rem">
          <a href="javascript:void(0)" id="btn-show-login" style="color:var(--azul)">Ja tenho conta</a>
        </div>
      </div>
    </div>`;

  document.getElementById('btn-signup').addEventListener('click', doSignup);
  document.getElementById('btn-show-login').addEventListener('click', showLogin);
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const errEl = document.getElementById('login-error');

  if (!email || !senha) { errEl.style.display = 'block'; errEl.textContent = 'Preencha email e senha'; return; }

  const { error } = await db.auth.signInWithPassword({ email, password: senha });
  if (error) {
    errEl.style.display = 'block';
    errEl.textContent = error.message === 'Invalid login credentials' ? 'Email ou senha incorretos' : error.message;
  }
}

async function doSignup() {
  const email = document.getElementById('signup-email').value.trim();
  const senha = document.getElementById('signup-senha').value;
  const errEl = document.getElementById('signup-error');
  const okEl = document.getElementById('signup-success');

  if (!email || !senha) { errEl.style.display = 'block'; errEl.textContent = 'Preencha email e senha'; return; }
  if (senha.length < 6) { errEl.style.display = 'block'; errEl.textContent = 'Senha deve ter no minimo 6 caracteres'; return; }

  const { error } = await db.auth.signUp({ email, password: senha });
  if (error) {
    errEl.style.display = 'block';
    errEl.textContent = error.message;
  } else {
    errEl.style.display = 'none';
    okEl.style.display = 'block';
    okEl.textContent = 'Conta criada! Verifique seu email para confirmar (ou faca login se a confirmacao estiver desabilitada).';
  }
}

async function doLogout() {
  await db.auth.signOut();
}
