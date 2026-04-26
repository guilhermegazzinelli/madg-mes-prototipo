// MADG MES — Painel Super Admin: gestao de usuarios e vinculos

async function renderAdminUsuarios(container) {
  if (!isSuperAdmin) {
    container.innerHTML = '<div class="empty-state"><p>Acesso restrito a super admin.</p></div>';
    return;
  }

  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    // Carrega usuarios via RPC (precisa SECURITY DEFINER para acessar auth.users)
    const { data: usuarios, error: eUsr } = await db.rpc('rpc_admin_listar_usuarios');
    if (eUsr) throw eUsr;

    // Carrega empresas para selects
    const { data: empresas, error: eEmp } = await db
      .from('empresa')
      .select('id, nome')
      .order('nome');
    if (eEmp) throw eEmp;

    // Mapear para a tabela
    const rows = (usuarios || []).map(u => ({
      ...u,
      vinculos_fmt: formatVinculos(u.vinculos),
      sa_fmt: u.is_super_admin
        ? '<span class="badge badge-green">SIM</span>'
        : '<span class="badge badge-gray">nao</span>',
      criado_em_fmt: u.criado_em ? new Date(u.criado_em).toLocaleDateString('pt-BR') : '-'
    }));

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Usuarios (Super Admin)</h1>
        <button class="btn btn-primary" id="btn-novo-usuario">+ Novo Usuario</button>
      </div>
      ${UI.table(
        [
          { key: 'email', label: 'Email' },
          { key: 'vinculos_fmt', label: 'Empresas vinculadas' },
          { key: 'sa_fmt', label: 'Super Admin', align: 'center' },
          { key: 'criado_em_fmt', label: 'Criado em', align: 'center' },
          { key: 'user_id', label: 'Acoes', align: 'center',
            format: (id, row) => `
              <button class="btn btn-sm btn-outline btn-vincular" data-id="${id}" data-email="${row.email}">Vincular</button>
              <button class="btn btn-sm btn-outline btn-toggle-sa" data-id="${id}" data-is-sa="${row.is_super_admin}">
                ${row.is_super_admin ? 'Remover super' : 'Tornar super'}
              </button>`
          }
        ],
        rows,
        { emptyMsg: 'Nenhum usuario encontrado' }
      )}`;

    // Novo usuario
    container.querySelector('#btn-novo-usuario').addEventListener('click', () => openNovoUsuarioForm());

    // Vincular usuario a empresa
    container.querySelectorAll('.btn-vincular').forEach(btn => {
      btn.addEventListener('click', () => {
        const user = usuarios.find(u => u.user_id === btn.dataset.id);
        openVincularForm(user, empresas);
      });
    });

    // Toggle super_admin
    container.querySelectorAll('.btn-toggle-sa').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.id;
        const isSa = btn.dataset.isSa === 'true';
        const action = isSa ? 'remover o status de super_admin' : 'tornar super_admin';
        if (!await UI.confirm(`Confirma ${action} deste usuario?`)) return;

        let error;
        if (isSa) {
          ({ error } = await db.from('super_admins').delete().eq('user_id', userId));
        } else {
          ({ error } = await db.from('super_admins').insert({ user_id: userId, criado_por: currentUser.id }));
        }
        if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
        UI.toast('Atualizado');
        renderAdminUsuarios(container);
      });
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}

function formatVinculos(vinculos) {
  if (!vinculos || !vinculos.length) return '<em class="text-muted">sem vinculo</em>';
  return vinculos.map(v =>
    `<span class="badge badge-blue" style="margin:2px" data-vid="${v.empresa_id}">
      ${v.empresa_nome} <small>(${v.papel})</small>
      <a href="javascript:void(0)" class="btn-unlink" data-empresa-id="${v.empresa_id}"
         style="color:#c00;margin-left:6px;font-weight:bold" title="Desvincular">×</a>
    </span>`
  ).join(' ');
}

function openNovoUsuarioForm() {
  const { el, close } = UI.modal(
    'Novo Usuario',
    `<div class="form-group">
      <label>Email</label>
      <input type="email" class="form-control" id="novo-email" placeholder="usuario@empresa.com">
    </div>
    <div class="form-group">
      <label>Senha (minimo 6 caracteres)</label>
      <input type="password" class="form-control" id="novo-senha" placeholder="••••••••">
    </div>
    <p class="text-muted" style="font-size:0.85rem">O usuario sera criado ja confirmado. Apos criar, vincule-o a uma empresa.</p>`,
    `<button class="btn btn-outline btn-cancel">Cancelar</button>
     <button class="btn btn-primary btn-save">Criar</button>`
  );

  el.querySelector('.btn-cancel').addEventListener('click', close);
  el.querySelector('.btn-save').addEventListener('click', async () => {
    const email = el.querySelector('#novo-email').value.trim();
    const senha = el.querySelector('#novo-senha').value;
    if (!email || !senha) { UI.toast('Preencha email e senha', 'error'); return; }
    if (senha.length < 6) { UI.toast('Senha com no minimo 6 caracteres', 'error'); return; }

    const { error } = await db.rpc('rpc_admin_criar_usuario', { p_email: email, p_password: senha });
    if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
    UI.toast('Usuario criado');
    close();
    renderAdminUsuarios(document.getElementById('main-content'));
  });

  el.querySelector('#novo-email').focus();
}

function openVincularForm(user, empresas) {
  const empOpts = empresas.map(e => `<option value="${e.id}">${e.nome}</option>`).join('');
  const papeis = ['admin', 'gestor', 'operador', 'visualizador'];
  const papelOpts = papeis.map(p => `<option value="${p}">${p}</option>`).join('');

  const { el, close } = UI.modal(
    `Vincular: ${user.email}`,
    `<div class="form-group">
      <label>Empresa</label>
      <select class="form-control" id="vinc-empresa">
        <option value="">Selecione...</option>
        ${empOpts}
      </select>
    </div>
    <div class="form-group">
      <label>Papel</label>
      <select class="form-control" id="vinc-papel">${papelOpts}</select>
    </div>
    ${user.vinculos?.length ? `
      <div class="form-group">
        <label>Vinculos existentes</label>
        <div>${user.vinculos.map(v =>
          `<div style="margin:4px 0">
            ${v.empresa_nome} — ${v.papel}
            <button class="btn btn-sm btn-danger btn-unlink-inline" data-empresa="${v.empresa_id}" style="margin-left:8px">Remover</button>
          </div>`
        ).join('')}</div>
      </div>` : ''
    }`,
    `<button class="btn btn-outline btn-cancel">Fechar</button>
     <button class="btn btn-primary btn-save">Vincular</button>`
  );

  el.querySelector('.btn-cancel').addEventListener('click', close);

  el.querySelector('.btn-save').addEventListener('click', async () => {
    const empresaId = el.querySelector('#vinc-empresa').value;
    const papel = el.querySelector('#vinc-papel').value;
    if (!empresaId) { UI.toast('Selecione uma empresa', 'error'); return; }

    const { error } = await db.from('user_empresa').upsert(
      { user_id: user.user_id, empresa_id: empresaId, papel },
      { onConflict: 'user_id,empresa_id' }
    );
    if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
    UI.toast('Vinculo criado');
    close();
    renderAdminUsuarios(document.getElementById('main-content'));
  });

  el.querySelectorAll('.btn-unlink-inline').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await UI.confirm('Remover este vinculo?')) return;
      const { error } = await db.from('user_empresa')
        .delete()
        .eq('user_id', user.user_id)
        .eq('empresa_id', btn.dataset.empresa);
      if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
      UI.toast('Vinculo removido');
      close();
      renderAdminUsuarios(document.getElementById('main-content'));
    });
  });
}
