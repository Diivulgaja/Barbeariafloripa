class AdminController {
    constructor(service) {
        this.service = service;

        // UI References
        this.views = ['dashboard', 'agenda', 'clients', 'services'];
        this.init();
    }

    async init() {
        // Attempt init if Supabase is ready
        if (!window.supabaseClient) {
            console.warn("Supabase client not ready yet for Admin.");
            return;
        }

        try {
            await this.refreshData();
            this.startAutoRefresh();
            console.log("Admin Controller Initialized");
        } catch (err) {
            console.error("Admin Init Error:", err);
            // window.toast("Erro ao inicializar admin", "error");
        }
    }

    async refreshData() {
        this.showLoader(true);
        await this.service.loadInitialData();
        this.renderCurrentView();
        this.showLoader(false);
    }

    startAutoRefresh() {
        setInterval(() => this.refreshData(), 30000); // 30s
    }

    showLoader(show) {
        const loader = document.getElementById('admin-header-loader');
        if (loader) {
            if (show) loader.classList.remove('hidden');
            else loader.classList.add('hidden');
        }
    }

    // --- NAVIGATION ---
    navigateTo(viewId) {
        this.views.forEach(v => {
            const el = document.getElementById(`admin-view-${v}`);
            if (el) el.classList.add('hidden');
        });

        const target = document.getElementById(`admin-view-${viewId}`);
        if (target) target.classList.remove('hidden');

        const titleMap = {
            dashboard: 'Visão Geral',
            agenda: 'Agenda',
            clients: 'Clientes',
            services: 'Catálogo'
        };

        const titleEl = document.getElementById('admin-page-title');
        if (titleEl) titleEl.textContent = titleMap[viewId] || 'Painel';

        // Highlight sidebar
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        // In a real app we'd map this better, but for now we trust the refresh will keep it clean
        // or we add ID to nav items.

        // Trigger render for specific view
        if (viewId === 'dashboard') this.renderDashboard();
        if (viewId === 'agenda') this.renderAgenda();
        if (viewId === 'clients') this.renderClients();
        if (viewId === 'services') this.renderServices();
    }

    renderCurrentView() {
        // Simple approach: render all or check which one is visible.
        // Ideally we track current state. For now, render all to keep sync.
        this.renderDashboard();
        this.renderAgenda();
        this.renderClients();
        // Services fetched on demand usually or cached.
        // this.renderServices(); // Call explicitly when needed or if cached
    }

    // --- DASHBOARD ---
    renderDashboard() {
        const stats = this.service.getDashboardStats();

        const countEl = document.getElementById('admin-kpi-count');
        const revEl = document.getElementById('admin-kpi-revenue');
        const nextNameEl = document.getElementById('admin-kpi-next-name');
        const nextTimeEl = document.getElementById('admin-kpi-next-time');

        if (countEl) countEl.textContent = stats.countToday;
        if (revEl) revEl.textContent = `R$ ${stats.revenue}`;
        if (nextNameEl) nextNameEl.textContent = stats.nextClient;
        if (nextTimeEl) nextTimeEl.textContent = stats.nextTime;
    }

    // --- AGENDA ---
    renderAgenda() {
        const tbody = document.getElementById('admin-agenda-table-body');
        if (!tbody) return;

        const appointments = this.service.getAgendaData();

        const statusColors = {
            'confirmado': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
            'pendente': 'bg-amber-500/10 text-amber-500 border-amber-500/20',
            'concluido': 'bg-green-500/10 text-green-500 border-green-500/20',
            'cancelado': 'bg-red-500/10 text-red-500 border-red-500/20'
        };

        tbody.innerHTML = appointments.map(a => {
            const dateObj = new Date(a.date_iso);
            const dateStr = dateObj.toLocaleDateString('pt-BR');
            // Escape HTML helper reused or duplicated? 
            // Let's implement a minimal one here or make it static in Service
            const safe = (str) => String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));

            return `
        <tr class="hover:bg-white/5 transition-colors group">
          <td class="p-5">
            <div class="font-bold text-white">${safe(a.details?.clientName || 'Cliente')}</div>
            <div class="text-xs text-zinc-500">${safe(a.details?.clientPhone || '')}</div>
          </td>
          <td class="p-5 text-zinc-300">${safe(a.details?.service?.name || '-')}</td>
          <td class="p-5 text-zinc-400 text-sm">${dateStr}</td>
          <td class="p-5 text-white font-bold">${safe(a.details?.time || '--:--')}</td>
          <td class="p-5">
            <span class="px-3 py-1 rounded-full text-xs font-bold border ${statusColors[a.status] || 'bg-zinc-800 text-zinc-400 border-white/10'} uppercase tracking-wider">
              ${a.status}
            </span>
          </td>
          <td class="p-5 text-right">
             <div class="flex gap-2 justify-end opacity-50 group-hover:opacity-100 transition-opacity">
               ${a.status !== 'concluido' ? `
               <button onclick="window.adminController.updateStatus(${a.id}, 'concluido')" class="p-2 hover:bg-green-500/20 text-green-500 rounded-lg transition-colors" title="Concluir" aria-label="Concluir agendamento">
                 <i data-lucide="check" class="w-4 h-4"></i>
               </button>` : ''}
               ${a.status !== 'cancelado' ? `
               <button onclick="window.adminController.updateStatus(${a.id}, 'cancelado')" class="p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors" title="Cancelar" aria-label="Cancelar agendamento">
                 <i data-lucide="x" class="w-4 h-4"></i>
               </button>` : ''}
             </div>
          </td>
        </tr>
      `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();
    }

    async updateStatus(id, status) {
        try {
            await this.service.toggleAppointmentStatus(id, status);
            window.toast(`Agendamento ${status}!`);
            this.renderAgenda(); // Re-render immediately
            this.renderDashboard(); // Update stats
        } catch (e) {
            console.error(e);
            window.toast("Erro ao atualizar status", "error");
        }
    }

    // --- CLIENTS ---
    renderClients() {
        const tbody = document.getElementById('admin-clients-table-body');
        if (!tbody) return;

        const clients = this.service.getClientsData();
        const safe = (str) => String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));

        tbody.innerHTML = clients.map(c => `
      <tr class="hover:bg-white/5 transition-colors">
        <td class="p-5 text-white font-bold">${safe(c.name)}</td>
        <td class="p-5 text-zinc-400 text-sm">${safe(c.phone)}</td>
        <td class="p-5 text-zinc-300">${c.visits}</td>
        <td class="p-5 text-emerald-500 font-bold">R$ ${c.totalSpent}</td>
        <td class="p-5 text-zinc-500 text-sm">${new Date(c.lastVisit).toLocaleDateString('pt-BR')}</td>
      </tr>
    `).join('');
    }

    // --- SERVICES ---
    async renderServices() {
        const grid = document.getElementById('admin-services-grid');
        if (!grid) return;

        const services = await this.service.getAllServices();
        const safe = (str) => String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));

        // Add "New Service" card
        let html = `
      <button onclick="window.adminController.openServiceModal()" class="w-full h-full admin-glass-panel p-6 rounded-2xl flex flex-col items-center justify-center gap-4 border-2 border-dashed border-white/10 hover:border-amber-500/50 cursor-pointer group transition-all min-h-[200px]" aria-label="Criar novo serviço">
        <div class="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-amber-500 transition-colors">
          <i data-lucide="plus" class="w-8 h-8 text-zinc-500 group-hover:text-white"></i>
        </div>
        <p class="font-bold text-zinc-400 group-hover:text-amber-500">Novo Serviço</p>
      </button>
    `;

        html += services.map(s => `
      <div class="admin-glass-panel p-6 rounded-2xl relative group">
        <div class="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
           <button onclick="window.adminController.openServiceModal(${s.id})" class="p-2 bg-zinc-800 hover:bg-amber-600 rounded-lg text-white" aria-label="Editar serviço"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
           <button onclick="window.adminController.deleteService(${s.id})" class="p-2 bg-zinc-800 hover:bg-red-600 rounded-lg text-white" aria-label="Excluir serviço"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
        <div class="flex items-center justify-between mb-4">
           <div class="p-3 bg-white/5 rounded-xl text-amber-500"><i data-lucide="scissors"></i></div>
           <span class="font-bold text-white bg-white/5 px-3 py-1 rounded-lg">R$ ${s.price}</span>
        </div>
        <h3 class="font-bold text-white text-lg mb-1">${safe(s.name)}</h3>
        <p class="text-xs text-zinc-500 mb-4 h-10 overflow-hidden text-ellipsis">${safe(s.description)}</p>
        <div class="flex gap-2 text-xs font-bold uppercase tracking-wider text-zinc-600">
           <span>${s.durationMin} min</span>
           ${s.popular ? '<span class="text-amber-500">• Popular</span>' : ''}
        </div>
      </div>
    `).join('');

        grid.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    async openServiceModal(id = null) {
        const services = await this.service.getAllServices();
        const s = id ? services.find(x => x.id === id) : { name: '', price: '', duration_min: 30, description: '', popular: false };
        if (!s) return;

        const modal = document.getElementById('service-modal');
        document.getElementById('service-modal-title').textContent = id ? 'Editar Serviço' : 'Novo Serviço';
        document.getElementById('svc-id').value = id || '';
        document.getElementById('svc-name').value = s.name;
        document.getElementById('svc-price').value = s.price;
        document.getElementById('svc-duration').value = s.durationMin || s.duration_min;
        document.getElementById('svc-desc').value = s.description || '';
        document.getElementById('svc-popular').checked = s.popular;

        modal.classList.remove('hidden');
    }

    async saveService(e) {
        e.preventDefault();
        const id = document.getElementById('svc-id').value;
        const data = {
            name: document.getElementById('svc-name').value,
            price: Number(document.getElementById('svc-price').value),
            duration_min: Number(document.getElementById('svc-duration').value),
            description: document.getElementById('svc-desc').value,
            popular: document.getElementById('svc-popular').checked
        };

        if (!data.name || !data.price) return window.toast("Nome e Preço obrigatórios", "error");

        try {
            await this.service.saveService(data, id);
            window.toast("Serviço salvo!");
            document.getElementById('service-modal').classList.add('hidden');
            this.renderServices();
            // Also update main site services if possible or reload
            if (window.renderServicesLanding) window.renderServicesLanding(); // Hack for now
        } catch (err) {
            console.error(err);
            window.toast("Erro ao salvar serviço", "error");
        }
    }

    async deleteService(id) {
        if (!confirm("Tem certeza?")) return;
        try {
            await this.service.removeService(id);
            window.toast("Serviço removido.");
            this.renderServices();
        } catch (err) {
            console.error(err);
            window.toast("Erro ao deletar", "error");
        }
    }

    // --- AUTH ---
    // Exposed for the login form
    login(e) {
        e.preventDefault();
        const email = document.getElementById('admin-email').value;
        if (email) {
            document.body.classList.add('admin-body');
            document.getElementById('admin-login-screen').classList.add('hidden');
            document.getElementById('admin-app-layout').classList.remove('hidden');

            this.init(); // Initialize actual data
        }
    }

    logout() {
        document.body.classList.remove('admin-body');
        window.location.hash = '#home';
        // Reload to clear state
        window.location.reload();
    }
}

// Instantiate and expose globally
window.initAdmin = function () {
    if (!window.supabaseClient) return; // Wait for it
    const repo = new AdminRepository(window.supabaseClient);
    const service = new AdminService(repo);
    window.adminController = new AdminController(service);
};

// Also expose handle functions for HTML onclick attributes
// But we used window.adminController in the HTML strings above.
// The initial login form still calls adminApp.login(event) in HTML, we need to change that in index.html later.
