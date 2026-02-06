class AdminService {
    constructor(repository) {
        this.repo = repository;
        this.appointmentsCache = [];
    }

    async loadInitialData() {
        const rawAppts = await this.repo.getAppointments();
        // Parse details on load
        this.appointmentsCache = rawAppts.map(a => ({
            ...a,
            details: typeof a.details === 'string' ? JSON.parse(a.details) : a.details
        }));
        return this.appointmentsCache;
    }

    getDashboardStats() {
        const todayStr = new Date().toDateString();

        // KPI 1: Cortes Hoje
        const todaysAppts = this.appointmentsCache.filter(a => new Date(a.date_iso).toDateString() === todayStr);
        const countToday = todaysAppts.length;

        // KPI 2: Faturamento (Estimado) - apenas não cancelados
        const revenue = todaysAppts
            .filter(a => a.status !== 'cancelado')
            .reduce((sum, a) => sum + (a.details?.service?.price || 0), 0);

        // KPI 3: Próximo Cliente
        const now = new Date();
        const nextAppt = todaysAppts.find(a => new Date(a.date_iso) > now && a.status !== 'cancelado');

        return {
            countToday,
            revenue,
            nextClient: nextAppt ? (nextAppt.details?.clientName || 'Cliente') : 'Sem mais agendamentos',
            nextTime: nextAppt ? (nextAppt.details?.time || '--:--') : '--:--'
        };
    }

    getAgendaData() {
        return this.appointmentsCache;
    }

    async toggleAppointmentStatus(id, newStatus) {
        await this.repo.updateAppointmentStatus(id, newStatus);
        // Refresh local cache logic could go here, or simple reload
        return this.loadInitialData(); // Reload all for simplicity to ensure sync
    }

    getClientsData() {
        const clientsMap = {};

        this.appointmentsCache.forEach(a => {
            const phone = a.details?.clientPhone;
            if (!phone) return;

            if (!clientsMap[phone]) {
                clientsMap[phone] = {
                    name: a.details.clientName,
                    phone,
                    visits: 0,
                    totalSpent: 0,
                    lastVisit: a.date_iso
                };
            }

            clientsMap[phone].visits++;

            if (a.status !== 'cancelado') {
                clientsMap[phone].totalSpent += (a.details.service?.price || 0);
            }

            if (a.date_iso > clientsMap[phone].lastVisit) {
                clientsMap[phone].lastVisit = a.date_iso;
            }
        });

        return Object.values(clientsMap).sort((a, b) => b.totalSpent - a.totalSpent);
    }

    async getAllServices() {
        return await this.repo.getServices();
    }

    async saveService(serviceData, id = null) {
        if (id) {
            return await this.repo.updateService(id, serviceData);
        } else {
            return await this.repo.createService(serviceData);
        }
    }

    async removeService(id) {
        return await this.repo.deleteService(id);
    }
}

window.AdminService = AdminService;
