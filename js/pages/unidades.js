// MADG MES — CRUD Unidades

async function renderUnidades(container) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const { data, error } = await db
      .from('unidades')
      .select('*')
      .order('nome');

    if (error) throw error;

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Unidades Fabris</h1>
        <button class="btn btn-primary" id="btn-nova-unidade">+ Nova Unidade</button>
      </div>
      <div id="unidades-table">
        ${UI.table([
          { key: 'nome', label: 'Nome' },
          { key: 'ativo', label: 'Status', align: 'center', format: v => v ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>' }
        ], data, { onEdit: true, onDelete: true, emptyMsg: 'Nenhuma unidade cadastrada' })}
      </div>`;

    // Eventos
    container.querySelector('#btn-nova-unidade').addEventListener('click', () => openUnidadeForm());

    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = data.find(d => d.id === btn.dataset.id);
        openUnidadeForm(item);
      });
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (await UI.confirm('Excluir esta unidade?')) {
          const { error } = await db.from('unidades').delete().eq('id', btn.dataset.id);
          if (error) { UI.toast('Erro ao excluir: ' + error.message, 'error'); return; }
          UI.toast('Unidade excluida');
          renderUnidades(container);
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}

function openUnidadeForm(item = null) {
  const isEdit = !!item;
  const { el, close } = UI.modal(
    isEdit ? 'Editar Unidade' : 'Nova Unidade',
    `<div class="form-group">
      <label>Nome</label>
      <input type="text" class="form-control" id="unidade-nome" value="${item?.nome || ''}" placeholder="Ex: Fabrica Norte">
    </div>
    <div class="form-group">
      <label>
        <input type="checkbox" id="unidade-ativo" ${item?.ativo !== false ? 'checked' : ''}> Ativo
      </label>
    </div>`,
    `<button class="btn btn-outline btn-cancel">Cancelar</button>
     <button class="btn btn-primary btn-save">Salvar</button>`
  );

  el.querySelector('.btn-cancel').addEventListener('click', close);
  el.querySelector('.btn-save').addEventListener('click', async () => {
    const nome = el.querySelector('#unidade-nome').value.trim();
    if (!nome) { UI.toast('Nome obrigatorio', 'error'); return; }

    const payload = { nome, ativo: el.querySelector('#unidade-ativo').checked };
    if (!isEdit) payload.empresa_id = currentEmpresaId;

    let error;
    if (isEdit) {
      ({ error } = await db.from('unidades').update(payload).eq('id', item.id));
    } else {
      ({ error } = await db.from('unidades').insert(payload));
    }

    if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
    UI.toast(isEdit ? 'Unidade atualizada' : 'Unidade criada');
    close();
    renderUnidades(document.getElementById('main-content'));
  });

  el.querySelector('#unidade-nome').focus();
}
