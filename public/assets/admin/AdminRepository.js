class AdminRepository {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
    }

    async getAppointments(limit = 500) {
        const { data, error } = await this.supabase
            .from('appointments')
            .select('*')
            .order('date_iso', { ascending: true })
            .limit(limit);

        if (error) throw error;
        return data;
    }

    async updateAppointmentStatus(id, status) {
        const { error } = await this.supabase
            .from('appointments')
            .update({ status })
            .eq('id', id);

        if (error) throw error;
        return true;
    }

    async getServices() {
        const { data, error } = await this.supabase
            .from('services')
            .select('*')
            .order('id');

        if (error) throw error;
        return data;
    }

    async createService(serviceData) {
        const { error } = await this.supabase
            .from('services')
            .insert(serviceData);

        if (error) throw error;
        return true;
    }

    async updateService(id, serviceData) {
        const { error } = await this.supabase
            .from('services')
            .update(serviceData)
            .eq('id', id);

        if (error) throw error;
        return true;
    }

    async deleteService(id) {
        const { error } = await this.supabase
            .from('services')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    }
}

window.AdminRepository = AdminRepository;
