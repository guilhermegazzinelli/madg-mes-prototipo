// MADG MES — Painel Super Admin: gestao de empresas

async function renderAdminEmpresas(container) {
  if (!isSuperAdmin) {
    container.innerHTML = '<div class="empty-state"><p>Acesso restrito a super admin.</p></div>';
    return;
  }

  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const { data, error } = await db
      .from('empresa')
      .select('id, nome, segmento, criado_em')
      .order('nome');
    if (error) throw error;

    const contextoAtual = currentEmpresaId;
    const contextoInfo = contextoAtual
      ? `<div class="card" style="background:#fff3e0;border-left:4px solid var(--laranja);margin-bottom:16px">
           <strong>Contexto atual:</strong> ${currentEmpresaNome || contextoAtual}
           <button class="btn btn-sm btn-outline" id="btn-limpar-contexto" style="margin-left:12px">Sair do contexto</button>
         </div>`
      : `<div class="card" style="background:#f5f5f5;margin-bottom:16px">
           <em>Sem contexto de empresa. Selecione uma empresa abaixo para operar no sistema.</em>
         </div>`;

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Empresas (Super Admin)</h1>
        <button class="btn btn-primary" id="btn-nova-empresa">+ Nova Empresa</button>
      </div>
      ${contextoInfo}
      <div id="empresas-table">
        ${UI.table(
          [
            { key: 'nome', label: 'Nome' },
            { key: 'segmento', label: 'Segmento' },
            { key: 'criado_em', label: 'Criado em', format: v => v ? new Date(v).toLocaleDateString('pt-BR') : '-' },
            { key: 'id', label: 'Acoes', align: 'center',
              format: (id, row) => {
                const isCurrent = id === contextoAtual;
                return isCurrent
                  ? '<span class="badge badge-green">Contexto ativo</span>'
                  : `<button class="btn btn-sm btn-primary btn-entrar" data-id="${id}">Entrar como</button>`;
              }
            }
          ],
          data,
          { onEdit: true, onDelete: true, emptyMsg: 'Nenhuma empresa cadastrada' }
        )}
      </div>`;

    // Eventos
    container.querySelector('#btn-nova-empresa').addEventListener('click', () => openEmpresaForm());

    const btnLimpar = container.querySelector('#btn-limpar-contexto');
    if (btnLimpar) btnLimpar.addEventListener('click', () => selecionarEmpresa(null));

    container.querySelectorAll('.btn-entrar').forEach(btn => {
      btn.addEventListener('click', () => selecionarEmpresa(btn.dataset.id));
    });

    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = data.find(d => d.id === btn.dataset.id);
        openEmpresaForm(item);
      });
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const item = data.find(d => d.id === btn.dataset.id);
        if (!await UI.confirm(`Excluir "${item.nome}"? Todos os dados (unidades, linhas, produtos, ordens) serao PERDIDOS.`)) return;
        const { error } = await db.from('empresa').delete().eq('id', btn.dataset.id);
        if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
        UI.toast('Empresa excluida');
        renderAdminEmpresas(container);
      });
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}

function openEmpresaForm(item = null) {
  const isEdit = !!item;
  const segmentos = ['Alimentos', 'Metalurgia', 'Quimico', 'Vidro', 'Plasticos', 'Embalagens', 'Outro'];
  const segOpts = segmentos.map(s =>
    `<option value="${s}" ${item?.segmento === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  const { el, close } = UI.modal(
    isEdit ? 'Editar Empresa' : 'Nova Empresa',
    `<div class="form-group">
      <label>Nome</label>
      <input type="text" class="form-control" id="empresa-nome" value="${item?.nome || ''}" placeholder="Ex: HAOMA Chocolates">
    </div>
    <div class="form-group">
      <label>Segmento</label>
      <select class="form-control" id="empresa-segmento">
        <option value="">Selecione...</option>
        ${segOpts}
      </select>
    </div>
    ${isEdit ? '' : '<p class="text-muted" style="font-size:0.85rem">Apos criar, use "Entrar como" e cadastre unidades, linhas, produtos e motivos pelas telas normais.</p>'}`,
    `<button class="btn btn-outline btn-cancel">Cancelar</button>
     <button class="btn btn-primary btn-save">Salvar</button>`
  );

  el.querySelector('.btn-cancel').addEventListener('click', close);
  el.querySelector('.btn-save').addEventListener('click', async () => {
    const nome = el.querySelector('#empresa-nome').value.trim();
    const segmento = el.querySelector('#empresa-segmento').value || 'Outro';
    if (!nome) { UI.toast('Nome obrigatorio', 'error'); return; }

    const payload = { nome, segmento };
    let error;
    if (isEdit) {
      ({ error } = await db.from('empresa').update(payload).eq('id', item.id));
    } else {
      ({ error } = await db.from('empresa').insert(payload));
    }
    if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
    UI.toast(isEdit ? 'Empresa atualizada' : 'Empresa criada');
    close();
    renderAdminEmpresas(document.getElementById('main-content'));
  });

  el.querySelector('#empresa-nome').focus();
}
