// Calendário inteligente dos refrigerantes (localStorage)
(() => {
  const STORAGE_KEY = 'refri_calendar_v1';
  const TIMEZONE = 'America/Sao_Paulo';

  const DEFAULT_PEOPLE = [
    'Davi',
    'Dalvi Ramalho',
    'Amilton',
    'César',
    'Cleilton',
    'José',
    'Pakuara',
    'Pedro',
    'Welton',
    'Wesley',
    'Denilson',
    'Diomede',
    'Edmilson',
    'Leonardo',
    'Marcelo Jardeson',
    'Marcelo Mendonça'
  ];

  const TYPES = {
    coca: { label: 'Coca-Cola 2L', typeKey: 'coca' },
    geraldo: { label: 'São Geraldo 2L', typeKey: 'geraldo' }
  };

  // ---------- Util ----------
  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function fmtDatePtBR(date) {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: TIMEZONE,
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
  }

  function toTimeZoneDateParts(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
  }

  function nextSaturdayDates(count, fromDate) {
    // Trabalha com partes de data na timezone
    const startParts = toTimeZoneDateParts(fromDate);
    let cursor = new Date(startParts.y, startParts.m - 1, startParts.d);
    const res = [];
    while (res.length < count) {
      const jsDay = cursor.getDay(); // 0..6 (Sat=6)
      if (jsDay === 6) res.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
      cursor.setDate(cursor.getDate() + 1);
    }
    return res;
  }

  function getAllSaturdaysInMonth(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    const first = new Date(y, m - 1, 1);

    let cursor = new Date(first.getFullYear(), first.getMonth(), first.getDate());
    while (cursor.getDay() !== 6) cursor.setDate(cursor.getDate() + 1);

    const res = [];
    while (cursor.getMonth() === m - 1) {
      res.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
      cursor.setDate(cursor.getDate() + 7);
    }
    return res;
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededShuffle(arr, seed) {
    const a = arr.slice();
    let s = seed >>> 0;
    function rand() {
      // xorshift32
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    }
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function monthCapacity(peopleCount) {
    // cada sábado usa 3 pessoas distintas => quantidade máxima de sábados no mês
    return Math.floor(peopleCount / 3);
  }

  function buildAssignmentsForMonth(monthKey, people) {
    const saturdays = getAllSaturdaysInMonth(monthKey);
    const needed = saturdays.length * 3;
    const seed = hashString('refri|' + monthKey);
    const shuffled = seededShuffle(people, seed);

    if (people.length < needed) {
      console.warn(`Mês ${monthKey} precisa de ${needed} nomes. Há apenas ${people.length}.`);
    }

    const selected = shuffled.slice(0, needed);
    const assignments = [];

    for (let i = 0; i < saturdays.length; i++) {
      const sat = saturdays[i];
      const p1 = selected[i * 3] || '—';
      const p2 = selected[i * 3 + 1] || '—';
      const p3 = selected[i * 3 + 2] || '—';

      assignments.push({
        dateYMD: ymd(sat),
        coca: [p1, p2],
        geraldo: p3
      });
    }

    return assignments;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '<',
      '>': '>',
      '"': '"',
      "'": '&#39;'
    }[c]));
  }

  // ---------- Estado ----------
  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        people: DEFAULT_PEOPLE.slice(),
        assignmentsByDate: {},
        imagesByTypeAndDate: {},
        updatedAt: null,
        lastMondayRefresh: null
      };
    }

    try {
      return JSON.parse(raw);
    } catch {
      return {
        people: DEFAULT_PEOPLE.slice(),
        assignmentsByDate: {},
        imagesByTypeAndDate: {},
        updatedAt: null,
        lastMondayRefresh: null
      };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function normalizeState(raw) {
    return {
      people: Array.isArray(raw.people) ? raw.people : DEFAULT_PEOPLE.slice(),
      assignmentsByDate: raw.assignmentsByDate && typeof raw.assignmentsByDate === 'object' ? raw.assignmentsByDate : {},
      imagesByTypeAndDate: raw.imagesByTypeAndDate && typeof raw.imagesByTypeAndDate === 'object' ? raw.imagesByTypeAndDate : {},
      updatedAt: raw.updatedAt || null,
      lastMondayRefresh: raw.lastMondayRefresh || null
    };
  }

  let state = normalizeState(loadState());

  function computeCurrentMonthKey() {
    const p = toTimeZoneDateParts(new Date());
    return `${p.y}-${String(p.m).padStart(2, '0')}`;
  }

  function computeMonthKeyFromDate(date) {
    const parts = toTimeZoneDateParts(date);
    return `${parts.y}-${String(parts.m).padStart(2, '0')}`;
  }

  function getWeekMonday(date) {
    const parts = toTimeZoneDateParts(date);
    const d = new Date(parts.y, parts.m - 1, parts.d);
    const offset = (d.getDay() + 6) % 7; // shift Sunday=0 to 6, Monday=1 to 0
    d.setDate(d.getDate() - offset);
    return d;
  }

  function ensureMonthlyAssignmentsUpTo(date) {
    const upcomingSaturdays = nextSaturdayDates(8, date);
    const requiredMonthKeys = new Set();

    for (const sat of upcomingSaturdays) {
      const monthKey = `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}`;
      requiredMonthKeys.add(monthKey);
    }

    const builtMonthKeys = Array.from(requiredMonthKeys).sort();
    let changed = false;
    for (const mk of builtMonthKeys) {
      const built = buildAssignmentsForMonth(mk, state.people);
      for (const a of built) {
        if (!state.assignmentsByDate[a.dateYMD]) {
          changed = true;
        }
        state.assignmentsByDate[a.dateYMD] = a;
      }
    }

    if (changed) {
      state.updatedAt = new Date().toISOString();
      saveState();
    }
  }

  function maybeUpdateOnMonday() {
    const now = new Date();
    const monday = getWeekMonday(now);
    const mondayKey = ymd(monday);
    if (state.lastMondayRefresh === mondayKey) return;

    ensureMonthlyAssignmentsUpTo(now);
    state.lastMondayRefresh = mondayKey;
    state.updatedAt = new Date().toISOString();
    saveState();
  }

  // ---------- Render ----------
  function getAssignmentsForDate(date) {
    const key = ymd(date);
    return state.assignmentsByDate[key] || null;
  }

  function showToast(title, msg) {

    const toast = document.getElementById('toast');
    const toastTitle = document.getElementById('toastTitle');
    const toastMsg = document.getElementById('toastMsg');

    toastTitle.textContent = title;
    toastMsg.textContent = msg;
    toast.classList.add('show');

    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function renderStatusText() {
    const statusText = document.getElementById('statusText');
    const now = new Date();
    const dayName = new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, weekday: 'long' }).format(now);
    const updatedLabel = state.updatedAt
      ? `Última atualização: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: TIMEZONE }).format(new Date(state.updatedAt))}`
      : 'Sem atualização ainda';
    statusText.textContent = `Hoje: ${dayName} • ${updatedLabel}`;
  }

  function renderPeople() {
    const wrap = document.getElementById('peopleList');
    wrap.innerHTML = '';

    state.people.forEach((name, i) => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.innerHTML = `
        <div>
          <div class="name">${escapeHtml(name)}</div>
          <div class="meta" style="font-size:12.5px;color:var(--muted);font-weight:800;">Pessoa ${i + 1}</div>
        </div>
        <button aria-label="Remover ${escapeHtml(name)}" data-idx="${i}">×</button>
      `;

      chip.querySelector('button').addEventListener('click', () => {
        state.people.splice(i, 1);
        saveState();
        renderPeople();
        renderCalendar();
        renderHistory();
        showToast('Atualizado', 'Pessoa removida. O histórico já atribuído permanece.');
      });

      wrap.appendChild(chip);
    });
  }

  function renderCalendar() {
    const cont = document.getElementById('upcoming');
    cont.innerHTML = '';

    const sats = nextSaturdayDates(8, new Date());

    for (const sat of sats) {
      const a = getAssignmentsForDate(sat);
      const assigned = !!a;
      const cocaPeople = assigned && Array.isArray(a.coca) ? a.coca : (assigned && a.coca ? [a.coca] : []);
      const geraldoPerson = assigned && typeof a.geraldo === 'string' ? a.geraldo : assigned && a.geraldo ? String(a.geraldo) : null;

      const el = document.createElement('div');
      el.className = 'sat';
      el.innerHTML = `
        <div class="date">
          <div class="dow">Sábado</div>
          <div class="dt">${escapeHtml(fmtDatePtBR(sat))}</div>
          <div class="lit">Total: <b>6L</b> • 2x Coca-Cola 2L + 1x São Geraldo 2L</div>
        </div>

        <div class="responsibles">
          <div class="bucket">
            <div class="bucket-head">
              <div class="tag"><span class="swatch"></span> Coca-Cola 2L (2 pessoas)</div>
              <div class="hint">${assigned ? 'Selecionadas' : 'Atribuindo...'}</div>
            </div>
            <div class="people">
              ${assigned && cocaPeople.length > 0 ? cocaPeople.map(p => `<span class="person">${escapeHtml(p)}</span>`).join('') : '<span class="person">—</span>'}
            </div>
          </div>

          <div class="bucket">
            <div class="bucket-head">
              <div class="tag"><span class="swatch alt"></span> São Geraldo 2L (1 pessoa)</div>
              <div class="hint">${assigned ? 'Selecionada' : 'Atribuindo...'}</div>
            </div>

            <div class="people">
              ${assigned && geraldoPerson ? `<span class="person">${escapeHtml(geraldoPerson)}</span>` : '<span class="person">—</span>'}
            </div>



          </div>
        </div>
      `;



      cont.appendChild(el);
    }
  }

  function renderHistory() {
    const cont = document.getElementById('historyList');
    cont.innerHTML = '';

    const todayParts = toTimeZoneDateParts(new Date());
    const todayKey = `${todayParts.y}-${String(todayParts.m).padStart(2, '0')}-${String(todayParts.d).padStart(2, '0')}`;

    const keys = Object.keys(state.assignmentsByDate)
      .filter((key) => key <= todayKey)
      .sort((a, b) => (a < b ? 1 : -1)); // desc

    const latest = keys.slice(0, 6);

    if (latest.length === 0) {
      cont.innerHTML = `
        <div class="log-item">
          <div class="left">
            <div class="t" style="font-weight:1000;">Sem histórico ainda</div>
            <div class="b">Abra o site para gerar os próximos sábados.</div>
          </div>
          <div class="hint" style="font-weight:1000;">—</div>
        </div>
      `;
      return;
    }

    for (const key of latest) {
      const a = state.assignmentsByDate[key];
      const date = new Date(key + 'T00:00:00');
      const dtText = fmtDatePtBR(date);

      const item = document.createElement('div');
      item.className = 'log-item';
      item.innerHTML = `
        <div class="left">
          <div class="t">${escapeHtml(dtText)}</div>
          <div class="b">Coca-Cola: <b>${escapeHtml(a.coca.join(', '))}</b> • São Geraldo: <b>${escapeHtml(a.geraldo)}</b></div>
        </div>
        <div class="hint" style="text-align:right;font-weight:1000;">6L</div>
      `;
      cont.appendChild(item);
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function cssEscape(str) {
    // fallback simples (no necessidade de CSS.escape em todos ambientes)
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // ---------- Menu hamburguer ----------
  function initMenu() {
    const burgerBtn = document.getElementById('burgerBtn');
    const sidePanel = document.getElementById('sidePanel');

    function setExpanded(exp) {
      burgerBtn.setAttribute('aria-expanded', exp ? 'true' : 'false');
      sidePanel.classList.toggle('open', exp);
      sidePanel.setAttribute('aria-hidden', exp ? 'false' : 'true');
    }

    setExpanded(false);

    burgerBtn.addEventListener('click', () => {
      const isOpen = sidePanel.classList.contains('open');
      setExpanded(!isOpen);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setExpanded(false);
    });

    // fecha ao clicar fora
    document.addEventListener('click', (e) => {
      if (!sidePanel.classList.contains('open')) return;
      const t = e.target;
      if (t === burgerBtn) return;
      if (sidePanel.contains(t)) return;
      setExpanded(false);
    });
  }

  // ---------- Ações ----------
  function initActions() {
    const statusText = document.getElementById('statusText');


    const btnRegenerate = document.getElementById('btnRegenerate');
    btnRegenerate.addEventListener('click', () => {
      if (state.people.length < 3) {
        return showToast('Poucas pessoas', 'Para gerar 1 sábado, precisa de pelo menos 3 pessoas.');
      }

      // Recalcula mês atual, mantendo histórico existente
      const mk = computeCurrentMonthKey();
      const built = buildAssignmentsForMonth(mk, state.people);
      for (const a of built) {
        if (!state.assignmentsByDate[a.dateYMD]) state.assignmentsByDate[a.dateYMD] = a;
      }

      state.updatedAt = new Date().toISOString();
      saveState();
      renderCalendar();
      renderHistory();
      showToast('Recalculo aplicado', `Mês ${mk} atualizado para sábados sem responsáveis.`);

      statusText.textContent = 'Atualizado';
    });

    const btnReset = document.getElementById('btnReset');
    btnReset.addEventListener('click', () => {
      if (!confirm('Confirmar reset? Isso apagará lista e histórico no navegador.')) return;
      state = { people: DEFAULT_PEOPLE.slice(), assignmentsByDate: {}, imagesByTypeAndDate: {}, updatedAt: null, lastMondayRefresh: null };
      saveState();
      ensureMonthlyAssignmentsUpTo(new Date());
      renderPeople();
      renderCalendar();
      renderHistory();
      showToast('Reset concluído', 'Dados locais apagados e estado inicial restaurado.');
      statusText.textContent = 'Pronto';
    });
  }

  function init() {
    initMenu();
    initActions();

    const statusText = document.getElementById('statusText');
    statusText.textContent = 'Preparando...';

    ensureMonthlyAssignmentsUpTo(new Date());
    maybeUpdateOnMonday();

    renderPeople();
    renderCalendar();
    renderHistory();
    renderStatusText();
  }

  init();
})();

