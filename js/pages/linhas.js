// MADG MES — CRUD Linhas

async function renderLinhas(container) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const [{ data: linhas, error: e1 }, { data: unidades, error: e2 }] = await Promise.all([
      db.from('linhas').select('*, unidades(nome)').order('nome'),
      db.from('unidades').select('id, nome').eq('ativo', true).order('nome')
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Linhas de Producao</h1>
        <button class="btn btn-primary" id="btn-nova-linha">+ Nova Linha</button>
      </div>
      ${UI.table([
        { key: 'nome', label: 'Linha' },
        { key: 'unidades', label: 'Unidade', format: v => v?.nome || '-' },
        { key: 'descricao', label: 'Descricao' },
        { key: 'ativo', label: 'Status', align: 'center', format: v => v ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>' }
      ], linhas, { onEdit: true, onDelete: true, emptyMsg: 'Nenhuma linha cadastrada' })}`;

    container.querySelector('#btn-nova-linha').addEventListener('click', () => openLinhaForm(null, unidades));
    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => openLinhaForm(linhas.find(d => d.id === btn.dataset.id), unidades));
    });
    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (await UI.confirm('Excluir esta linha?')) {
          const { error } = await db.from('linhas').delete().eq('id', btn.dataset.id);
          if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
          UI.toast('Linha excluida');
          renderLinhas(container);
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}

function openLinhaForm(item, unidades) {
  const isEdit = !!item;
  const { el, close } = UI.modal(
    isEdit ? 'Editar Linha' : 'Nova Linha',
    `<div class="form-group">
      <label>Unidade</label>
      ${UI.select('unidade_id', unidades, item?.unidade_id || '')}
    </div>
    <div class="form-group">
      <label>Nome</label>
      <input type="text" class="form-control" id="linha-nome" value="${item?.nome || ''}" placeholder="Ex: Linha 01">
    </div>
    <div class="form-group">
      <label>Descricao</label>
      <input type="text" class="form-control" id="linha-desc" value="${item?.descricao || ''}" placeholder="Opcional">
    </div>
    <div class="form-group">
      <label><input type="checkbox" id="linha-ativo" ${item?.ativo !== false ? 'checked' : ''}> Ativo</label>
    </div>`,
    `<button class="btn btn-outline btn-cancel">Cancelar</button>
     <button class="btn btn-primary btn-save">Salvar</button>`
  );

  el.querySelector('.btn-cancel').addEventListener('click', close);
  el.querySelector('.btn-save').addEventListener('click', async () => {
    const unidade_id = el.querySelector('[name=unidade_id]').value;
    const nome = el.querySelector('#linha-nome').value.trim();
    if (!unidade_id || !nome) { UI.toast('Unidade e nome obrigatorios', 'error'); return; }

    const payload = { unidade_id, nome, descricao: el.querySelector('#linha-desc').value.trim() || null, ativo: el.querySelector('#linha-ativo').checked };

    let error;
    if (isEdit) ({ error } = await db.from('linhas').update(payload).eq('id', item.id));
    else ({ error } = await db.from('linhas').insert(payload));

    if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
    UI.toast(isEdit ? 'Linha atualizada' : 'Linha criada');
    close();
    renderLinhas(document.getElementById('main-content'));
  });
}
