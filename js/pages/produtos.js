// MADG MES — CRUD Produtos

async function renderProdutos(container) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const { data, error } = await db.from('produtos').select('*').order('codigo');
    if (error) throw error;

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Produtos</h1>
        <button class="btn btn-primary" id="btn-novo-produto">+ Novo Produto</button>
      </div>
      ${UI.table([
        { key: 'codigo', label: 'Codigo' },
        { key: 'descricao', label: 'Descricao' },
        { key: 'unidade_medida', label: 'Unid.', align: 'center' },
        { key: 'peso_unitario', label: 'Peso (kg)', align: 'right', format: v => v ? OEE.num(v, 3) : '-' },
        { key: 'ativo', label: 'Status', align: 'center', format: v => v ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>' }
      ], data, { onEdit: true, onDelete: true, emptyMsg: 'Nenhum produto cadastrado' })}`;

    container.querySelector('#btn-novo-produto').addEventListener('click', () => openProdutoForm());
    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => openProdutoForm(data.find(d => d.id === btn.dataset.id)));
    });
    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (await UI.confirm('Excluir este produto?')) {
          const { error } = await db.from('produtos').delete().eq('id', btn.dataset.id);
          if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
          UI.toast('Produto excluido');
          renderProdutos(container);
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}

function openProdutoForm(item = null) {
  const isEdit = !!item;
  const unidades = ['kg', 'un', 'litros', 'metros', 'toneladas'];

  const { el, close } = UI.modal(
    isEdit ? 'Editar Produto' : 'Novo Produto',
    `<div class="form-group">
      <label>Codigo</label>
      <input type="text" class="form-control" id="prod-codigo" value="${item?.codigo || ''}" placeholder="Ex: P001.1">
    </div>
    <div class="form-group">
      <label>Descricao</label>
      <input type="text" class="form-control" id="prod-desc" value="${item?.descricao || ''}" placeholder="Nome do produto">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Unidade de Medida</label>
        <select class="form-control" id="prod-unidade">
          ${unidades.map(u => `<option value="${u}" ${u === (item?.unidade_medida || 'kg') ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Peso Unitario (kg)</label>
        <input type="number" step="0.001" class="form-control" id="prod-peso" value="${item?.peso_unitario || ''}" placeholder="0.000">
      </div>
    </div>
    <div class="form-group">
      <label><input type="checkbox" id="prod-ativo" ${item?.ativo !== false ? 'checked' : ''}> Ativo</label>
    </div>`,
    `<button class="btn btn-outline btn-cancel">Cancelar</button>
     <button class="btn btn-primary btn-save">Salvar</button>`
  );

  el.querySelector('.btn-cancel').addEventListener('click', close);
  el.querySelector('.btn-save').addEventListener('click', async () => {
    const codigo = el.querySelector('#prod-codigo').value.trim();
    const descricao = el.querySelector('#prod-desc').value.trim();
    if (!codigo || !descricao) { UI.toast('Codigo e descricao obrigatorios', 'error'); return; }

    const payload = {
      codigo, descricao,
      unidade_medida: el.querySelector('#prod-unidade').value,
      peso_unitario: parseFloat(el.querySelector('#prod-peso').value) || null,
      ativo: el.querySelector('#prod-ativo').checked
    };

    if (!isEdit) payload.empresa_id = currentEmpresaId;

    let error;
    if (isEdit) ({ error } = await db.from('produtos').update(payload).eq('id', item.id));
    else ({ error } = await db.from('produtos').insert(payload));

    if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
    UI.toast(isEdit ? 'Produto atualizado' : 'Produto criado');
    close();
    renderProdutos(document.getElementById('main-content'));
  });
}
