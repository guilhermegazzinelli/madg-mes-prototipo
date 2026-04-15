// MADG MES — Hash-based SPA Router

const Router = {
  routes: [],

  add(path, handler) {
    // Convert :param to regex groups
    const pattern = path.replace(/:(\w+)/g, '(?<$1>[^/]+)');
    const regex = new RegExp(`^${pattern}$`);
    this.routes.push({ path, regex, handler });
  },

  resolve() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    const container = document.getElementById('main-content');

    for (const route of this.routes) {
      const match = hash.match(route.regex);
      if (match) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        route.handler(container, match.groups || {});
        this.updateNav(hash);
        return;
      }
    }

    // 404
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔍</div>
        <p>Pagina nao encontrada</p>
        <a href="#/dashboard" class="btn btn-primary">Voltar ao Dashboard</a>
      </div>`;
  },

  navigate(path) {
    window.location.hash = path;
  },

  updateNav(hash) {
    // Update sidebar
    document.querySelectorAll('.sidebar a').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      const isActive = hash === href.slice(1) ||
        (href !== '#/dashboard' && hash.startsWith(href.slice(1)));
      a.classList.toggle('active', isActive);
    });
    // Update bottom nav
    document.querySelectorAll('.bottom-nav a').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      const isActive = hash === href.slice(1) ||
        (href !== '#/dashboard' && hash.startsWith(href.slice(1)));
      a.classList.toggle('active', isActive);
    });
  },

  init() {
    window.addEventListener('hashchange', () => this.resolve());
    this.resolve();
  }
};
