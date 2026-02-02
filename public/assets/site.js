import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CFG = window.APP_CONFIG || {};
const BUSINESS = CFG.BUSINESS || {};
const SUPABASE_URL = CFG.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = CFG.SUPABASE_ANON_KEY || "";

// ====== TOAST ======
function toast(msg, type = "success") {
  const c = document.getElementById('site-toast-container');
  const t = document.createElement('div');
  const colors = { success: "border-l-green-500", error: "border-l-red-500", info: "border-l-amber-500" };
  t.className = `toast show glass-panel px-4 py-3 rounded-lg border-l-4 ${colors[type] || colors.info} text-sm text-white shadow-xl flex items-center gap-2 min-w-[260px]`;
  const icon = type === "error" ? "alert-circle" : type === "success" ? "check-circle" : "info";
  t.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4"></i> <div class="leading-tight">${escapeHtml(msg)}</div>`;
  c.appendChild(t);
  lucide.createIcons();
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, 3200);
}

// ====== DATA (você pode puxar do banco depois) ======
// ====== DATA (Fetched dynamically now) ======
let SERVICES = []; // Will be populated from DB

// ... (keep BARBERS as is or fetch too) ...

// ====== DATA LOADING ======
async function loadServices() {
  const { data, error } = await supabaseClient.from('services').select('*').order('id');
  if (data) SERVICES = data;
  else console.warn("Erro ao carregar serviços", error);
}

const BARBERS = [
  { id: 1, name: "Ricardo Silva", role: "Master", image: "https://images.unsplash.com/photo-1583900985315-95fdb19276a8?auto=format&fit=crop&q=80&w=200&h=200" },
  { id: 2, name: "André Costa", role: "Pro", image: "https://images.unsplash.com/photo-1618077553780-7553d680668f?auto=format&fit=crop&q=80&w=200&h=200" },
  { id: 3, name: "Qualquer Profissional", role: "Disponível", image: null }
];

// ====== STATE ======
let supabaseClient = null;
let currentUser = null;
let currentStep = 1;
let pendingBooking = false;
let bookingData = { service: null, barber: null, date: null, time: null, clientName: "", clientPhone: "", paymentMethod: "local", notes: "", rescheduleFromId: null };
let appointments = [];
let unavailableSlots = [];
let servicesSearch = "";

// ====== UI helpers ======
function qs(id) { return document.getElementById(id); }

function updateUIForGuest() {
  qs("nav-guest")?.classList.remove("hidden");
  qs("nav-user")?.classList.add("hidden");
  qs("mobile-guest")?.classList.remove("hidden");
  qs("mobile-user")?.classList.add("hidden");
}

function updateUIForUser(user) {
  qs("nav-guest")?.classList.add("hidden");
  qs("nav-user")?.classList.remove("hidden");
  qs("mobile-guest")?.classList.add("hidden");
  qs("mobile-user")?.classList.remove("hidden");

  const fullName = user?.name || user?.email || "Usuário";
  qs("user-name-display").textContent = fullName;
  qs("mobile-user-name").textContent = fullName;

  const initial = (fullName || "U").trim().charAt(0).toUpperCase();
  qs("user-initial").textContent = initial;
  qs("mobile-user-initial").textContent = initial;
}

// ====== AUTH ======
function closeAuthModalImpl() {
  qs('auth-modal').classList.add('hidden');
  pendingBooking = false;
  qs('form-reset').classList.add('hidden');
}

function switchAuthTabImpl(tab) {
  const login = qs('form-login');
  const reg = qs('form-register');
  const tLogin = qs('tab-login');
  const tReg = qs('tab-register');

  if (tab === 'login') {
    login.classList.remove('hidden');
    reg.classList.add('hidden');
    tLogin.classList.add('text-amber-500', 'border-amber-500');
    tReg.classList.remove('text-amber-500', 'border-amber-500');
    tReg.classList.add('text-zinc-400');
  } else {
    reg.classList.remove('hidden');
    login.classList.add('hidden');
    tReg.classList.add('text-amber-500', 'border-amber-500');
    tLogin.classList.remove('text-amber-500', 'border-amber-500');
    tLogin.classList.add('text-zinc-400');
  }
}

function openResetPasswordImpl() {
  qs('form-login').classList.add('hidden');
  qs('form-reset').classList.remove('hidden');
}

function backToLoginImpl() {
  qs('form-reset').classList.add('hidden');
  switchAuthTabImpl('login');
}

async function handleResetPasswordImpl() {
  const email = qs('reset-email').value.trim();
  if (!email) return toast("Digite seu e-mail.", "error");
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
  if (error) return toast(error.message, "error");
  toast("Link enviado! Verifique seu e-mail.", "success");
  backToLoginImpl();
}

async function handleLoginImpl() {
  const email = qs('login-email').value.trim();
  const password = qs('login-password').value;
  if (!email || !password) return toast("Preencha e-mail e senha.", "error");

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return toast(error.message, "error");
  toast("Login efetuado!", "success");
  closeAuthModalImpl();
}

async function handleRegisterImpl() {
  const name = qs('register-name').value.trim();
  const email = qs('register-email').value.trim();
  const password = qs('register-password').value;
  if (!name || !email || !password) return toast("Preencha nome, e-mail e senha.", "error");

  const { error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } }
  });
  if (error) return toast(error.message, "error");
  toast("Conta criada! Verifique seu e-mail se for exigido.", "success");
  switchAuthTabImpl('login');
}

async function handleGoogleLoginImpl() {
  const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google' });
  if (error) toast(error.message, "error");
}

async function logoutImpl() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) return toast(error.message, "error");
  currentUser = null;
  updateUIForGuest();
  toast("Saiu.", "info");
  closeProfileDropdown();
}

// ====== SESSION ======
function handleSession(session) {
  if (!session || !session.user) {
    currentUser = null;
    updateUIForGuest();
    return;
  }
  const u = session.user;
  currentUser = {
    id: u.id,
    email: u.email,
    name: u.user_metadata?.full_name || u.user_metadata?.name || u.email
  };
  updateUIForUser(currentUser);

  // se o usuário clicou em "Agendar" antes, abrir agora
  if (pendingBooking) {
    pendingBooking = false;
    openBookingImpl();
  }
}

// ====== BOOKING ======
function startBookingImpl() {
  const savedName = localStorage.getItem('client_name') || (currentUser?.name || '');
  const savedPhone = localStorage.getItem('client_phone') || '';
  bookingData = { service: null, barber: null, date: null, time: null, clientName: savedName, clientPhone: savedPhone, paymentMethod: 'local', notes: '', rescheduleFromId: null };
  currentStep = 1;
  openBookingImpl();
}

function openBookingImpl() {
  if (!currentUser) {
    pendingBooking = true;
    window.openAuthModal('login');
    return;
  }
  qs('booking-modal').classList.remove('hidden');
  updateSummary();
  renderStep();
  lucide.createIcons();
}

function closeBookingImpl() { qs('booking-modal').classList.add('hidden'); }

function prevStepImpl() { currentStep = Math.max(1, currentStep - 1); renderStep(); }

async function nextStepImpl() {
  if (currentStep === 1 && !bookingData.service) return toast("Selecione um serviço.", "error");
  if (currentStep === 2 && !bookingData.barber) return toast("Selecione um profissional.", "error");
  if (currentStep === 3 && (!bookingData.date || !bookingData.time)) return toast("Selecione data e horário.", "error");
  if (currentStep === 4) { await saveAppointment(); return; }
  currentStep++;
  renderStep();
}

function selectServiceImpl(id) {
  bookingData.service = SERVICES.find(x => x.id === id) || null;
  bookingData.time = null;
  // Initialize user data if needed (in case startBooking wasn't called)
  if (!bookingData.clientName && currentUser) bookingData.clientName = currentUser.name;

  updateSummary();
  currentStep = 2;
  openBookingImpl();
}

function selectBarberImpl(id) {
  bookingData.barber = BARBERS.find(x => x.id === id) || null;
  bookingData.time = null;
  updateSummary();
  currentStep = 3;
  renderStep();
}

function getLocalYMD(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function selectDateImpl(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  bookingData.date = new Date(y, m - 1, d);
  bookingData.time = null;
  updateSummary();

  const container = qs('slots-container');
  if (container) container.innerHTML = Array(8).fill(0).map(() => `<div class="h-12 rounded-lg skeleton"></div>`).join('');

  try {
    unavailableSlots = await fetchUnavailableSlots(ymd, bookingData.barber?.id);
  } catch (e) {
    console.error("Erro ao buscar horários", e);
    unavailableSlots = [];
  }
  renderStep();
}

function selectTimeImpl(t) {
  if (unavailableSlots.includes(t)) return toast("Horário indisponível. Escolha outro.", "error");
  bookingData.time = t;
  updateSummary();
  currentStep = 4;
  renderStep();
}

function updateClientDataImpl(field, val) {
  bookingData[field] = val;
  updateSummary();
}

function updateSummary() {
  qs('summary-service').textContent = bookingData.service?.name || '--';
  qs('summary-barber').textContent = bookingData.barber?.name || '--';
  qs('summary-total').textContent = bookingData.service ? `R$ ${bookingData.service.price},00` : 'R$ 0,00';
  qs('mobile-total').textContent = qs('summary-total').textContent;

  const dateEl = qs('summary-date');
  if (bookingData.date && bookingData.time) {
    const dt = new Date(bookingData.date);
    dateEl.textContent = `${dt.toLocaleDateString('pt-BR')} às ${bookingData.time}`;
  } else {
    dateEl.textContent = '--';
  }

  const desktop = qs('booking-footer-action');
  const mobile = qs('mobile-footer-action');

  const prevBtn = currentStep > 1 ? `<button onclick="prevStep()" class="w-full border border-white/10 text-zinc-300 py-3 rounded-xl mb-2">Voltar</button>` : '';
  const nextLbl = currentStep === 4 ? 'Confirmar' : 'Continuar';
  const nextCls = currentStep === 4 ? 'bg-amber-600 text-white' : 'bg-white text-black';

  const actions = `${prevBtn}<button onclick="nextStep()" class="w-full ${nextCls} font-bold py-3 rounded-xl">${nextLbl}</button>`;
  if (desktop) desktop.innerHTML = actions;
  if (mobile) mobile.innerHTML = `<button onclick="nextStep()" class="${nextCls} font-bold py-3 px-5 rounded-xl">${nextLbl}</button>`;
}

function renderStep() {
  const content = qs('booking-content');
  const hint = qs('step-hint');

  for (let i = 1; i <= 4; i++) {
    const dot = qs(`dot-${i}`);
    const line = qs(`line-${i}`);
    if (dot) {
      dot.classList.toggle('active', i <= currentStep);
      dot.classList.toggle('completed', i < currentStep);
    }
    if (line) line.classList.toggle('completed', i < currentStep);
  }

  let html = '<div class="animate-fade-in-up pb-24 md:pb-0 h-full flex flex-col">';

  if (currentStep === 1) {
    hint.textContent = "Escolha o serviço desejado.";
    html += `
      <h4 class="text-2xl font-bold text-white mb-6">Escolha o Serviço</h4>
      <div class="grid grid-cols-1 gap-4">
        ${SERVICES.map(s => `
        <div onclick="selectService(${s.id})" class="group relative overflow-hidden glass-panel p-5 rounded-2xl border border-white/5 cursor-pointer flex justify-between items-center transition-all duration-300 hover:bg-white/5 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 ${bookingData.service?.id === s.id ? 'border-amber-500 bg-amber-500/5' : ''}">
           <div class="flex items-center gap-5 relative z-10">
              <div class="w-14 h-14 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center text-amber-500 shadow-inner group-hover:scale-110 transition-transform duration-300">
                <i data-lucide="scissors" class="w-6 h-6"></i>
              </div>
              <div>
                <h4 class="font-bold text-white text-lg group-hover:text-amber-500 transition-colors">${escapeHtml(s.name)}</h4>
                <p class="text-zinc-400 text-sm">${s.durationMin} min • <span class="text-zinc-500">${escapeHtml(s.description)}</span></p>
              </div>
           </div>
           <div class="flex flex-col items-end gap-1 relative z-10">
              <span class="text-xl font-bold text-white">R$ ${s.price}</span>
              ${s.popular ? `<span class="bg-amber-500/20 text-amber-500 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-amber-500/20">Popular</span>` : ''}
           </div>
           
           <!-- Hover effect background -->
           <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none"></div>
        </div>`).join('')}
      </div>`;
  }

  if (currentStep === 2) {
    hint.textContent = "Selecione o profissional.";
    html += `
      <h4 class="text-2xl font-bold text-white mb-6">Profissional</h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 auto-rows-fr">
        ${BARBERS.map(b => `
        <div onclick="selectBarber(${b.id})" class="group glass-panel p-6 rounded-2xl border border-white/5 cursor-pointer flex flex-col items-center gap-4 text-center transition-all duration-300 hover:bg-white/5 hover:border-amber-500/50 hover:-translate-y-1 ${bookingData.barber?.id === b.id ? 'border-amber-500 bg-amber-500/5 ring-1 ring-amber-500/50' : ''}">
          <div class="w-24 h-24 rounded-full bg-zinc-800 overflow-hidden border-4 border-zinc-900 shadow-xl group-hover:border-amber-500/50 transition-colors">
            ${b.image ? `<img src="${b.image}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="${escapeHtml(b.name)}">` : `<div class="w-full h-full flex items-center justify-center text-zinc-600"><i data-lucide="user" class="w-10 h-10"></i></div>`}
          </div>
          <div>
            <h4 class="font-bold text-white text-lg">${escapeHtml(b.name)}</h4>
            <div class="inline-block mt-1 px-3 py-1 rounded-full bg-zinc-900/50 border border-white/5 text-xs text-amber-500 font-bold uppercase tracking-wider">
              ${escapeHtml(b.role)}
            </div>
          </div>
        </div>`).join('')}
      </div>`;
  }

  if (currentStep === 3) {
    hint.textContent = "Data e Hora";
    const todayStr = getLocalYMD(new Date());
    const selectedDateStr = bookingData.date ? getLocalYMD(bookingData.date) : todayStr;

    html += `
      <div class="flex flex-col h-full">
        <h4 class="text-2xl font-bold text-white mb-6">Data e Hora</h4>
        
        <div class="mb-8">
          <label class="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Selecione o Dia</label>
          <div class="relative">
             <input type="date" id="date-input-picker" value="${selectedDateStr}" min="${todayStr}" onchange="selectDate(this.value)" class="w-full bg-zinc-900 border border-white/10 text-white font-bold rounded-xl py-4 px-5 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all cursor-pointer">
             <i data-lucide="calendar" class="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"></i>
          </div>
        </div>

        <div class="flex-1">
          <label class="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Horários Disponíveis</label>
          ${bookingData.date ?
        `<div id="slots-container" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 animate-fade-in-up"></div>` :
        `<div class="h-40 flex flex-col items-center justify-center text-zinc-500 bg-white/5 rounded-xl border border-white/5 border-dashed">
                <i data-lucide="calendar-clock" class="w-8 h-8 mb-2 opacity-50"></i>
                <span class="text-sm">Selecione um dia acima</span>
             </div>`
      }
        </div>
      </div>
    `;

    // auto-load today if not set
    if (!bookingData.date) setTimeout(() => selectDateImpl(todayStr), 0);
  }

  if (currentStep === 4) {
    hint.textContent = "Confirme seus dados.";
    html += `
      <div class="flex items-center justify-center h-full">
        <div class="w-full max-w-md bg-zinc-900/40 backdrop-blur-md p-8 rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden">
          <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-amber-700"></div>
          
          <h4 class="text-2xl font-bold text-white mb-2 text-center">Quase lá!</h4>
          <p class="text-zinc-400 text-sm text-center mb-8">Confirme seus dados para finalizar o agendamento.</p>

          <div class="space-y-5">
            <div class="space-y-2">
              <label class="text-xs font-bold text-zinc-400 uppercase ml-1">Seu Nome</label>
              <div class="relative">
                <i data-lucide="user" class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500"></i>
                <input type="text" oninput="updateClientData('clientName', this.value)" value="${escapeHtml(bookingData.clientName || '')}" class="w-full bg-black/20 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-zinc-600 focus:border-amber-500 focus:bg-black/40 transition-all outline-none" placeholder="Como prefere ser chamado?">
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-xs font-bold text-zinc-400 uppercase ml-1">WhatsApp</label>
              <div class="relative">
                <i data-lucide="smartphone" class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500"></i>
                <input type="tel" oninput="updateClientData('clientPhone', this.value)" value="${escapeHtml(bookingData.clientPhone || '')}" class="w-full bg-black/20 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-zinc-600 focus:border-amber-500 focus:bg-black/40 transition-all outline-none" placeholder="(00) 00000-0000">
              </div>
            </div>

            <div class="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 flex gap-3 text-amber-200 text-sm mt-2">
              <i data-lucide="info" class="w-5 h-5 shrink-0 text-amber-500"></i>
              <p>O pagamento é realizado <b>apenas no local</b> após o serviço.</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  if (currentStep === 5) {
    const formattedDate = bookingData.date.toLocaleDateString('pt-BR');

    // Google Calendar Link Construction
    const serviceName = bookingData.service?.name || "Corte";
    const startTimeComp = bookingData.time.split(':');
    const startHour = parseInt(startTimeComp[0]);
    const startMin = parseInt(startTimeComp[1]);

    // Create Date objects for start and end
    const startDate = new Date(bookingData.date);
    startDate.setHours(startHour, startMin);

    const endDate = new Date(startDate);
    endDate.setMinutes(startDate.getMinutes() + (bookingData.service?.durationMin || 30));

    // Helper for Google format YYYYMMDDTHHMMSSZ (UTC)
    const toGCalTime = (date) => {
      return date.toISOString().replace(/-|:|\.\d\d\d/g, "");
    };

    const gCalUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Barbearia: ' + serviceName)}&dates=${toGCalTime(startDate)}/${toGCalTime(endDate)}&details=${encodeURIComponent('Agendamento confirmado no Ricardo Barbershop.')}&location=${encodeURIComponent('Ricardo Barbershop - Florianópolis')}&sf=true&output=xml`;

    html += `
      <div class="flex flex-col items-center justify-center h-full text-center animate-scale-up">
        
        <div class="relative mb-8">
           <div class="absolute inset-0 bg-green-500 rounded-full blur-[40px] opacity-20"></div>
           <div class="w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-700 rounded-full flex items-center justify-center shadow-2xl relative z-10 mx-auto">
              <i data-lucide="check" class="w-12 h-12 text-white"></i>
           </div>
        </div>

        <h3 class="text-4xl font-bold text-white mb-2">Confirmado!</h3>
        <p class="text-zinc-400 text-lg mb-8 max-w-sm">
          Seu horário para <b>${escapeHtml(bookingData.service?.name)}</b> ficou agendado para <b>${formattedDate} às ${bookingData.time}</b>.
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
           <a href="${gCalUrl}" target="_blank" class="flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold border border-white/10 hover:border-white/20 transition-all group">
              <i data-lucide="calendar" class="w-5 h-5 text-amber-500 group-hover:scale-110 transition-transform"></i>
              Add ao Agenda
           </a>
           
           <button onclick="closeBooking(); openAppointments();" class="flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold border border-white/10 hover:border-white/20 transition-all">
              <i data-lucide="list" class="w-5 h-5 text-blue-400"></i>
              Meus Cortes
           </button>

           <button onclick="closeBooking()" class="col-span-1 sm:col-span-2 px-6 py-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold shadow-lg shadow-amber-900/20 transition-all transform hover:-translate-y-0.5">
              Voltar ao Início
           </button>
        </div>

        <p class="text-zinc-600 text-xs mt-8">Te esperamos lá!</p>
      </div>`;
  }

  content.innerHTML = html + '</div>';
  lucide.createIcons();
  updateSummary(); // Refresh styled summary if needed
  if (currentStep === 3 && bookingData.date) renderSlots();
}

function renderSlots() {
  const grid = qs('slots-container');
  if (!grid || !bookingData.date) return;

  const slots = buildSlots(bookingData.date);
  if (!slots.length) {
    grid.innerHTML = `<div class="col-span-full text-center py-10 text-zinc-500 border border-white/5 rounded-xl">
      <p class="mb-2 font-bold text-amber-500">Sem horários disponíveis.</p>
      <p class="text-xs">Estamos fechados neste dia ou o expediente já encerrou.</p>
    </div>`;
    return;
  }

  grid.innerHTML = slots.map(slot => {
    if (slot.status === 'busy') {
      return `<button disabled class="slot-btn py-4 rounded-xl border border-white/5 text-zinc-600 bg-zinc-900/30 text-sm font-bold relative opacity-50 cursor-not-allowed transition-colors"><span class="line-through decoration-white/20">${slot.time}</span></button>`;
    }
    return `<button onclick="selectTime('${slot.time}')" class="slot-btn py-4 rounded-xl border bg-zinc-800/50 border-white/5 text-zinc-200 font-bold hover:bg-amber-600 hover:text-white hover:border-amber-600 hover:shadow-lg hover:shadow-amber-900/40 hover:-translate-y-1 transition-all duration-300 ${bookingData.time === slot.time ? 'bg-amber-600 border-amber-600 text-white shadow-lg shadow-amber-900/40 -translate-y-1 ring-2 ring-amber-400/30' : ''}">${slot.time}</button>`;
  }).join('');
}

// ====== SLOT HELPERS ======
function timeToMinutes(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minutesToTime(min) { return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }
function getOpenRangeForDate(d) {
  const k = d.getDay();
  const o = BUSINESS.openingHours?.[k];
  return o ? { startMin: timeToMinutes(o.start), endMin: timeToMinutes(o.end), dayKey: k } : null;
}
function isInBreak(k, t) {
  const b = BUSINESS.breaks?.[k] || [];
  const m = timeToMinutes(t);
  return b.some(x => m >= timeToMinutes(x.start) && m < timeToMinutes(x.end));
}
function isPast(dateObj, t) {
  const now = new Date();
  const checkDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const [h, m] = t.split(':').map(Number);
  checkDate.setHours(h, m, 0, 0);
  return checkDate < now;
}
function buildSlots(d) {
  const r = getOpenRangeForDate(d);
  if (!r) return [];
  const dur = bookingData.service?.durationMin || 30;
  const s = [];
  for (let m = r.startMin; m + dur <= r.endMin; m += (BUSINESS.slotMinutes || 30)) {
    const t = minutesToTime(m);
    let status = 'available';
    if (unavailableSlots.includes(t)) status = 'busy';
    else if (isInBreak(r.dayKey, t)) status = 'busy';
    else if (isPast(d, t)) status = 'busy';
    s.push({ time: t, status });
  }
  return s;
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

// ====== DB ======
async function fetchUnavailableSlots(dateStr, barberId) {
  if (!dateStr) return [];
  // busca agendamentos do dia
  const { data, error } = await supabaseClient
    .from('appointments')
    .select('details,date_iso')
    .gte('date_iso', `${dateStr}T00:00:00`)
    .lt('date_iso', `${dateStr}T23:59:59`);

  if (error) {
    console.warn("fetchUnavailableSlots error", error);
    return [];
  }

  return (data || [])
    .map(r => (typeof r.details === 'string' ? JSON.parse(r.details) : r.details))
    .filter(d => (!barberId || barberId === 3 || d?.barber?.id === barberId))
    .map(d => d?.time)
    .filter(Boolean);
}

async function saveAppointment() {
  if (!bookingData.clientName) return toast("Informe seu nome.", "error");
  if (!bookingData.clientPhone) return toast("Informe seu WhatsApp.", "error");

  localStorage.setItem('client_name', bookingData.clientName);
  localStorage.setItem('client_phone', bookingData.clientPhone);

  const y = bookingData.date.getFullYear();
  const m = String(bookingData.date.getMonth() + 1).padStart(2, '0');
  const d = String(bookingData.date.getDate()).padStart(2, '0');
  const isoString = `${y}-${m}-${d}T${bookingData.time}:00`;

  const payload = {
    user_id: currentUser.id,
    details: bookingData,
    date_iso: isoString,
    status: 'confirmado'
  };

  const { error } = await supabaseClient.from('appointments').insert(payload);
  if (error) {
    console.warn(error);
    return toast("Erro ao salvar. Verifique se o horário já foi ocupado.", "error");
  }

  toast("Agendamento confirmado!");
  currentStep = 5;
  renderStep();
  await fetchAppointments(currentUser.id);
}

async function fetchAppointments(uid) {
  const { data, error } = await supabaseClient
    .from('appointments')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn(error);
    return;
  }

  appointments = (data || []).map(i => ({
    id: i.id,
    ...(typeof i.details === 'string' ? JSON.parse(i.details) : i.details),
    status: i.status,
    date_iso: i.date_iso
  }));

  renderAppointments();
}

function renderAppointments() {
  const c = qs('appointments-content');
  if (!c) return;
  if (!appointments.length) {
    c.innerHTML = `<div class="text-center py-10 text-zinc-500">Sem agendamentos.</div>`;
    return;
  }

  c.innerHTML = appointments.map(a => {
    const date = new Date(a.date_iso);
    const dateStr = date.toLocaleDateString('pt-BR');
    const waTxt = `Olá! Gostaria de cancelar o agendamento de ${a.service?.name || 'serviço'} no dia ${dateStr} às ${a.time}.`;
    const waUrl = `https://wa.me/${BUSINESS.whatsappE164}?text=${encodeURIComponent(waTxt)}`;

    return `<div class="glass-card p-4 rounded-xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="font-bold text-white">${escapeHtml(a.service?.name || '')}</div>
          <div class="text-xs text-zinc-400">${dateStr} às ${escapeHtml(a.time || '')}</div>
          <div class="text-xs text-amber-500 mt-2 font-bold uppercase">${escapeHtml(a.status || '')}</div>
        </div>
        <a href="${waUrl}" target="_blank" rel="noopener" class="text-xs font-bold px-3 py-2 rounded-lg bg-zinc-900/60 border border-white/10 hover:border-amber-500/60 text-amber-500">
          Cancelar (WhatsApp)
        </a>
      </div>
    </div>`;
  }).join('');
}

// ====== LANDING SERVICES ======
function renderServicesLanding() {
  const g = qs('services-grid');
  const list = SERVICES.filter(s => !servicesSearch || s.name.toLowerCase().includes(servicesSearch.toLowerCase()));
  g.innerHTML = list.map(s => `
    <div class="glass-card p-8 rounded-2xl group cursor-default relative overflow-hidden">
      ${s.popular ? `<span class="absolute top-0 right-0 bg-amber-600 text-white text-[10px] font-black px-3 py-1 uppercase rounded-bl-xl">Popular</span>` : ''}
      <div class="flex justify-between items-start mb-6">
        <div class="p-3 bg-white/5 rounded-xl text-amber-500 border border-white/5"><i data-lucide="scissors"></i></div>
        <span class="text-xl font-bold text-white bg-zinc-900/80 px-4 py-1 rounded-full border border-white/10">R$ ${s.price}</span>
      </div>
      <h3 class="text-xl font-bold text-white mb-2">${escapeHtml(s.name)}</h3>
      <p class="text-zinc-400 mb-6 text-sm min-h-[40px]">${escapeHtml(s.description)}</p>
      <button onclick="selectService(${s.id})" class="text-amber-500 text-sm font-bold flex items-center gap-2">Reservar <i data-lucide="arrow-right" class="w-4 h-4"></i></button>
    </div>`).join('');
  lucide.createIcons();
}

function siteSearchServicesImpl(q) {
  servicesSearch = (q || '').trim();
  renderServicesLanding();
}

// ====== MENU / DROPDOWN ======
function toggleMobileMenuImpl() { qs('mobile-menu')?.classList.toggle('hidden'); }

function closeProfileDropdown() {
  const d = qs('profile-dropdown');
  if (!d) return;
  d.classList.add('opacity-0', 'invisible');
  d.classList.remove('translate-y-0');
}

function toggleProfileDropdownImpl() {
  const d = qs('profile-dropdown');
  if (!d) return;
  const isOpen = !d.classList.contains('invisible');
  if (isOpen) closeProfileDropdown();
  else {
    d.classList.remove('opacity-0', 'invisible');
    d.classList.add('translate-y-0');
  }
}

// close dropdown on outside click
document.addEventListener('click', (e) => {
  const drop = qs('profile-dropdown');
  const trigger = qs('nav-user');
  if (!drop || drop.classList.contains('invisible')) return;
  if (drop.contains(e.target)) return;
  if (trigger && trigger.contains(e.target)) return;
  closeProfileDropdown();
});

// ====== APPOINTMENTS MODAL ======
function openAppointmentsImpl() {
  if (!currentUser) return window.openAuthModal('login');
  qs('appointments-modal').classList.remove('hidden');
  qs('appointments-content').innerHTML = '<div class="flex justify-center p-10"><div class="loader"></div></div>';
  fetchAppointments(currentUser.id);
}
function closeAppointmentsImpl() { qs('appointments-modal').classList.add('hidden'); }

// ====== ROUTER (hash) ======
function showSiteView() {
  document.body.classList.remove('admin-body');
  qs('admin-root').classList.add('hidden');
  qs('site-root').classList.remove('hidden');
  lucide.createIcons();
}
function showAdminView() {
  document.body.classList.add('admin-body');
  qs('site-root').classList.add('hidden');
  qs('admin-root').classList.remove('hidden');
  lucide.createIcons();
  if (!window.__adminInitialized) {
    window.__adminInitialized = true;
    window.adminApp?.init?.();
  } else {
    window.adminApp?.refresh?.();
  }
}
function route() {
  const hash = (window.location.hash || '#home').toLowerCase();
  if (hash.startsWith('#admin')) showAdminView();
  else showSiteView();
}
function goAdmin() { window.location.hash = '#admin'; }
function goSite() { window.location.hash = '#home'; }
window.addEventListener('hashchange', route);

// ====== ADMIN APP (visual demo) ======
// ====== ADMIN APP ======
const adminApp = {
  data: {
    appointments: [],
    services: [],
    clients: []
  },

  init: async () => {
    if (!currentUser) return;
    // Check role (in a real app, use RLS/Metadata. Here we trust the UI for demo but backend enforces RLS)
    // const { data } = await supabaseClient.from('profiles').select('role').eq('id', currentUser.id).single();
    // if (data?.role !== 'admin') { toast("Acesso negado", "error"); return goSite(); }

    await adminApp.fetchData();
    adminApp.renderKPIs();
    adminApp.renderAgenda();
    adminApp.renderClients();

    // Auto refresh every 30s
    setInterval(() => adminApp.fetchData().then(() => {
      adminApp.renderKPIs();
      adminApp.renderAgenda();
    }), 30000);
  },

  refresh: () => {
    adminApp.fetchData().then(() => {
      adminApp.renderKPIs();
      adminApp.renderAgenda();
      adminApp.renderClients();
    });
  },

  fetchData: async () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

    // Fetch all for client stats, but usually you'd paginate. For demo, fetch last 1000.
    const { data: appts, error } = await supabaseClient
      .from('appointments')
      .select('*')
      .order('date_iso', { ascending: true })
      .limit(500);

    if (error) { console.error(error); return; }

    adminApp.data.appointments = appts.map(a => ({
      ...a,
      details: typeof a.details === 'string' ? JSON.parse(a.details) : a.details
    }));
  },

  renderKPIs: () => {
    const today = new Date().toDateString();
    const todaysAppts = adminApp.data.appointments.filter(a => new Date(a.date_iso).toDateString() === today);

    // KPI 1: Cortes Hoje
    qs('admin-kpi-count').textContent = todaysAppts.length;

    // KPI 2: Faturamento Estimado (Status != cancelado)
    const revenue = todaysAppts
      .filter(a => a.status !== 'cancelado')
      .reduce((sum, a) => sum + (a.details?.service?.price || 0), 0);
    qs('admin-kpi-revenue').textContent = `R$ ${revenue}`;

    // KPI 3: Próximo Cliente
    const now = new Date();
    const next = todaysAppts.find(a => new Date(a.date_iso) > now && a.status !== 'cancelado');
    if (next) {
      qs('admin-kpi-next-name').textContent = next.details?.clientName || 'Cliente';
      qs('admin-kpi-next-time').textContent = next.details?.time || '--:--';
    } else {
      qs('admin-kpi-next-name').textContent = 'Sem mais agendamentos';
      qs('admin-kpi-next-time').textContent = '--:--';
    }
  },

  nav: (p) => {
    ['dashboard', 'agenda', 'clients', 'services'].forEach(v => qs(`admin-view-${v}`)?.classList.add('hidden'));
    qs(`admin-view-${p}`)?.classList.remove('hidden');

    const titleMap = { dashboard: 'Visão Geral', agenda: 'Agenda', clients: 'Clientes', services: 'Catálogo' };
    qs('admin-page-title').textContent = titleMap[p] || 'Painel';

    // Update active nav state
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    // Simple way to highlight, typically you'd query by ID or data attribute
  },

  // --- AGENDA ---
  renderAgenda: (filter = 'all') => {
    const tbody = qs('admin-agenda-table-body');
    if (!tbody) return;

    tbody.innerHTML = adminApp.data.appointments.map(a => {
      const statusColors = {
        'confirmado': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        'pendente': 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        'concluido': 'bg-green-500/10 text-green-500 border-green-500/20',
        'cancelado': 'bg-red-500/10 text-red-500 border-red-500/20'
      };

      const dateObj = new Date(a.date_iso);
      const dateStr = dateObj.toLocaleDateString('pt-BR');

      return `
        <tr class="hover:bg-white/5 transition-colors group">
          <td class="p-5">
            <div class="font-bold text-white">${escapeHtml(a.details?.clientName || 'Cliente')}</div>
            <div class="text-xs text-zinc-500">${escapeHtml(a.details?.clientPhone || '')}</div>
          </td>
          <td class="p-5 text-zinc-300">${escapeHtml(a.details?.service?.name || '-')}</td>
          <td class="p-5 text-zinc-400 text-sm">${dateStr}</td>
          <td class="p-5 text-white font-bold">${escapeHtml(a.details?.time || '--:--')}</td>
          <td class="p-5">
            <span class="px-3 py-1 rounded-full text-xs font-bold border ${statusColors[a.status] || 'bg-zinc-800 text-zinc-400 border-white/10'} uppercase tracking-wider">
              ${a.status}
            </span>
          </td>
          <td class="p-5 text-right">
             <div class="flex gap-2 justify-end opacity-50 group-hover:opacity-100 transition-opacity">
               ${a.status !== 'concluido' ? `
               <button onclick="adminApp.updateStatus(${a.id}, 'concluido')" class="p-2 hover:bg-green-500/20 text-green-500 rounded-lg transition-colors" title="Concluir">
                 <i data-lucide="check" class="w-4 h-4"></i>
               </button>` : ''}
               ${a.status !== 'cancelado' ? `
               <button onclick="adminApp.updateStatus(${a.id}, 'cancelado')" class="p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors" title="Cancelar">
                 <i data-lucide="x" class="w-4 h-4"></i>
               </button>` : ''}
             </div>
          </td>
        </tr>
      `;
    }).join('');
    lucide.createIcons();
  },

  updateStatus: async (id, status) => {
    const { error } = await supabaseClient
      .from('appointments')
      .update({ status })
      .eq('id', id);

    if (error) return toast("Erro ao atualizar", "error");
    toast(`Agendamento ${status}!`);
    adminApp.refresh();
  },

  // --- CLIENTS ---
  renderClients: () => {
    // Unique clients by phone
    const clientsMap = {};
    adminApp.data.appointments.forEach(a => {
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

    const clients = Object.values(clientsMap).sort((a, b) => b.totalSpent - a.totalSpent);

    const tbody = qs('admin-clients-table-body');
    if (!tbody) return;
    tbody.innerHTML = clients.map(c => `
      <tr class="hover:bg-white/5 transition-colors">
        <td class="p-5 text-white font-bold">${escapeHtml(c.name)}</td>
        <td class="p-5 text-zinc-400 text-sm">${escapeHtml(c.phone)}</td>
        <td class="p-5 text-zinc-300">${c.visits}</td>
        <td class="p-5 text-emerald-500 font-bold">R$ ${c.totalSpent}</td>
        <td class="p-5 text-zinc-500 text-sm">${new Date(c.lastVisit).toLocaleDateString('pt-BR')}</td>
      </tr>
    `).join('');
  },

  // --- SERVICES (CRUD) ---
  renderServices: () => {
    const grid = qs('admin-services-grid');
    if (!grid) return;

    // Add "New Service" card
    let html = `
      <div onclick="adminApp.openServiceModal()" class="admin-glass-panel p-6 rounded-2xl flex flex-col items-center justify-center gap-4 border-2 border-dashed border-white/10 hover:border-amber-500/50 cursor-pointer group transition-all min-h-[200px]">
        <div class="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-amber-500 transition-colors">
          <i data-lucide="plus" class="w-8 h-8 text-zinc-500 group-hover:text-white"></i>
        </div>
        <p class="font-bold text-zinc-400 group-hover:text-amber-500">Novo Serviço</p>
      </div>
    `;

    html += SERVICES.map(s => `
      <div class="admin-glass-panel p-6 rounded-2xl relative group">
        <div class="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
           <button onclick="adminApp.openServiceModal(${s.id})" class="p-2 bg-zinc-800 hover:bg-amber-600 rounded-lg text-white"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
           <button onclick="adminApp.deleteService(${s.id})" class="p-2 bg-zinc-800 hover:bg-red-600 rounded-lg text-white"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
        <div class="flex items-center justify-between mb-4">
           <div class="p-3 bg-white/5 rounded-xl text-amber-500"><i data-lucide="scissors"></i></div>
           <span class="font-bold text-white bg-white/5 px-3 py-1 rounded-lg">R$ ${s.price}</span>
        </div>
        <h3 class="font-bold text-white text-lg mb-1">${escapeHtml(s.name)}</h3>
        <p class="text-xs text-zinc-500 mb-4 h-10 overflow-hidden text-ellipsis">${escapeHtml(s.description)}</p>
        <div class="flex gap-2 text-xs font-bold uppercase tracking-wider text-zinc-600">
           <span>${s.durationMin} min</span>
           ${s.popular ? '<span class="text-amber-500">• Popular</span>' : ''}
        </div>
      </div>
    `).join('');

    grid.innerHTML = html;
    lucide.createIcons();
  },

  openServiceModal: (id = null) => {
    const s = id ? SERVICES.find(x => x.id === id) : { name: '', price: '', duration_min: 30, description: '', popular: false };
    if (!s) return;

    qs('service-modal-title').textContent = id ? 'Editar Serviço' : 'Novo Serviço';
    qs('svc-id').value = id || '';
    qs('svc-name').value = s.name;
    qs('svc-price').value = s.price;
    qs('svc-duration').value = s.durationMin || s.duration_min; // DB uses snake_case usually, but let's handle mismatch
    qs('svc-desc').value = s.description || '';
    qs('svc-popular').checked = s.popular;

    qs('service-modal').classList.remove('hidden');
  },

  saveService: async (e) => {
    e.preventDefault();
    const id = qs('svc-id').value;
    const data = {
      name: qs('svc-name').value,
      price: Number(qs('svc-price').value),
      duration_min: Number(qs('svc-duration').value),
      description: qs('svc-desc').value,
      popular: qs('svc-popular').checked
    };

    if (!data.name || !data.price) return toast("Nome e Preço obrigatórios", "error");

    let error;
    if (id) {
      ({ error } = await supabaseClient.from('services').update(data).eq('id', id));
    } else {
      ({ error } = await supabaseClient.from('services').insert(data));
    }

    if (error) return toast("Erro ao salvar serviço", "error");

    toast("Serviço salvo!");
    qs('service-modal').classList.add('hidden');
    await loadServices(); // Refresh local list
    adminApp.renderServices();
    renderServicesLanding(); // Update Landing Page
  },

  deleteService: async (id) => {
    if (!confirm("Tem certeza?")) return;
    const { error } = await supabaseClient.from('services').delete().eq('id', id);
    if (error) return toast("Erro ao deletar", "error");

    toast("Serviço removido.");
    await loadServices();
    adminApp.renderServices();
    renderServicesLanding();
  },
  login: (e) => {
    e.preventDefault();
    const email = qs('admin-email').value;
    // Simple "fake" auth for demo if Supabase fails or for quick access
    // In production, use Supabase Login
    if (email) {
      document.body.classList.add('admin-body'); // Force style
      qs('admin-login-screen').classList.add('hidden');
      qs('admin-app-layout').classList.remove('hidden');
      adminApp.init(); // Try real init
    }
  }
};
window.adminApp = adminApp;

// ====== EXPORT GLOBALS (para onclick do HTML) ======
window.openAuthModal = function (tab) {
  qs('auth-modal').classList.remove('hidden');
  switchAuthTabImpl(tab);
  lucide.createIcons();
};
window.closeAuthModal = closeAuthModalImpl;
window.switchAuthTab = switchAuthTabImpl;
window.openResetPassword = openResetPasswordImpl;
window.backToLogin = backToLoginImpl;
window.handleLogin = handleLoginImpl;
window.handleRegister = handleRegisterImpl;
window.handleGoogleLogin = handleGoogleLoginImpl;
window.handleResetPassword = handleResetPasswordImpl;
window.logout = logoutImpl;

window.startBooking = startBookingImpl;
window.closeBooking = closeBookingImpl;
window.nextStep = nextStepImpl;
window.prevStep = prevStepImpl;
window.selectService = selectServiceImpl;
window.selectBarber = selectBarberImpl;
window.selectDate = selectDateImpl;
window.selectTime = selectTimeImpl;
window.updateClientData = updateClientDataImpl;

window.openAppointments = openAppointmentsImpl;
window.closeAppointments = closeAppointmentsImpl;

window.toggleMobileMenu = toggleMobileMenuImpl;
window.toggleProfileDropdown = toggleProfileDropdownImpl;
window.siteSearchServices = siteSearchServicesImpl;

window.route = route;
window.goAdmin = goAdmin;
window.goSite = goSite;

// ====== INIT ======
function ensureSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === "COLE_SUA_ANON_KEY_AQUI") {
    toast("Configure SUPABASE_URL e SUPABASE_ANON_KEY em assets/config.js", "error");
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}

// ====== ANIMATIONS ======
function initScrollObserver() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-fade-in-up');
        entry.target.classList.remove('opacity-0', 'translate-y-10');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  // Select elements to animate
  const targets = document.querySelectorAll('.glass-card, .glass-panel, h2, h3, #home p, #home button');
  targets.forEach(el => {
    if (!el.classList.contains('animate-fade-in-up')) {
      el.classList.add('opacity-0', 'transition-opacity', 'duration-500');
      observer.observe(el);
    }
  });
}

(function init() {
  loadServices().then(renderServicesLanding);
  supabaseClient = ensureSupabase();
  if (supabaseClient) {
    supabaseClient.auth.getSession().then(({ data }) => handleSession(data.session));
    supabaseClient.auth.onAuthStateChange((_event, session) => handleSession(session));
  } else {
    updateUIForGuest();
  }


  // icons + route first load
  lucide.createIcons();
  route();

  // Start animations
  setTimeout(initScrollObserver, 100);
})();
