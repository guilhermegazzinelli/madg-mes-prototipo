// MADG MES — CRUD Motivos de Parada

async function renderMotivos(container) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const { data, error } = await db.from('motivos_parada').select('*').order('tipo, nome');
    if (error) throw error;

    const tipoBadge = (tipo) => {
      if (tipo === 'planejada') return '<span class="badge badge-blue">Planejada</span>';
      if (tipo === 'setup') return '<span class="badge badge-yellow">Setup</span>';
      return '<span class="badge badge-red">Nao Planejada</span>';
    };

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Motivos de Parada</h1>
        <button class="btn btn-primary" id="btn-novo-motivo">+ Novo Motivo</button>
      </div>
      ${UI.table([
        { key: 'nome', label: 'Motivo' },
        { key: 'tipo', label: 'Tipo', align: 'center', format: v => tipoBadge(v) },
        { key: 'ativo', label: 'Status', align: 'center', format: v => v ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>' }
      ], data, { onEdit: true, onDelete: true, emptyMsg: 'Nenhum motivo cadastrado' })}`;

    container.querySelector('#btn-novo-motivo').addEventListener('click', () => openMotivoForm());
    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => openMotivoForm(data.find(d => d.id === btn.dataset.id)));
    });
    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (await UI.confirm('Excluir este motivo?')) {
          const { error } = await db.from('motivos_parada').delete().eq('id', btn.dataset.id);
          if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
          UI.toast('Motivo excluido');
          renderMotivos(container);
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}

function openMotivoForm(item = null) {
  const isEdit = !!item;
  const { el, close } = UI.modal(
    isEdit ? 'Editar Motivo' : 'Novo Motivo',
    `<div class="form-group">
      <label>Nome</label>
      <input type="text" class="form-control" id="motivo-nome" value="${item?.nome || ''}" placeholder="Ex: Quebra mecanica">
    </div>
    <div class="form-group">
      <label>Tipo</label>
      <select class="form-control" id="motivo-tipo">
        <option value="nao_planejada" ${item?.tipo === 'nao_planejada' ? 'selected' : ''}>Nao Planejada</option>
        <option value="planejada" ${item?.tipo === 'planejada' ? 'selected' : ''}>Planejada</option>
        <option value="setup" ${item?.tipo === 'setup' ? 'selected' : ''}>Setup</option>
      </select>
    </div>
    <div class="form-group">
      <label><input type="checkbox" id="motivo-ativo" ${item?.ativo !== false ? 'checked' : ''}> Ativo</label>
    </div>`,
    `<button class="btn btn-outline btn-cancel">Cancelar</button>
     <button class="btn btn-primary btn-save">Salvar</button>`
  );

  el.querySelector('.btn-cancel').addEventListener('click', close);
  el.querySelector('.btn-save').addEventListener('click', async () => {
    const nome = el.querySelector('#motivo-nome').value.trim();
    if (!nome) { UI.toast('Nome obrigatorio', 'error'); return; }

    const payload = { nome, tipo: el.querySelector('#motivo-tipo').value, ativo: el.querySelector('#motivo-ativo').checked };
    if (!isEdit) payload.empresa_id = currentEmpresaId;

    let error;
    if (isEdit) ({ error } = await db.from('motivos_parada').update(payload).eq('id', item.id));
    else ({ error } = await db.from('motivos_parada').insert(payload));

    if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
    UI.toast(isEdit ? 'Motivo atualizado' : 'Motivo criado');
    close();
    renderMotivos(document.getElementById('main-content'));
  });
}
