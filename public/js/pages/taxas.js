// MADG MES — CRUD Taxas de Producao (Produto x Linha)

async function renderTaxas(container) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const [{ data: taxas, error: e1 }, { data: produtos, error: e2 }, { data: linhas, error: e3 }] = await Promise.all([
      db.from('taxas_producao').select('*, produtos(codigo, descricao), linhas(nome)').order('criado_em', { ascending: false }),
      db.from('produtos').select('id, codigo, descricao').eq('ativo', true).order('codigo'),
      db.from('linhas').select('id, nome, unidades(nome)').eq('ativo', true).order('nome')
    ]);
    if (e1) throw e1;

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Taxas de Producao</h1>
        <button class="btn btn-primary" id="btn-nova-taxa">+ Nova Taxa</button>
      </div>
      <p class="page-subtitle mb-2">Velocidade padrao de cada produto em cada linha (${taxas?.length || 0} registros)</p>
      ${UI.table([
        { key: 'produtos', label: 'Produto', format: (v) => v ? `<strong>${v.codigo}</strong> ${v.descricao}` : '-' },
        { key: 'linhas', label: 'Linha', format: (v) => v?.nome || '-' },
        { key: 'velocidade', label: 'Velocidade', align: 'right', format: (v, row) => `${OEE.num(v, 0)} ${row.unidade_velocidade}` },
      ], taxas, { onEdit: true, onDelete: true, emptyMsg: 'Nenhuma taxa cadastrada. Cadastre a velocidade de cada produto em cada linha.' })}`;

    container.querySelector('#btn-nova-taxa').addEventListener('click', () => openTaxaForm(null, produtos, linhas));
    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => openTaxaForm(taxas.find(d => d.id === btn.dataset.id), produtos, linhas));
    });
    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (await UI.confirm('Excluir esta taxa?')) {
          const { error } = await db.from('taxas_producao').delete().eq('id', btn.dataset.id);
          if (error) { UI.toast('Erro: ' + error.message, 'error'); return; }
          UI.toast('Taxa excluida');
          renderTaxas(container);
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
  }
}

function openTaxaForm(item, produtos, linhas) {
  const isEdit = !!item;

  const prodOptions = (produtos || []).map(p =>
    `<option value="${p.id}" ${p.id === item?.produto_id ? 'selected' : ''}>${p.codigo} - ${p.descricao}</option>`
  ).join('');

  const linhaOptions = (linhas || []).map(l =>
    `<option value="${l.id}" ${l.id === item?.linha_id ? 'selected' : ''}>${l.nome} (${l.unidades?.nome || ''})</option>`
  ).join('');

  const { el, close } = UI.modal(
    isEdit ? 'Editar Taxa' : 'Nova Taxa',
    `<div class="form-group">
      <label>Produto</label>
      <select class="form-control" id="taxa-produto" ${isEdit ? 'disabled' : ''}>
        <option value="">Selecione...</option>${prodOptions}
      </select>
    </div>
    <div class="form-group">
      <label>Linha</label>
      <select class="form-control" id="taxa-linha" ${isEdit ? 'disabled' : ''}>
        <option value="">Selecione...</option>${linhaOptions}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Velocidade</label>
        <input type="number" step="0.01" class="form-control" id="taxa-vel" value="${item?.velocidade || ''}" placeholder="0">
      </div>
      <div class="form-group">
        <label>Unidade</label>
        <select class="form-control" id="taxa-unid">
          ${['un/h', 'kg/h'].map(u => `<option value="${u}" ${u === (item?.unidade_velocidade || 'un/h') ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
      </div>
    </div>`,
    `<button class="btn btn-outline btn-cancel">Cancelar</button>
     <button class="btn btn-primary btn-save">Salvar</button>`
  );

  el.querySelector('.btn-cancel').addEventListener('click', close);
  el.querySelector('.btn-save').addEventListener('click', async () => {
    const produto_id = el.querySelector('#taxa-produto').value;
    const linha_id = el.querySelector('#taxa-linha').value;
    const velocidade = parseFloat(el.querySelector('#taxa-vel').value);

    if (!isEdit && (!produto_id || !linha_id)) { UI.toast('Selecione produto e linha', 'error'); return; }
    if (!velocidade || velocidade <= 0) { UI.toast('Velocidade deve ser positiva', 'error'); return; }

    const payload = {
      velocidade,
      unidade_velocidade: el.querySelector('#taxa-unid').value
    };
    if (!isEdit) {
      payload.produto_id = produto_id;
      payload.linha_id = linha_id;
    }

    let error;
    if (isEdit) ({ error } = await db.from('taxas_producao').update(payload).eq('id', item.id));
    else ({ error } = await db.from('taxas_producao').insert(payload));

    if (error) {
      if (error.message.includes('unique') || error.message.includes('duplicate')) {
        UI.toast('Ja existe uma taxa para este produto nesta linha', 'error');
      } else {
        UI.toast('Erro: ' + error.message, 'error');
      }
      return;
    }
    UI.toast(isEdit ? 'Taxa atualizada' : 'Taxa criada');
    close();
    renderTaxas(document.getElementById('main-content'));
  });
}
