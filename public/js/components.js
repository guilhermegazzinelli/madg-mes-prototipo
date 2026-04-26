// MADG MES — Componentes reutilizaveis

const UI = {
  /**
   * Renderiza gauge OEE (CSS conic-gradient)
   */
  gauge(valor, label, small = false) {
    const pct = Math.round((valor || 0) * 100);
    const cor = OEE.cor(valor || 0);
    const cls = small ? 'gauge gauge-sm' : 'gauge';
    return `
      <div class="${cls}" style="background: conic-gradient(${cor} ${pct}%, #e0e0e0 ${pct}%)">
        <div class="gauge-inner">
          <span class="gauge-value">${pct}%</span>
          <span class="gauge-label">${label}</span>
        </div>
      </div>`;
  },

  /**
   * Renderiza tabela HTML
   * @param {Array} columns - [{key, label, align?, format?}]
   * @param {Array} data - array de objetos
   * @param {Object} opts - {onEdit?, onDelete?, emptyMsg?}
   */
  table(columns, data, opts = {}) {
    if (!data || data.length === 0) {
      return `<div class="empty-state">
        <div class="icon">📋</div>
        <p>${opts.emptyMsg || 'Nenhum registro encontrado'}</p>
      </div>`;
    }

    const ths = columns.map(c =>
      `<th class="${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}">${c.label}</th>`
    ).join('');

    const actionTh = (opts.onEdit || opts.onDelete) ? '<th class="text-center">Acoes</th>' : '';

    const rows = data.map(row => {
      const tds = columns.map(c => {
        let val = row[c.key];
        if (c.format) val = c.format(val, row);
        if (val === null || val === undefined) val = '-';
        return `<td class="${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}">${val}</td>`;
      }).join('');

      let actionTd = '';
      if (opts.onEdit || opts.onDelete) {
        actionTd = '<td class="text-center" style="white-space:nowrap">';
        if (opts.onEdit) actionTd += `<button class="btn btn-sm btn-outline btn-edit" data-id="${row.id}">Editar</button> `;
        if (opts.onDelete) actionTd += `<button class="btn btn-sm btn-danger btn-delete" data-id="${row.id}">Excluir</button>`;
        actionTd += '</td>';
      }

      return `<tr>${tds}${actionTd}</tr>`;
    }).join('');

    return `<div class="table-wrapper"><table>
      <thead><tr>${ths}${actionTh}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  },

  /**
   * Mostra toast notification
   */
  toast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  /**
   * Mostra modal
   * @returns {Object} { el, close }
   */
  modal(title, bodyHTML, footerHTML = '') {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">${title}</span>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">${bodyHTML}</div>
        ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
      </div>`;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });

    return { el: overlay.querySelector('.modal'), close, overlay };
  },

  /**
   * Dialog de confirmacao
   * @returns {Promise<boolean>}
   */
  confirm(message) {
    return new Promise(resolve => {
      const { el, close } = this.modal('Confirmar', `<p>${message}</p>`, `
        <button class="btn btn-outline btn-cancel">Cancelar</button>
        <button class="btn btn-danger btn-confirm">Confirmar</button>
      `);
      el.querySelector('.btn-cancel').addEventListener('click', () => { close(); resolve(false); });
      el.querySelector('.btn-confirm').addEventListener('click', () => { close(); resolve(true); });
    });
  },

  /**
   * Select HTML a partir de array de opcoes
   */
  select(name, options, selected = '', placeholder = 'Selecione...', attrs = '') {
    const opts = options.map(o => {
      const val = typeof o === 'object' ? o.id : o;
      const label = typeof o === 'object' ? (o.nome || o.descricao || o.codigo) : o;
      return `<option value="${val}" ${val === selected ? 'selected' : ''}>${label}</option>`;
    }).join('');
    return `<select name="${name}" class="form-control" ${attrs}>
      <option value="">${placeholder}</option>
      ${opts}
    </select>`;
  }
};
