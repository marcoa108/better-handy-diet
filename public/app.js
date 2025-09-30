/*
  Better Handy Diet - Frontend renderer
  Features:
  - Navigazione giorni (prev/next)
  - Carte pasti con piatti e quantità
  - Selezione alternative per ogni piatto
  - Pannello laterale per alternative / note / lista spesa
  - Lista spesa aggregata considerando le scelte correnti
  - Persistenza scelte in localStorage
  - Import/Export scelte
  - Toast di notifica
*/

const MEAL_ORDER = [
  'Colazione',
  'Tra colazione e pranzo',
  'Pranzo',
  'Tra pranzo e cena',
  'Cena',
  'Dopo cena',
];

const STORAGE_KEY = 'better_handy_diet_selections_v1';

// Simple ingredient categorization
function categorizeIngredient(name) {
  const n = (name || '').toLowerCase();
  const has = (s) => n.includes(s);
  if (has("sott'olio") || has('sottolio') || has("sott'aceto") || has('vasetto')) return "Sott'olio e conserve";
  if (has('olio')) return 'Oli e condimenti';
  if (has('sale') || has('pepe') || has('aceto') || has('brodo')) return 'Condimenti';
  if (has('zucchin') || has('carot') || has('pomod') || has('melanzan') || has('peperon') || has('insalat') || has('lattuga') || has('radicchi') || has('spinac') || has('cavolo') || has('verza') || has('finoc') || has('sedano') || has('cetriol') || has('ravanelli') || has('cipoll') || has('cipollotto') || has('aglio') || has('prezzemol') || has('basilic') || has('erbe aromatiche')) return 'Verdura fresca';
  if (has('frutta')) return 'Frutta';
  if (has('legumi') || has('ceci') || has('fagiol') || has('lenticch') || has('piselli') || has('fave') || has('lupini')) return 'Legumi';
  if (has('pasta') || has('riso') || has('farro') || has('orzo') || has('cereali') || has('fiocchi') || has('crusca') || has('muesli')) return 'Cereali e derivati';
  if (has('pane') || has('cracker') || has('crakers') || has('gallette') || has('wasa') || has('crostino') || has('biscott')) return 'Pane e prodotti da forno';
  if (has('pesce') || has('salmone') || has('merluzz') || has('sgombro') || has('spigola') || has('branzino') || has('tonno') || has('seppia')) return 'Pesce';
  if (has('carne') || has('pollo') || has("uovo") || has('uova') || has('manzo')) return 'Carne e uova';
  if (has('latte') || has('yogurt') || has('parmigiano') || has('formagg')) return 'Latticini';
  if (has('olive') || has('capperi')) return "Sott'olio e conserve";
  return 'Altro';
}

function getSelections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setSelections(sel) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sel));
}

function ensureToastContainer() {
  if (!document.getElementById('toastContainer')) {
    const div = document.createElement('div');
    div.id = 'toastContainer';
    div.style.position = 'fixed';
    div.style.top = '1rem';
    div.style.right = '1rem';
    div.style.zIndex = '1060';
    document.body.appendChild(div);
  }
}

function showToast(message, variant = 'primary') {
  ensureToastContainer();
  const wrap = document.createElement('div');
  wrap.className = `alert alert-${variant}`;
  wrap.textContent = message;
  document.getElementById('toastContainer').appendChild(wrap);
  setTimeout(() => wrap.remove(), 2500);
}

function detectLayoutContainers() {
  const a = document.getElementById('content-a');
  const b = document.getElementById('content-b');
  if (a && b) {
    return { main: a, side: b };
  }
  const single = document.getElementById('content');
  if (single) {
    // Create a side panel beneath main content for single-column page
    let side = document.getElementById('content-side');
    if (!side) {
      side = document.createElement('div');
      side.id = 'content-side';
      side.className = 'mt-3';
      single.insertAdjacentElement('afterend', side);
    }
    return { main: single, side };
  }
  // Fallback: create a container
  const fallback = document.createElement('div');
  fallback.id = 'content';
  document.body.appendChild(fallback);
  let side = document.createElement('div');
  side.id = 'content-side';
  side.className = 'mt-3';
  fallback.insertAdjacentElement('afterend', side);
  return { main: fallback, side };
}

function parseQty(q) {
  // Returns { value: number|null, unit: string }
  if (!q || typeof q !== 'string') return { value: null, unit: q || '' };
  const m = q.replace(',', '.').match(/([\d.]+)\s*(\w+)?/);
  if (m) return { value: parseFloat(m[1]), unit: (m[2] || '').toLowerCase() };
  return { value: null, unit: q };
}

function aggregateIngredients(dishes) {
  // dishes: array of { ingredients:[{name, quantity}] }
  const map = new Map();
  for (const d of dishes) {
    for (const ing of d.ingredients || []) {
      const key = ing.name.trim();
      const prev = map.get(key) || { name: key, entries: [], sumG: 0, hasNonNumeric: false };
      prev.entries.push(ing.quantity);
      const { value, unit } = parseQty(ing.quantity);
      if (value != null && (unit === 'g' || unit === 'gr' || unit === 'grammi')) {
        prev.sumG += value;
      } else {
        prev.hasNonNumeric = true;
      }
      map.set(key, prev);
    }
  }
  const list = Array.from(map.values()).map((x) => {
    const parts = [];
    if (x.sumG > 0) parts.push(`${x.sumG.toFixed(2)} g`);
    if (x.hasNonNumeric || parts.length === 0) parts.push(...x.entries);
    const cat = categorizeIngredient(x.name);
    return { name: x.name, quantity: parts.join(' + '), category: cat };
  });
  list.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return list;
}

function currentChoiceForDish(selections, day, mealType, dish) {
  return selections?.[day]?.[mealType]?.[dish.id] || null;
}

function setChoiceForDish(selections, day, mealType, dish, altIdOrNull) {
  selections[day] = selections[day] || {};
  selections[day][mealType] = selections[day][mealType] || {};
  if (altIdOrNull) selections[day][mealType][dish.id] = altIdOrNull;
  else delete selections[day][mealType][dish.id];
  if (Object.keys(selections[day][mealType]).length === 0) delete selections[day][mealType];
  if (Object.keys(selections[day]).length === 0) delete selections[day];
}

function resolveDish(dish, selectionAltId) {
  if (!selectionAltId) return dish;
  const found = (dish.alternatives || []).find((a) => a.id === selectionAltId);
  return found || dish;
}

function renderRightPanel(sideEl, contentHtml) {
  sideEl.innerHTML = `
    <div class="card">
      <div class="card-header">
        <strong>Dettagli</strong>
      </div>
      <div class="card-body">
        ${contentHtml}
      </div>
    </div>
  `;
}

function renderShoppingList(sideEl, usedDishes) {
  const list = aggregateIngredients(usedDishes);
  if (!list.length) {
    renderRightPanel(sideEl, `<h5 class="mb-3">Lista spesa (giorno corrente)</h5><div class="text-muted">Nessun ingrediente</div>`);
    return;
  }
  const byCat = list.reduce((acc, it) => {
    acc[it.category] = acc[it.category] || [];
    acc[it.category].push(it);
    return acc;
  }, {});
  const cats = Object.keys(byCat).sort((a, b) => a.localeCompare(b));
  const sections = cats
    .map(
      (c) => `
      <div class="mb-3">
        <div class="fw-bold text-uppercase small text-muted mb-1">${c}</div>
        <ul class="list-group">
          ${byCat[c]
            .map(
              (i) => `<li class="list-group-item d-flex justify-content-between"><span>${i.name}</span><span class="text-muted">${i.quantity}</span></li>`
            )
            .join('')}
        </ul>
      </div>`
    )
    .join('');
  renderRightPanel(sideEl, `<h5 class="mb-3">Lista spesa (giorno corrente)</h5>${sections}`);
}

function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function buildAppUI(rootMain, rootSide, data) {
  let selections = getSelections();
  const days = Object.keys(data);
  let dayIdx = 0;
  let openPanel = null; // { type: 'alts'|'note', dishId: string } or null

  const header = document.createElement('div');
  header.className = 'd-flex align-items-center justify-content-between mb-3';
  header.innerHTML = `
    <div class="btn-group" role="group">
      <button id="prevDay" class="btn btn-outline-secondary" title="Giorno precedente">&laquo;</button>
      <span id="dayTitle" class="btn btn-outline-primary disabled"></span>
      <button id="nextDay" class="btn btn-outline-secondary" title="Giorno successivo">&raquo;</button>
    </div>
    <div class="btn-group" role="group">
      <button id="btnShopping" class="btn btn-outline-success">Lista spesa</button>
      <button id="btnExport" class="btn btn-outline-primary">Esporta</button>
      <button id="btnImport" class="btn btn-outline-secondary">Importa</button>
      <button id="btnResetAll" class="btn btn-outline-danger">Reset giorno</button>
    </div>
    <input id="importFile" type="file" accept="application/json" class="d-none" />
  `;

  // Search UI
  const searchWrap = document.createElement('div');
  searchWrap.className = 'mb-3';
  searchWrap.innerHTML = `
    <div class="input-group">
      <span class="input-group-text">Cerca</span>
      <input id="dietSearch" type="text" class="form-control" placeholder="Cerca piatti (min 2 lettere)..." />
    </div>
    <div id="searchResults" class="mt-2"></div>
  `;

  const mealsContainer = document.createElement('div');

  function updateDayTitle() {
    document.getElementById('dayTitle').textContent = days[dayIdx];
  }

  function mealSlug(mealType) {
    return mealType.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function renderDay() {
    const day = days[dayIdx];
    updateDayTitle();
    mealsContainer.innerHTML = '';

    const dayMeals = data[day];
    const mealTypes = MEAL_ORDER.filter((m) => dayMeals[m]).concat(
      Object.keys(dayMeals).filter((m) => !MEAL_ORDER.includes(m))
    );

    const usedDishes = [];

    mealTypes.forEach((mealType) => {
      const items = dayMeals[mealType] || [];
      const card = document.createElement('div');
      card.className = 'card mb-3';
      const slug = mealSlug(mealType);
      card.setAttribute('data-meal', slug);
      card.innerHTML = `
        <div class="card-header d-flex justify-content-between align-items-center">
          <strong>${mealType}</strong>
        </div>
        <div class="list-group list-group-flush"></div>
      `;
      const list = card.querySelector('.list-group');

      items.forEach((dish) => {
        const selAltId = currentChoiceForDish(selections, day, mealType, dish);
        const effDish = resolveDish(dish, selAltId);
        usedDishes.push(effDish);

        const li = document.createElement('div');
        li.className = 'list-group-item';
        li.innerHTML = `
          <div class="d-flex justify-content-between align-items-start gap-3">
            <div>
              <div class="fw-semibold">${effDish.name}</div>
              <div class="text-muted small">${effDish.quantityFromName || ''}</div>
              ${selAltId ? '<span class="badge bg-info mt-1">Sostituito</span>' : ''}
            </div>
            <div class="btn-group btn-group-sm" role="group">
              ${(dish.alternatives && dish.alternatives.length) ? '<button class="btn btn-outline-primary" data-act="alts">Alternative</button>' : ''}
              ${effDish.notes ? '<button class="btn btn-outline-secondary" data-act="note">Note</button>' : ''}
              ${selAltId ? '<button class="btn btn-outline-danger" data-act="reset">Reset</button>' : ''}
            </div>
          </div>
        `;

        li.addEventListener('click', (ev) => {
          const btn = ev.target.closest('button');
          if (!btn) return;
          const act = btn.getAttribute('data-act');
          if (act === 'alts') {
            if (!dish.alternatives || !dish.alternatives.length) return;
            if (openPanel && openPanel.type === 'alts' && openPanel.dishId === dish.id) {
              // Toggle off
              rootSide.innerHTML = '';
              openPanel = null;
              return;
            }
            const altsHtml = `
              <h5 class="mb-3">Alternative per: <em>${dish.name}</em></h5>
              <div class="list-group">
                ${dish.alternatives
                  .map((a) => `
                    <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-start" data-alt-id="${a.id}">
                      <div>
                        <div class="fw-semibold">${a.name}</div>
                        <div class="text-muted small">${a.quantityFromName || ''}</div>
                      </div>
                      <span class="badge bg-primary">Scegli</span>
                    </button>`)
                  .join('')}
              </div>
            `;
            renderRightPanel(rootSide, altsHtml);
            openPanel = { type: 'alts', dishId: dish.id };
            rootSide.querySelectorAll('[data-alt-id]').forEach((btnAlt) => {
              btnAlt.addEventListener('click', () => {
                const altId = btnAlt.getAttribute('data-alt-id');
                setChoiceForDish(selections, day, mealType, dish, altId);
                setSelections(selections);
                showToast('Alternativa applicata', 'success');
                openPanel = null;
                renderDay();
              });
            });
          } else if (act === 'note') {
            if (openPanel && openPanel.type === 'note' && openPanel.dishId === dish.id) {
              rootSide.innerHTML = '';
              openPanel = null;
              return;
            }
            const html = `
              <h5 class="mb-3">Note</h5>
              <div class="alert alert-info" role="alert">
                ${effDish.notes}
              </div>
            `;
            renderRightPanel(rootSide, html);
            openPanel = { type: 'note', dishId: dish.id };
          } else if (act === 'reset') {
            setChoiceForDish(selections, day, mealType, dish, null);
            setSelections(selections);
            showToast('Ripristinato', 'warning');
            openPanel = null;
            renderDay();
          }
        });

        list.appendChild(li);
      });

      mealsContainer.appendChild(card);
    });

    // Default: show shopping list for current day
    renderShoppingList(rootSide, usedDishes);
  }

  // Controls
  header.querySelector('#prevDay').addEventListener('click', () => {
    dayIdx = (dayIdx - 1 + days.length) % days.length;
    openPanel = null;
    renderDay();
  });
  header.querySelector('#nextDay').addEventListener('click', () => {
    dayIdx = (dayIdx + 1) % days.length;
    openPanel = null;
    renderDay();
  });
  header.querySelector('#btnShopping').addEventListener('click', () => {
    // Recompute from current render
    const day = days[dayIdx];
    const used = [];
    const dayMeals = data[day];
    Object.keys(dayMeals).forEach((mealType) => {
      (dayMeals[mealType] || []).forEach((dish) => {
        const selAltId = currentChoiceForDish(selections, day, mealType, dish);
        used.push(resolveDish(dish, selAltId));
      });
    });
    renderShoppingList(rootSide, used);
  });
  // Search behavior
  function buildSearchResults(q) {
    const query = (q || '').trim().toLowerCase();
    const box = document.getElementById('searchResults');
    if (!box) return;
    if (query.length < 2) {
      box.innerHTML = '';
      return;
    }
    const rows = [];
    days.forEach((dName, dIdx) => {
      const dayMeals = data[dName] || {};
      Object.keys(dayMeals).forEach((mealType) => {
        (dayMeals[mealType] || []).forEach((dish) => {
          const inMain = dish.name.toLowerCase().includes(query);
          const inAlts = (dish.alternatives || []).some((a) => a.name.toLowerCase().includes(query));
          if (inMain || inAlts) {
            rows.push({ dName, dIdx, mealType, dishName: dish.name });
          }
        });
      });
    });
    if (!rows.length) {
      box.innerHTML = '<div class="text-muted">Nessun risultato</div>';
      return;
    }
    box.innerHTML = `
      <div class="card">
        <div class="card-header">Risultati (${rows.length})</div>
        <ul class="list-group list-group-flush">
          ${rows
            .map((r, idx) => `
              <li class="list-group-item d-flex justify-content-between align-items-center">
                <div><strong>${r.dName}</strong> – ${r.mealType} <span class="text-muted">(${r.dishName})</span></div>
                <button class="btn btn-sm btn-outline-primary" data-go="${idx}">Vai</button>
              </li>`)
            .join('')}
        </ul>
      </div>`;
    box.querySelectorAll('[data-go]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-go'), 10);
        const r = rows[idx];
        if (!r) return;
        dayIdx = r.dIdx;
        openPanel = null;
        renderDay();
        // scroll to meal
        const slug = mealSlug(r.mealType);
        const el = document.querySelector(`[data-meal="${slug}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
  searchWrap.querySelector('#dietSearch').addEventListener('input', (e) => buildSearchResults(e.target.value));
  header.querySelector('#btnExport').addEventListener('click', () => {
    download('selezioni_dieta.json', JSON.stringify(getSelections(), null, 2));
    showToast('Esportato file selezioni', 'primary');
  });
  header.querySelector('#btnImport').addEventListener('click', () => {
    header.querySelector('#importFile').click();
  });
  header.querySelector('#importFile').addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      if (typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Formato non valido');
      setSelections(obj);
      selections = obj;
      showToast('Selezioni importate', 'success');
      renderDay();
    } catch (e) {
      showToast('Import fallito: ' + e.message, 'danger');
    } finally {
      ev.target.value = '';
    }
  });
  header.querySelector('#btnResetAll').addEventListener('click', () => {
    const day = days[dayIdx];
    if (selections[day]) delete selections[day];
    setSelections(selections);
    showToast('Scelte del giorno resettate', 'warning');
    renderDay();
  });

  // Mount
  rootMain.innerHTML = '';
  rootMain.appendChild(header);
  rootMain.appendChild(searchWrap);
  rootMain.appendChild(mealsContainer);

  // First render
  renderDay();
}

async function loadDiet() {
  const statusEls = Array.from(document.querySelectorAll('#status, #status-a, #status-b'));
  try {
    const res = await fetch('/api/diet');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const { main, side } = detectLayoutContainers();
    buildAppUI(main, side, data);

    statusEls.forEach((el) => el && el.remove());
  } catch (err) {
    statusEls.forEach((el) => {
      if (el) { el.className = 'alert alert-danger'; el.textContent = 'Errore caricamento dati: ' + err.message; }
    });
  }
}

loadDiet();
