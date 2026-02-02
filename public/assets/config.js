// Config central do projeto
// ⚠️ ANON KEY é pública (ok ficar aqui). NUNCA coloque SERVICE_ROLE aqui.

window.APP_CONFIG = {
  SUPABASE_URL: "https://mfycmbbsijylwervuuwf.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1meWNtYmJzaWp5bHdlcnZ1dXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3Mzk0NTYsImV4cCI6MjA4NTMxNTQ1Nn0.cJ5gn5a2MKzux6Aigvno9hjOIcPEbnuBwukAuOPzRLs",
  BUSINESS: {
    name: "Ricardo Barbershop",
    city: "Florianópolis - SC",
    address: "Rua Irmã Bonavita, 123",
    instagram: "diivulgaja",
    whatsappE164: "554896689199",
    paymentPolicy: "local",
    whatsappPolicy: "Dúvidas ou cancelamentos (agendamento é pelo site).",
    openingHours: {
      0: null,
      1: { start: "09:00", end: "20:00" },
      2: { start: "09:00", end: "20:00" },
      3: { start: "09:00", end: "20:00" },
      4: { start: "09:00", end: "20:00" },
      5: { start: "09:00", end: "20:00" },
      6: { start: "09:00", end: "18:00" }
    },
    breaks: {
      1: [{ start: "12:00", end: "13:00" }],
      2: [{ start: "12:00", end: "13:00" }],
      3: [{ start: "12:00", end: "13:00" }],
      4: [{ start: "12:00", end: "13:00" }],
      5: [{ start: "12:00", end: "13:00" }],
      6: [{ start: "12:00", end: "13:00" }],
      0: []
    },
    slotMinutes: 30,
    maxDaysAhead: 14,
    minAdvanceMinutes: 60
  }
};
