/*
  Better Handy Diet - Frontend renderer
  Features:
  - Navigazione giorni (globale o per-pasto, in base al layout)
  - Carte pasti con piatti e quantità
  - Selezione alternative per ogni piatto
  - One-column: sezioni a fisarmonica (alternative/note) sotto il piatto
  - Two-columns: pannello laterale per alternative / note / lista spesa
  - Lista spesa Giorno/Settimana con aggregazione
  - Persistenza scelte e scambi pasti in localStorage
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
const STORAGE_SWAP_KEY = 'better_handy_diet_swaps_v1';
const STORAGE_PROMOTE_KEY = 'better_handy_diet_promotions_v1';

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

function getSwaps() {
  try {
    const raw = localStorage.getItem(STORAGE_SWAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setSwaps(sw) {
  localStorage.setItem(STORAGE_SWAP_KEY, JSON.stringify(sw));
}

function getPromotions() {
  try {
    const raw = localStorage.getItem(STORAGE_PROMOTE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setPromotions(p) {
  localStorage.setItem(STORAGE_PROMOTE_KEY, JSON.stringify(p));
}

function makeAltFromDish(dish) {
  return {
    id: `orig:${dish.id}`,
    name: dish.name,
    quantityFromName: dish.quantityFromName,
    ingredients: (dish.ingredients || []).map((x) => ({ ...x })),
    notes: dish.notes || '',
  };
}

function buildDishViewModel(dish, promotions) {
  const promotedAltId = promotions[dish.id] || null;
  if (!promotedAltId) {
    return { main: dish, alts: dish.alternatives || [], promotedAltId: null };
  }
  const alts = [];
  // original main becomes an alternative
  alts.push(makeAltFromDish(dish));
  // other alts excluding the promoted one
  for (const a of dish.alternatives || []) {
    if (a.id !== promotedAltId) alts.push(a);
  }
  const main = (dish.alternatives || []).find((a) => a.id === promotedAltId) || dish;
  return { main, alts, promotedAltId };
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
    // One-column: no side panel needed
    return { main: single, side: null };
  }
  // Fallback: create a container
  const fallback = document.createElement('div');
  fallback.id = 'content';
  document.body.appendChild(fallback);
  return { main: fallback, side: null };
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
    return { name: x.name, quantity: parts.join(' + ') };
  });
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

// --- Categorizzazione ingredienti e raggruppamento ---
function categorizeIngredient(name) {
  const n = (name || '').toLowerCase();
  const has = (s) => n.includes(s);

  if ([
    'zucchin', 'carot', 'cetriol', 'pomodor', 'melanzan', 'peperon', 'lattuga', 'insalata', 'finocch',
    'radicchio', 'cipoll', 'cipollott', 'sedano', 'ravanell', 'verza', 'cavol', 'broccol', 'spinac', 'cicoria',
    'erbette', 'rapanell'
  ].some(has)) return 'Verdura fresca';

  if ([
    'frutta', 'mela', 'pere', 'pera', 'kiwi', 'melograno', 'ribes', 'mirtill', 'banana', 'arancia', 'limone', 'uva'
  ].some(has)) return 'Frutta';

  if ([ 'fagiol', 'ceci', 'lenticch', 'pisell', 'fave', 'lupin' ].some(has)) return 'Legumi';

  if ([ 'riso', 'orzo', 'farro', 'cereali', 'crusca', 'fiocchi', 'muesli', 'avena' ].some(has)) return 'Cereali e derivati';

  if ([ 'pane', 'wasa', 'gallette', 'cracker', 'crackers', 'crostino', 'norvegesi' ].some(has)) return 'Pane e sostituti';

  if ([ 'biscott', 'kellogg', 'frollin', 'muesli', 'nice morning', 'galbusera', 'marmellata' ].some(has)) return 'Colazione';

  if ([ 'latte', 'yogurt', 'parmigiano', 'formagg' ].some(has)) return 'Latticini';

  if (has('uovo') || has('uova')) return 'Uova';

  if ([ 'pesce', 'merluzzo', 'salmone', 'spigola', 'branzino', 'tonno', 'sgombro', 'seppia', 'pesce spada' ].some(has)) return 'Pesce';

  if ([ 'carne', 'pollo', 'manzo', 'maiale', 'vitello', 'tacchino' ].some(has)) return 'Carne';

  if ([ 'noci', 'nocciole', 'mandorle', 'semi', 'pinoli', 'zucca', 'lino' ].some(has)) return 'Semi e frutta secca';

  if ([ 'olive', 'capperi', 'passata', "sott'olio" ].some(has)) return "Conserve e sott'olio";

  if ([ 'basilico', 'prezzemolo', 'erbe aromatiche', 'peperoncini', 'peperoncino' ].some(has)) return 'Erbe e spezie';

  if ([ 'olio', 'sale', 'pepe', 'aceto', 'brodo' ].some(has)) return 'Condimenti';

  if ([ "tè", "te'", 'caffè', 'caffe', 'latte di soia' ].some(has)) return 'Bevande';

  return 'Altro';
}

function aggregateIngredientsByCategory(dishes) {
  const flat = aggregateIngredients(dishes);
  const order = [
    'Verdura fresca', 'Frutta', 'Legumi', 'Cereali e derivati', 'Pane e sostituti', 'Colazione',
    'Latticini', 'Uova', 'Pesce', 'Carne', 'Semi e frutta secca', "Conserve e sott'olio", 'Erbe e spezie',
    'Condimenti', 'Bevande', 'Altro'
  ];
  const groupsMap = new Map();
  for (const it of flat) {
    const cat = categorizeIngredient(it.name);
    if (!groupsMap.has(cat)) groupsMap.set(cat, []);
    groupsMap.get(cat).push(it);
  }
  for (const arr of groupsMap.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
  const groups = [];
  for (const cat of order) {
    if (groupsMap.has(cat)) groups.push({ category: cat, items: groupsMap.get(cat) });
  }
  for (const [cat, items] of groupsMap.entries()) {
    if (!order.includes(cat)) groups.push({ category: cat, items });
  }
  return groups;
}

// --- Swaps (scambio pasti tra giorni) ---
function effectiveDayForMeal(swaps, day, mealType) {
  const map = swaps?.[mealType] || {};
  return map[day] || day;
}

function swapMeals(swaps, mealType, dayA, dayB) {
  swaps[mealType] = swaps[mealType] || {};
  swaps[mealType][dayA] = dayB;
  swaps[mealType][dayB] = dayA;
}

function resetSwapForDay(swaps, mealType, day) {
  if (!swaps?.[mealType]) return;
  const other = swaps[mealType][day];
  delete swaps[mealType][day];
  if (other && swaps[mealType][other] === day) delete swaps[mealType][other];
  if (Object.keys(swaps[mealType]).length === 0) delete swaps[mealType];
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

function renderShoppingList(sideEl, usedDishes, titleSuffix = '') {
  const groups = aggregateIngredientsByCategory(usedDishes);
  const html = groups.length
    ? groups
        .map(
          (g) => `
            <h6 class="mt-3">${g.category}</h6>
            <ul class="list-group mb-2">${g.items
              .map(
                (i) => `<li class="list-group-item d-flex justify-content-between">
                  <span>${i.name}</span>
                  <span class="text-muted">${i.quantity}</span>
                </li>`
              )
              .join('')}</ul>`
        )
        .join('')
    : '<div class="text-muted">Nessun ingrediente</div>';
  renderRightPanel(
    sideEl,
    `<h5 class="mb-3">Lista spesa${titleSuffix ? ' - ' + titleSuffix : ''}</h5>${html}`
  );
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
  let swaps = getSwaps();
  let promotions = getPromotions();
  const days = Object.keys(data);
  let dayIdx = 0;
  let shoppingScope = 'day'; // 'day' | 'week'
  let shoppingVisible = false; // two-col default off; one-col default on (set below)
  let currentSidePanel = { type: null, key: null }; // two-col panel state

  const isTwoCol = !!document.getElementById('content-a');
  const isOneCol = !!document.getElementById('content') && !isTwoCol;

  const header = document.createElement('div');
  header.className = 'd-flex align-items-center justify-content-between mb-3 flex-wrap gap-2';
  if (isTwoCol) {
    header.innerHTML = `
      <div class="btn-group" role="group">
        <button id="prevDay" class="btn btn-outline-secondary" title="Giorno precedente">&laquo;</button>
        <span id="dayTitle" class="btn btn-outline-primary disabled"></span>
        <button id="nextDay" class="btn btn-outline-secondary" title="Giorno successivo">&raquo;</button>
      </div>
      <div class="btn-toolbar" role="toolbar">
        <div class="btn-group me-2" role="group">
          <button id="btnScopeDay" class="btn btn-outline-success active">Giorno</button>
          <button id="btnScopeWeek" class="btn btn-outline-success">Settimana</button>
          <button id="btnShopping" class="btn btn-success">Lista spesa</button>
        </div>
        <div class="btn-group" role="group">
          <button id="btnExport" class="btn btn-outline-primary">Esporta</button>
          <button id="btnImport" class="btn btn-outline-secondary">Importa</button>
          <button id="btnResetAll" class="btn btn-outline-danger">Reset giorno</button>
        </div>
      </div>
      <input id="importFile" type="file" accept="application/json" class="d-none" />
    `;
  } else {
    // One-column: niente prev/next globali, niente pannello laterale
    header.innerHTML = `
      <div class="fw-semibold">Impostazioni</div>
      <div class="btn-group" role="group">
        <button id="btnExport" class="btn btn-outline-primary">Esporta</button>
        <button id="btnImport" class="btn btn-outline-secondary">Importa</button>
        <button id="btnResetAll" class="btn btn-outline-danger">Reset giorno</button>
      </div>
      <input id="importFile" type="file" accept="application/json" class="d-none" />
    `;
  }

  const mealsContainer = document.createElement('div');
  // One-col: contenitore risultati ricerca
  const searchResults = document.createElement('div');
  searchResults.id = 'searchResults';
  searchResults.className = 'card mb-3 d-none';
  searchResults.innerHTML = `
    <div class="card-header d-flex justify-content-between align-items-center">
      <strong>Risultati ricerca</strong>
      <button id="searchHide" class="btn btn-sm btn-outline-secondary">Chiudi</button>
    </div>
    <div class="card-body" id="searchResultsBody"></div>
  `;
  const shoppingTop = document.createElement('div');
  if (isOneCol) {
    shoppingTop.className = 'card mb-3';
    shoppingTop.innerHTML = `
      <div class="card-header d-flex justify-content-between align-items-center">
        <strong>Lista spesa</strong>
        <div class="btn-group btn-group-sm" role="group">
          <button id="topScopeDay" class="btn btn-outline-success active">Giorno</button>
          <button id="topScopeWeek" class="btn btn-outline-success">Settimana</button>
          <button id="topToggle" class="btn btn-outline-secondary">Nascondi</button>
        </div>
      </div>
      <div class="card-body" id="shoppingTopBody"></div>
    `;
    shoppingVisible = true; // default visible in one-column
  }

  function updateDayTitle() {
    document.getElementById('dayTitle').textContent = days[dayIdx];
  }

  function collectUsedDishesForDay(day) {
    const dayMeals = data[day];
    const mealTypes = MEAL_ORDER.filter((m) => dayMeals[m]).concat(
      Object.keys(dayMeals).filter((m) => !MEAL_ORDER.includes(m))
    );
    const used = [];
    mealTypes.forEach((mealType) => {
      const sourceDay = effectiveDayForMeal(swaps, day, mealType);
      const items = (data[sourceDay] || {})[mealType] || [];
      items.forEach((dish) => {
        const selAltIdRaw = currentChoiceForDish(selections, day, mealType, dish);
        const { main, alts, promotedAltId } = buildDishViewModel(dish, promotions);
        const selAltId = selAltIdRaw === promotedAltId ? null : selAltIdRaw;
        let eff = main;
        if (selAltId) {
          const found = (alts || []).find((a) => a.id === selAltId);
          if (found) eff = found;
        }
        used.push(eff);
      });
    });
    return used;
  }

  function collectUsedDishesForWeek() {
    const usedAll = [];
    days.forEach((d) => usedAll.push(...collectUsedDishesForDay(d)));
    return usedAll;
  }

  function renderTopShopping() {
    if (!isOneCol) return;
    const body = shoppingTop.querySelector('#shoppingTopBody');
    if (!shoppingVisible) {
      body.classList.add('d-none');
      return;
    }
    body.classList.remove('d-none');
    const used = shoppingScope === 'week' ? collectUsedDishesForWeek() : collectUsedDishesForDay(days[dayIdx]);
    const groups = aggregateIngredientsByCategory(used);
    body.innerHTML = groups.length
      ? groups
          .map(
            (g) => `
              <h6 class="mt-3">${g.category}</h6>
              <ul class="list-group mb-2">${g.items
                .map(
                  (i) => `<li class="list-group-item d-flex justify-content-between">
                    <span>${i.name}</span>
                    <span class="text-muted">${i.quantity}</span>
                  </li>`
                )
                .join('')}</ul>`
          )
          .join('')
      : '<div class="text-muted">Nessun ingrediente</div>';
  }

  // Ricerca: scansione e rendering risultati
  function computeMatches(term) {
    const t = term.trim().toLowerCase();
    if (!t) return [];
    const matches = [];
    days.forEach((d) => {
      const dayMeals = data[d];
      const mealTypes = MEAL_ORDER.filter((m) => dayMeals[m]).concat(
        Object.keys(dayMeals).filter((m) => !MEAL_ORDER.includes(m))
      );
      mealTypes.forEach((mealType) => {
        const items = (dayMeals[mealType] || []);
        items.forEach((dish) => {
          if ((dish.name || '').toLowerCase().includes(t)) {
            matches.push({ day: d, mealType, dishName: dish.name, kind: 'principale' });
          }
          (dish.alternatives || []).forEach((a) => {
            if ((a.name || '').toLowerCase().includes(t)) {
              matches.push({ day: d, mealType, dishName: a.name, kind: 'alternativa' });
            }
          });
        });
      });
    });
    return matches;
  }

  function renderSearchResultsTwoCol(term) {
    const list = computeMatches(term);
    const html = list.length
      ? `<h6 class="mb-2">Risultati per: <em>${term}</em> (${list.length})</h6>
         <div class="list-group">${list
           .map((m) => `
             <div class="list-group-item d-flex justify-content-between align-items-start gap-2">
               <div>
                 <div class="fw-semibold">${m.dishName}</div>
                 <div class="text-muted small">${m.kind} — ${m.day} • ${m.mealType}</div>
               </div>
               <button class="btn btn-sm btn-outline-primary" data-goto="${m.day}|${m.mealType}">Vai</button>
             </div>`)
           .join('')}</div>`
      : `<div class="text-muted">Nessun risultato per "${term}"</div>`;
    if (rootSide) {
      renderRightPanel(rootSide, html);
      currentSidePanel = { type: 'search', key: term };
      rootSide.querySelectorAll('[data-goto]')?.forEach((btn) => {
        btn.addEventListener('click', () => {
          const [d, m] = btn.getAttribute('data-goto').split('|');
          const idx = days.indexOf(d);
          if (idx >= 0) dayIdx = idx;
          renderDay(m);
        });
      });
    }
  }

  function renderSearchResultsOneCol(term) {
    const list = computeMatches(term);
    const body = searchResults.querySelector('#searchResultsBody');
    if (list.length === 0) {
      body.innerHTML = `<div class="text-muted">Nessun risultato per "${term}"</div>`;
    } else {
      body.innerHTML = `<div class="list-group">${list
        .map((m) => `
          <div class="list-group-item d-flex justify-content-between align-items-start gap-2">
            <div>
              <div class="fw-semibold">${m.dishName}</div>
              <div class="text-muted small">${m.kind} — ${m.day} • ${m.mealType}</div>
            </div>
            <button class="btn btn-sm btn-outline-primary" data-goto="${m.day}|${m.mealType}">Vai</button>
          </div>`)
        .join('')}</div>`;
      searchResults.querySelectorAll('[data-goto]')?.forEach((btn) => {
        btn.addEventListener('click', () => {
          const [d, m] = btn.getAttribute('data-goto').split('|');
          const idx = days.indexOf(d);
          if (idx >= 0) dayIdx = idx;
          renderDay(m);
        });
      });
    }
    searchResults.classList.remove('d-none');
  }

  function renderDay(anchorMealType) {
    const day = days[dayIdx];
    if (isTwoCol) updateDayTitle();
    mealsContainer.innerHTML = '';

    const dayMeals = data[day];
    const mealTypes = MEAL_ORDER.filter((m) => dayMeals[m]).concat(
      Object.keys(dayMeals).filter((m) => !MEAL_ORDER.includes(m))
    );

    const usedDishes = [];

    mealTypes.forEach((mealType) => {
      const sourceDay = effectiveDayForMeal(swaps, day, mealType);
      const items = ((data[sourceDay] || {})[mealType]) || [];
      const card = document.createElement('div');
      card.className = 'card mb-3';
      card.innerHTML = `
        <div class="card-header d-flex justify-content-between align-items-center">
          <strong id="anchor-${mealType}">${mealType}</strong>
        </div>
        <div class="list-group list-group-flush"></div>
      `;
      const list = card.querySelector('.list-group');

      items.forEach((dish) => {
        const selAltIdRaw = currentChoiceForDish(selections, day, mealType, dish);
        const { main, alts, promotedAltId } = buildDishViewModel(dish, promotions);
        const selAltId = selAltIdRaw === promotedAltId ? null : selAltIdRaw;
        let effDish = main;
        if (selAltId) {
          const found = (alts || []).find((a) => a.id === selAltId);
          if (found) effDish = found;
        }
        usedDishes.push(effDish);

        const li = document.createElement('div');
        li.className = 'list-group-item';
        const hasAlts = (alts && alts.length) || (dish.alternatives && dish.alternatives.length);
        const hasNotes = !!effDish.notes;
        li.innerHTML = `
          <div class="d-flex justify-content-between align-items-start gap-3">
            <div>
              <div class="fw-semibold">${effDish.name}</div>
              <div class="text-muted small">${effDish.quantityFromName || ''}</div>
              ${selAltId ? '<span class="badge bg-info mt-1">Sostituito</span>' : ''}
            </div>
            <div class="btn-group btn-group-sm" role="group">
              ${hasAlts ? '<button class="btn btn-outline-primary" data-act="alts">Alternative</button>' : ''}
              ${hasNotes ? '<button class="btn btn-outline-secondary" data-act="note">Note</button>' : ''}
              ${selAltId ? '<button class="btn btn-outline-danger" data-act="reset">Reset</button>' : ''}
            </div>
          </div>
          ${isOneCol && (hasAlts || hasNotes) ? '<div class="mt-2" data-inline-panel></div>' : ''}
        `;

        li.addEventListener('click', (ev) => {
          const btn = ev.target.closest('button');
          if (!btn) return;
          const act = btn.getAttribute('data-act');
          if (act === 'alts') {
            const view = buildDishViewModel(dish, promotions);
            const listToUse = view.alts && view.alts.length ? view.alts : (dish.alternatives || []);
            if (!listToUse.length) return;
            const altsHtml = `
              <h6 class="mb-2">Alternative per: <em>${view.main.name}</em></h6>
              <div class="list-group">
                ${listToUse
                  .map((a) => `
                    <div class="list-group-item">
                      <div class="d-flex justify-content-between align-items-start gap-2">
                        <div>
                          <div class="fw-semibold">${a.name}</div>
                          <div class="text-muted small">${a.quantityFromName || ''}</div>
                        </div>
                        <div class="btn-group btn-group-sm">
                          <button class="btn btn-outline-primary" data-alt-id="${a.id}">Scegli</button>
                          <button class="btn btn-outline-dark" data-promote-id="${a.id}">Rendi principale</button>
                        </div>
                      </div>
                    </div>`)
                  .join('')}
                ${promotions[dish.id] ? `
                  <div class="list-group-item">
                    <button class="btn btn-sm btn-outline-warning" data-promote-reset>Ripristina piatto originale</button>
                  </div>` : ''}
              </div>
            `;
            const sideKey = `${days[dayIdx]}|${mealType}|${dish.id}`;
            if (isTwoCol && rootSide) {
              if (currentSidePanel.type === 'alts' && currentSidePanel.key === sideKey) {
                rootSide.innerHTML = '';
                currentSidePanel = { type: null, key: null };
                return;
              }
              renderRightPanel(rootSide, altsHtml);
              currentSidePanel = { type: 'alts', key: sideKey };
              rootSide.querySelectorAll('[data-alt-id]').forEach((btnAlt) => {
                btnAlt.addEventListener('click', () => {
                  const altId = btnAlt.getAttribute('data-alt-id');
                  setChoiceForDish(selections, day, mealType, dish, altId);
                  setSelections(selections);
                  showToast('Alternativa applicata', 'success');
                  renderDay();
                });
              });
              // promotions
              rootSide.querySelectorAll('[data-promote-id]').forEach((btnPro) => {
                btnPro.addEventListener('click', () => {
                  const altId = btnPro.getAttribute('data-promote-id');
                  if (altId && altId.startsWith('orig:')) {
                    delete promotions[dish.id];
                  } else {
                    promotions[dish.id] = altId;
                    // if day selection equals new main, clear it
                    const currSel = currentChoiceForDish(selections, day, mealType, dish);
                    if (currSel && currSel === altId) {
                      setChoiceForDish(selections, day, mealType, dish, null);
                      setSelections(selections);
                    }
                  }
                  setPromotions(promotions);
                  showToast('Piatto principale aggiornato', 'primary');
                  renderDay();
                });
              });
              const btnReset = rootSide.querySelector('[data-promote-reset]');
              if (btnReset) btnReset.addEventListener('click', () => {
                delete promotions[dish.id];
                setPromotions(promotions);
                showToast('Ripristinato piatto principale originale', 'warning');
                renderDay();
              });
            } else {
              const panel = li.querySelector('[data-inline-panel]');
              if (!panel) return;
              if (panel.dataset.shown === 'alts') {
                panel.innerHTML = '';
                panel.dataset.shown = '';
                return;
              }
              panel.innerHTML = altsHtml;
              panel.dataset.shown = 'alts';
              li.querySelectorAll('[data-alt-id]').forEach((btnAlt) => {
                btnAlt.addEventListener('click', () => {
                  const altId = btnAlt.getAttribute('data-alt-id');
                  setChoiceForDish(selections, day, mealType, dish, altId);
                  setSelections(selections);
                  showToast('Alternativa applicata', 'success');
                  renderDay(mealType);
                });
              });
              // promotions inline
              li.querySelectorAll('[data-promote-id]').forEach((btnPro) => {
                btnPro.addEventListener('click', () => {
                  const altId = btnPro.getAttribute('data-promote-id');
                  if (altId && altId.startsWith('orig:')) {
                    delete promotions[dish.id];
                  } else {
                    promotions[dish.id] = altId;
                    const currSel = currentChoiceForDish(selections, day, mealType, dish);
                    if (currSel && currSel === altId) {
                      setChoiceForDish(selections, day, mealType, dish, null);
                      setSelections(selections);
                    }
                  }
                  setPromotions(promotions);
                  showToast('Piatto principale aggiornato', 'primary');
                  renderDay(mealType);
                });
              });
              const btnReset = li.querySelector('[data-promote-reset]');
              if (btnReset) btnReset.addEventListener('click', () => {
                delete promotions[dish.id];
                setPromotions(promotions);
                showToast('Ripristinato piatto principale originale', 'warning');
                renderDay(mealType);
              });
            }
          } else if (act === 'note') {
            const html = `
              <h6 class="mb-2">Note</h6>
              <div class="alert alert-info" role="alert">${effDish.notes}</div>
            `;
            const sideKey = `${days[dayIdx]}|${mealType}|${dish.id}`;
            if (isTwoCol && rootSide) {
              if (currentSidePanel.type === 'note' && currentSidePanel.key === sideKey) {
                rootSide.innerHTML = '';
                currentSidePanel = { type: null, key: null };
                return;
              }
              renderRightPanel(rootSide, html);
              currentSidePanel = { type: 'note', key: sideKey };
            } else {
              const panel = li.querySelector('[data-inline-panel]');
              if (!panel) return;
              if (panel.dataset.shown === 'note') {
                panel.innerHTML = '';
                panel.dataset.shown = '';
                return;
              }
              panel.innerHTML = html;
              panel.dataset.shown = 'note';
            }
          } else if (act === 'reset') {
            setChoiceForDish(selections, day, mealType, dish, null);
            setSelections(selections);
            showToast('Ripristinato', 'warning');
            renderDay(mealType);
          }
        });

        list.appendChild(li);
      });

      // Footer con controlli (solo one-column): cambio giorno per-pasto + scambio pasti
      if (isOneCol) {
        const footer = document.createElement('div');
        footer.className = 'card-footer d-flex justify-content-between align-items-center flex-wrap gap-2';
        const nav = document.createElement('div');
        nav.className = 'btn-group btn-group-sm';
        nav.innerHTML = `
          <button class="btn btn-outline-secondary" data-meal-nav="prev">&laquo; Giorno</button>
          <span class="btn btn-outline-primary disabled">${days[dayIdx]}</span>
          <button class="btn btn-outline-secondary" data-meal-nav="next">Giorno &raquo;</button>
        `;
        nav.querySelector('[data-meal-nav="prev"]').addEventListener('click', () => {
          dayIdx = (dayIdx - 1 + days.length) % days.length;
          renderDay(mealType);
          const el = document.getElementById(`anchor-${mealType}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        nav.querySelector('[data-meal-nav="next"]').addEventListener('click', () => {
          dayIdx = (dayIdx + 1) % days.length;
          renderDay(mealType);
          const el = document.getElementById(`anchor-${mealType}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        const swapWrap = document.createElement('div');
        swapWrap.className = 'd-flex align-items-center gap-2';
        const sel = document.createElement('select');
        sel.className = 'form-select form-select-sm';
        sel.style.width = '12rem';
        days.forEach((d, i) => {
          if (i === dayIdx) return; // exclude current
          const opt = document.createElement('option');
          opt.value = d;
          opt.textContent = `Scambia con ${d}`;
          sel.appendChild(opt);
        });
        const btnSwap = document.createElement('button');
        btnSwap.className = 'btn btn-sm btn-outline-dark';
        btnSwap.textContent = 'Scambia';
        btnSwap.addEventListener('click', () => {
          const target = sel.value;
          if (!target) return;
          swapMeals(swaps, mealType, days[dayIdx], target);
          setSwaps(swaps);
          showToast(`Pasto "${mealType}" scambiato: ${days[dayIdx]} ⇄ ${target}`, 'primary');
          renderDay(mealType);
        });

        const btnResetSwap = document.createElement('button');
        btnResetSwap.className = 'btn btn-sm btn-outline-warning';
        btnResetSwap.textContent = 'Ripristina pasto';
        btnResetSwap.addEventListener('click', () => {
          resetSwapForDay(swaps, mealType, days[dayIdx]);
          setSwaps(swaps);
          showToast(`Pasto "${mealType}" ripristinato`, 'warning');
          renderDay(mealType);
        });

        swapWrap.appendChild(sel);
        swapWrap.appendChild(btnSwap);
        swapWrap.appendChild(btnResetSwap);

        footer.appendChild(nav);
        footer.appendChild(swapWrap);
        card.appendChild(footer);
      }

      mealsContainer.appendChild(card);
    });

    // Shopping list
    if (isTwoCol && rootSide) {
      if (shoppingVisible) {
        if (shoppingScope === 'week') {
          renderShoppingList(rootSide, collectUsedDishesForWeek(), 'Settimana');
          currentSidePanel = { type: 'shopping', key: 'week' };
        } else {
          renderShoppingList(rootSide, usedDishes, days[dayIdx]);
          currentSidePanel = { type: 'shopping', key: days[dayIdx] };
        }
      }
    } else if (isOneCol) {
      renderTopShopping();
    }

    // Optional: anchor back to requested meal type
    if (anchorMealType) {
      const el = document.getElementById(`anchor-${anchorMealType}`);
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }

  // Controls
  if (isTwoCol) {
    header.querySelector('#prevDay').addEventListener('click', () => {
      dayIdx = (dayIdx - 1 + days.length) % days.length;
      renderDay();
    });
    header.querySelector('#nextDay').addEventListener('click', () => {
      dayIdx = (dayIdx + 1) % days.length;
      renderDay();
    });
    header.querySelector('#btnShopping').addEventListener('click', () => {
      shoppingVisible = !shoppingVisible;
      const btn = header.querySelector('#btnShopping');
      btn.classList.toggle('active', shoppingVisible);
      if (shoppingVisible) {
        if (shoppingScope === 'week') {
          renderShoppingList(rootSide, collectUsedDishesForWeek(), 'Settimana');
          currentSidePanel = { type: 'shopping', key: 'week' };
        } else {
          const used = collectUsedDishesForDay(days[dayIdx]);
          renderShoppingList(rootSide, used, days[dayIdx]);
          currentSidePanel = { type: 'shopping', key: days[dayIdx] };
        }
      } else if (rootSide) {
        // Clear side panel when turning off
        rootSide.innerHTML = '';
        currentSidePanel = { type: null, key: null };
      }
    });
    header.querySelector('#btnScopeDay').addEventListener('click', () => {
      shoppingScope = 'day';
      header.querySelector('#btnScopeDay').classList.add('active');
      header.querySelector('#btnScopeWeek').classList.remove('active');
      if (shoppingVisible) renderDay();
    });
    header.querySelector('#btnScopeWeek').addEventListener('click', () => {
      shoppingScope = 'week';
      header.querySelector('#btnScopeWeek').classList.add('active');
      header.querySelector('#btnScopeDay').classList.remove('active');
      if (shoppingVisible) renderDay();
    });
  } else {
    // One-column shopping scope toggles
    shoppingTop?.querySelector('#topScopeDay')?.addEventListener('click', () => {
      shoppingScope = 'day';
      shoppingTop.querySelector('#topScopeDay').classList.add('active');
      shoppingTop.querySelector('#topScopeWeek').classList.remove('active');
      renderTopShopping();
    });
    shoppingTop?.querySelector('#topScopeWeek')?.addEventListener('click', () => {
      shoppingScope = 'week';
      shoppingTop.querySelector('#topScopeWeek').classList.add('active');
      shoppingTop.querySelector('#topScopeDay').classList.remove('active');
      renderTopShopping();
    });
    shoppingTop?.querySelector('#topToggle')?.addEventListener('click', () => {
      shoppingVisible = !shoppingVisible;
      const btn = shoppingTop.querySelector('#topToggle');
      btn.textContent = shoppingVisible ? 'Nascondi' : 'Mostra';
      renderTopShopping();
    });
  }
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

  // Search UI
  const searchGroup = document.createElement('div');
  searchGroup.className = 'input-group input-group-sm';
  searchGroup.style.maxWidth = '320px';
  searchGroup.innerHTML = `
    <span class="input-group-text">Cerca</span>
    <input id="searchInput" class="form-control" placeholder="cerca piatti..." />
    <button id="searchClear" class="btn btn-outline-secondary" type="button">×</button>
  `;
  if (isTwoCol) header.querySelector('.btn-toolbar')?.appendChild(searchGroup);
  else header.appendChild(searchGroup);

  const searchInput = searchGroup.querySelector('#searchInput');
  const searchClear = searchGroup.querySelector('#searchClear');
  if (isTwoCol) {
    searchInput.addEventListener('input', () => {
      const term = searchInput.value.trim();
      if (term) {
        renderSearchResultsTwoCol(term);
      } else {
        if (shoppingVisible) {
          if (shoppingScope === 'week') renderShoppingList(rootSide, collectUsedDishesForWeek(), 'Settimana');
          else renderShoppingList(rootSide, collectUsedDishesForDay(days[dayIdx]), days[dayIdx]);
          currentSidePanel = { type: 'shopping', key: shoppingScope === 'week' ? 'week' : days[dayIdx] };
        } else if (rootSide) {
          rootSide.innerHTML = '';
          currentSidePanel = { type: null, key: null };
        }
      }
    });
  } else {
    searchInput.addEventListener('input', () => {
      const term = searchInput.value.trim();
      if (term) renderSearchResultsOneCol(term);
      else searchResults.classList.add('d-none');
    });
  }
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
  });

  // One-col: chiudi risultati ricerca
  if (isOneCol) {
    searchResults.querySelector('#searchHide')?.addEventListener('click', () => {
      searchResults.classList.add('d-none');
    });
  }

  // Mount
  rootMain.innerHTML = '';
  rootMain.appendChild(header);
  if (isOneCol) rootMain.appendChild(searchResults);
  if (isOneCol) rootMain.appendChild(shoppingTop);
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
