import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CFG = window.APP_CONFIG || {};
const BUSINESS = CFG.BUSINESS || {};
const SUPABASE_URL = CFG.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = CFG.SUPABASE_ANON_KEY || "";

// ====== TOAST ======
function toast(msg, type="success") {
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

// ====== DATA (pode puxar do banco depois) ======
const SERVICES = [
  { id: 1, category: 'cabelo', name: "Corte Clássico", price: 50, durationMin: 45, description: "Corte tradicional e finalização.", popular: true },
  { id: 2, category: 'barba', name: "Barba Terapia", price: 40, durationMin: 30, description: "Modelagem + hidratação.", popular: false },
  { id: 3, category: 'combo', name: "Cabelo & Barba", price: 80, durationMin: 75, description: "Combo completo.", popular: true },
  { id: 4, category: 'cabelo', name: "Acabamento", price: 20, durationMin: 15, description: "Apenas contorno e finalização.", popular: false },
  { id: 5, category: 'cabelo', name: "Corte Infantil", price: 45, durationMin: 40, description: "Corte para crianças.", popular: false },
  { id: 6, category: 'cabelo', name: "Selagem", price: 120, durationMin: 90, description: "Redução de volume e tratamento.", popular: false }
];

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
let bookingData = { service:null, barber:null, date:null, time:null, clientName:"", clientPhone:"", paymentMethod:"local", notes:"", rescheduleFromId:null };
let appointments = [];
let unavailableSlots = [];
let servicesSearch = "";

// ====== Helpers ======
function qs(id){ return document.getElementById(id); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }

function setBodyLock(locked) {
  document.documentElement.style.overflow = locked ? 'hidden' : '';
  document.body.style.overflow = locked ? 'hidden' : '';
}

// ====== UI helpers ======
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

  const fullName = (user?.name || user?.email || "Usuário").trim();
  qs("user-name-display").textContent = fullName;
  qs("mobile-user-name").textContent = fullName;

  const initial = (fullName || "U").charAt(0).toUpperCase();
  qs("user-initial").textContent = initial;
  qs("mobile-user-initial").textContent = initial;
}

// ====== AUTH ======
function closeAuthModalImpl() {
  qs('auth-modal').classList.add('hidden');
  pendingBooking = false;
  qs('form-reset').classList.add('hidden');
  setBodyLock(false);
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
  setTimeout(() => qs('login-email')?.focus(), 60);
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

  if (pendingBooking) {
    pendingBooking = false;
    openBookingImpl();
  }
}

// ====== BOOKING ======
function startBookingImpl() {
  const savedName = localStorage.getItem('client_name') || (currentUser?.name || '');
  const savedPhone = localStorage.getItem('client_phone') || '';
  bookingData = { service:null, barber:null, date:null, time:null, clientName:savedName, clientPhone:savedPhone, paymentMethod:'local', notes:'', rescheduleFromId:null };
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
  setBodyLock(true);
  updateSummary();
  renderStep();
  lucide.createIcons();
}

function closeBookingImpl() {
  qs('booking-modal').classList.add('hidden');
  setBodyLock(false);
}

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
  updateSummary();
  currentStep = 2;
  renderStep();
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
  bookingData.date = new Date(y, m-1, d);
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

  const prevBtn = currentStep > 1 ? `<button onclick="prevStep()" class="tap-target w-full border border-white/10 text-zinc-300 py-3 rounded-xl mb-2">Voltar</button>` : '';
  const nextLbl = currentStep === 4 ? 'Confirmar' : 'Continuar';
  const nextCls = currentStep === 4 ? 'bg-amber-600 text-white' : 'bg-white text-black';

  const actions = `${prevBtn}<button onclick="nextStep()" class="tap-target w-full ${nextCls} font-bold py-3 rounded-xl">${nextLbl}</button>`;
  if (desktop) desktop.innerHTML = actions;
  if (mobile) mobile.innerHTML = `<button onclick="nextStep()" class="tap-target ${nextCls} font-bold py-3 px-5 rounded-xl">${nextLbl}</button>`;
}

function renderStep() {
  const content = qs('booking-content');
  const hint = qs('step-hint');

  for (let i=1; i<=4; i++) {
    const dot = qs(`dot-${i}`);
    const line = qs(`line-${i}`);
    if (dot) {
      dot.classList.toggle('active', i <= currentStep);
      dot.classList.toggle('completed', i < currentStep);
    }
    if (line) line.classList.toggle('completed', i < currentStep);
  }

  let html = '<div class="animate-fade-in-up pb-20 md:pb-0">';

  if (currentStep === 1) {
    hint.textContent = "Escolha o serviço desejado.";
    html += `<h4 class="text-2xl font-bold text-white mb-4">Escolha o Serviço</h4><div class="grid grid-cols-1 gap-3">${SERVICES.map(s => `
      <div onclick="selectService(${s.id})" class="glass-card p-4 rounded-xl border border-white/5 cursor-pointer flex justify-between items-center ${bookingData.service?.id === s.id ? 'selected' : ''}">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-lg bg-zinc-900 flex items-center justify-center text-amber-500"><i data-lucide="scissors"></i></div>
          <div><h4 class="font-bold text-white">${escapeHtml(s.name)}</h4><p class="text-zinc-400 text-xs">${s.durationMin} min</p></div>
        </div>
        <span class="block text-xl font-bold text-white">R$ ${s.price}</span>
      </div>`).join('')}</div>`;
  }

  if (currentStep === 2) {
    hint.textContent = "Selecione o profissional.";
    html += `<h4 class="text-2xl font-bold text-white mb-4">Profissional</h4><div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${BARBERS.map(b => `
      <div onclick="selectBarber(${b.id})" class="glass-card p-4 rounded-xl border border-white/5 cursor-pointer flex items-center gap-4 ${bookingData.barber?.id === b.id ? 'selected' : ''}">
        <div class="w-14 h-14 rounded-full bg-zinc-800 overflow-hidden border-2 border-zinc-700">${b.image ? `<img src="${b.image}" class="w-full h-full object-cover" alt="${escapeHtml(b.name)}">` : `<div class="w-full h-full flex items-center justify-center"><i data-lucide="user"></i></div>`}</div>
        <div><h4 class="font-bold text-white">${escapeHtml(b.name)}</h4><p class="text-xs text-amber-500 font-bold uppercase">${escapeHtml(b.role)}</p></div>
      </div>`).join('')}</div>`;
  }

  if (currentStep === 3) {
    hint.textContent = "Data e Hora";
    const todayStr = getLocalYMD(new Date());
    const selectedDateStr = bookingData.date ? getLocalYMD(bookingData.date) : todayStr;

    html += `<h4 class="text-2xl font-bold text-white mb-4">Data e Hora</h4>
      <input type="date" id="date-input-picker" value="${selectedDateStr}" onchange="selectDate(this.value)" class="w-full bg-zinc-900 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-amber-500 mb-6">
      ${bookingData.date ? `<div id="slots-container" class="grid grid-cols-3 sm:grid-cols-4 gap-3"></div>` : `<div class="text-center py-10 text-zinc-500 bg-white/5 rounded-xl border border-white/5">Selecione um dia</div>`}`;

    if (!bookingData.date) setTimeout(() => selectDateImpl(todayStr), 0);
  }

  if (currentStep === 4) {
    hint.textContent = "Confirme seus dados.";
    html += `<h4 class="text-2xl font-bold text-white mb-4">Confirmação</h4>
      <div class="space-y-6 max-w-lg">
        <div class="space-y-2">
          <label class="text-xs font-bold text-zinc-400">Nome</label>
          <input type="text" oninput="updateClientData('clientName', this.value)" value="${escapeHtml(bookingData.clientName||'')}" class="w-full glass-input rounded-xl py-3 px-4">
        </div>
        <div class="space-y-2">
          <label class="text-xs font-bold text-zinc-400">WhatsApp</label>
          <input type="tel" inputmode="tel" oninput="updateClientData('clientPhone', this.value)" value="${escapeHtml(bookingData.clientPhone||'')}" class="w-full glass-input rounded-xl py-3 px-4">
        </div>
        <div class="bg-zinc-900/50 p-4 rounded-xl border border-white/5">
          <i data-lucide="store" class="text-amber-500 inline mr-2"></i> Pagamento no local
        </div>
      </div>`;
  }

  if (currentStep === 5) {
    html += `<div class="text-center py-10">
      <div class="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6 mx-auto"><i data-lucide="check" class="w-10 h-10 text-green-500"></i></div>
      <h3 class="text-3xl font-bold text-white">Confirmado!</h3>
      <p class="text-zinc-500 mt-2 mb-8">Seu horário foi reservado com sucesso.</p>
      <div class="flex flex-col gap-3 justify-center items-center">
        <button onclick="closeBooking(); openAppointments();" class="tap-target px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-all border border-white/5 w-full max-w-xs">Ir para Meus Agendamentos</button>
        <button onclick="closeBooking()" class="tap-target text-zinc-500 hover:text-white transition-colors text-sm">Fechar</button>
      </div>
    </div>`;
  }

  content.innerHTML = html + '</div>';
  lucide.createIcons();
  updateSummary();
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
      return `<button disabled class="slot-btn py-3 rounded-lg border border-white/5 text-zinc-600 bg-zinc-900/30 text-xs font-bold relative opacity-50 cursor-not-allowed"><span class="line-through decoration-white/20">${slot.time}</span></button>`;
    }
    return `<button onclick="selectTime('${slot.time}')" class="slot-btn py-3 rounded-lg border bg-zinc-800/50 border-white/5 text-zinc-200 font-bold hover:border-amber-500 transition-all ${bookingData.time === slot.time ? 'selected' : ''}">${slot.time}</button>`;
  }).join('');
}

// ====== SLOT HELPERS ======
function timeToMinutes(t){const [h,m]=t.split(':').map(Number);return h*60+m;}
function minutesToTime(min){return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;}
function getOpenRangeForDate(d){
  const k=d.getDay();
  const o=BUSINESS.openingHours?.[k];
  return o ? { startMin: timeToMinutes(o.start), endMin: timeToMinutes(o.end), dayKey: k } : null;
}
function isInBreak(k,t){
  const b = BUSINESS.breaks?.[k] || [];
  const m = timeToMinutes(t);
  return b.some(x => m >= timeToMinutes(x.start) && m < timeToMinutes(x.end));
}
function isPast(dateObj,t){
  const now=new Date();
  const checkDate=new Date(dateObj.getFullYear(),dateObj.getMonth(),dateObj.getDate());
  const [h,m]=t.split(':').map(Number);
  checkDate.setHours(h,m,0,0);
  return checkDate < now;
}
function buildSlots(d){
  const r=getOpenRangeForDate(d);
  if(!r) return [];
  const dur=bookingData.service?.durationMin||30;
  const s=[];
  for(let m=r.startMin; m+dur<=r.endMin; m+= (BUSINESS.slotMinutes || 30)){
    const t=minutesToTime(m);
    let status='available';
    if(unavailableSlots.includes(t)) status='busy';
    else if(isInBreak(r.dayKey,t)) status='busy';
    else if(isPast(d,t)) status='busy';
    s.push({time:t,status});
  }
  return s;
}

// ====== DB ======
async function fetchUnavailableSlots(dateStr, barberId) {
  if (!dateStr) return [];
  const { data, error } = await supabaseClient
    .from('appointments')
    .select('details,date_iso')
    .gte('date_iso', `${dateStr}T00:00:00`)
    .lt('date_iso', `${dateStr}T23:59:59`);

  if (error) {
    console.warn("fetchUnavailableSlots error", error);
    return [];
  }

  return (data||[])
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

  const y=bookingData.date.getFullYear();
  const m=String(bookingData.date.getMonth()+1).padStart(2,'0');
  const d=String(bookingData.date.getDate()).padStart(2,'0');
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

  appointments = (data||[]).map(i => ({
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
        <a href="${waUrl}" target="_blank" rel="noopener" class="tap-target text-xs font-bold px-3 py-2 rounded-lg bg-zinc-900/60 border border-white/10 hover:border-amber-500/60 text-amber-500">
          Cancelar (WhatsApp)
        </a>
      </div>
    </div>`;
  }).join('');
}

// ====== SERVICES (Landing) ======
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
      <button onclick="selectService(${s.id})" class="tap-target text-amber-500 text-sm font-bold flex items-center gap-2">Reservar <i data-lucide="arrow-right" class="w-4 h-4"></i></button>
    </div>`).join('');
  lucide.createIcons();
}

function siteSearchServicesImpl(q) {
  servicesSearch = (q || '').trim();
  renderServicesLanding();
}

// ====== MENU / DROPDOWN ======
function toggleMobileMenuImpl() {
  const menu = qs('mobile-menu');
  if (!menu) return;
  const willOpen = menu.classList.contains('hidden');
  menu.classList.toggle('hidden');
  setBodyLock(willOpen);
}

function closeMobileMenu() {
  const menu = qs('mobile-menu');
  if (!menu) return;
  if (!menu.classList.contains('hidden')) menu.classList.add('hidden');
  setBodyLock(false);
}

function closeProfileDropdown() {
  const d = qs('profile-dropdown');
  if (!d) return;
  d.classList.add('opacity-0','invisible');
  d.classList.remove('translate-y-0');
}

function toggleProfileDropdownImpl() {
  const d = qs('profile-dropdown');
  if (!d) return;
  const isOpen = !d.classList.contains('invisible');
  if (isOpen) closeProfileDropdown();
  else {
    d.classList.remove('opacity-0','invisible');
    d.classList.add('translate-y-0');
  }
}

// close dropdown + close mobile menu on outside click
document.addEventListener('click', (e) => {
  const drop = qs('profile-dropdown');
  const trigger = qs('nav-user');
  if (drop && !drop.classList.contains('invisible')) {
    if (!drop.contains(e.target) && !(trigger && trigger.contains(e.target))) {
      closeProfileDropdown();
    }
  }

  const mobileMenu = qs('mobile-menu');
  const nav = qs('main-nav');
  if (mobileMenu && nav && !nav.contains(e.target)) {
    closeMobileMenu();
  }
});

// Close mobile on resize
window.addEventListener('resize', () => {
  if (window.innerWidth >= 768) closeMobileMenu();
});

// ====== APPOINTMENTS MODAL ======
function openAppointmentsImpl() {
  if (!currentUser) return window.openAuthModal('login');
  qs('appointments-modal').classList.remove('hidden');
  setBodyLock(true);
  qs('appointments-content').innerHTML = '<div class="flex justify-center p-10"><div class="loader"></div></div>';
  fetchAppointments(currentUser.id);
}
function closeAppointmentsImpl() {
  qs('appointments-modal').classList.add('hidden');
  setBodyLock(false);
}

// ====== ROUTER ======
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
const adminApp = {
  init: async()=>{},
  login: (e)=>{
    e.preventDefault();
    const email = qs('admin-email')?.value;
    const pass = qs('admin-password')?.value;
    if (!email || !pass) return toast("Informe e-mail e senha.", "error");
    qs('admin-login-screen').classList.add('hidden');
    qs('admin-app-layout').classList.remove('hidden');
    adminApp.renderKPIs();
  },
  logout: ()=>{ window.location.hash = '#home'; location.reload(); },
  renderKPIs: ()=>{ qs('admin-kpi-count').textContent = '0'; qs('admin-kpi-revenue').textContent = 'R$ 0'; },
  nav: (p)=>{ ['dashboard','agenda','clients','services'].forEach(v=>qs(`admin-view-${v}`)?.classList.add('hidden')); qs(`admin-view-${p}`)?.classList.remove('hidden'); }
};
window.adminApp = adminApp;

// ====== EXPORT GLOBALS (onclick HTML) ======
window.openAuthModal = function(tab){
  qs('auth-modal').classList.remove('hidden');
  setBodyLock(true);
  switchAuthTabImpl(tab);
  lucide.createIcons();
  setTimeout(() => qs('login-email')?.focus(), 80);
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

// ESC closes modals
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  const bookingOpen = qs('booking-modal') && !qs('booking-modal').classList.contains('hidden');
  const authOpen = qs('auth-modal') && !qs('auth-modal').classList.contains('hidden');
  const apptOpen = qs('appointments-modal') && !qs('appointments-modal').classList.contains('hidden');

  if (bookingOpen) window.closeBooking();
  if (authOpen) window.closeAuthModal();
  if (apptOpen) window.closeAppointments();
  closeMobileMenu();
  closeProfileDropdown();
});

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

function initNavbarPolish() {
  const nav = qs('main-nav');
  const wa = qs('wa-float');
  const navInner = qs('nav-inner');

  window.addEventListener('scroll', () => {
    const y = window.scrollY || 0;
    nav?.classList.toggle('nav-shadow', y > 10);

    if (navInner) {
      if (y > 30) navInner.classList.add('py-2');
      else navInner.classList.remove('py-2');
    }

    if (wa) {
      if (y > 500) wa.classList.remove('hidden');
      else wa.classList.add('hidden');
    }
  });
}

function initHeroMotion() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const v = qs('hero-video');
  if (prefersReducedMotion && v) {
    try {
      v.pause();
      v.removeAttribute('autoplay');
    } catch {}
  }
}

(function init(){
  renderServicesLanding();

  supabaseClient = ensureSupabase();
  if (!supabaseClient) {
    updateUIForGuest();
    lucide.createIcons();
    route();
    return;
  }

  supabaseClient.auth.getSession().then(({ data }) => handleSession(data.session));
  supabaseClient.auth.onAuthStateChange((_event, session) => handleSession(session));

  initNavbarPolish();
  initHeroMotion();

  lucide.createIcons();
  route();
})();
