// MADG MES — App Bootstrap

document.addEventListener('DOMContentLoaded', () => {
  // Registrar rotas
  Router.add('/dashboard', renderDashboard);
  Router.add('/ordens', renderOrdens);
  Router.add('/ordens/new', renderOrdemForm);
  Router.add('/ordens/:id', renderOrdemForm);
  Router.add('/ordens/:id/paradas', renderParadas);
  Router.add('/cadastros/unidades', renderUnidades);
  Router.add('/cadastros/linhas', renderLinhas);
  Router.add('/cadastros/produtos', renderProdutos);
  Router.add('/cadastros/taxas', renderTaxas);
  Router.add('/cadastros/motivos', renderMotivos);

  // Super Admin (visibilidade do menu controlada por supabase.js)
  Router.add('/admin/empresas', renderAdminEmpresas);
  Router.add('/admin/usuarios', renderAdminUsuarios);

  // Iniciar autenticacao (router inicia apos login)
  initAuth();

  // Toggle mobile cadastros submenu
  const cadastrosToggle = document.querySelector('.bottom-nav-cadastros');
  const cadastrosMenu = document.getElementById('cadastros-submenu');
  if (cadastrosToggle && cadastrosMenu) {
    cadastrosToggle.addEventListener('click', (e) => {
      e.preventDefault();
      cadastrosMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!cadastrosToggle.contains(e.target) && !cadastrosMenu.contains(e.target)) {
        cadastrosMenu.classList.add('hidden');
      }
    });
  }
});
