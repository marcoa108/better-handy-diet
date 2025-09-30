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
  const list = aggregateIngredients(usedDishes);
  const html = list.length
    ? `<ul class="list-group">${list
        .map((i) => `<li class="list-group-item d-flex justify-content-between"><span>${i.name}</span><span class="text-muted">${i.quantity}</span></li>`)
        .join('')}</ul>`
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
  const days = Object.keys(data);
  let dayIdx = 0;
  let shoppingScope = 'day'; // 'day' | 'week'

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
  const shoppingTop = document.createElement('div');
  if (isOneCol) {
    shoppingTop.className = 'card mb-3';
    shoppingTop.innerHTML = `
      <div class="card-header d-flex justify-content-between align-items-center">
        <strong>Lista spesa</strong>
        <div class="btn-group btn-group-sm" role="group">
          <button id="topScopeDay" class="btn btn-outline-success active">Giorno</button>
          <button id="topScopeWeek" class="btn btn-outline-success">Settimana</button>
        </div>
      </div>
      <div class="card-body" id="shoppingTopBody"></div>
    `;
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
        const selAltId = currentChoiceForDish(selections, day, mealType, dish);
        used.push(resolveDish(dish, selAltId));
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
    const used = shoppingScope === 'week' ? collectUsedDishesForWeek() : collectUsedDishesForDay(days[dayIdx]);
    const list = aggregateIngredients(used);
    body.innerHTML = list.length
      ? `<ul class="list-group">${list
          .map((i) => `<li class="list-group-item d-flex justify-content-between"><span>${i.name}</span><span class="text-muted">${i.quantity}</span></li>`)
          .join('')}</ul>`
      : '<div class="text-muted">Nessun ingrediente</div>';
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
        const selAltId = currentChoiceForDish(selections, day, mealType, dish);
        const effDish = resolveDish(dish, selAltId);
        usedDishes.push(effDish);

        const li = document.createElement('div');
        li.className = 'list-group-item';
        const hasAlts = dish.alternatives && dish.alternatives.length;
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
            if (!dish.alternatives || !dish.alternatives.length) return;
            const altsHtml = `
              <h6 class="mb-2">Alternative per: <em>${dish.name}</em></h6>
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
            if (isTwoCol && rootSide) {
              renderRightPanel(rootSide, altsHtml);
              rootSide.querySelectorAll('[data-alt-id]').forEach((btnAlt) => {
                btnAlt.addEventListener('click', () => {
                  const altId = btnAlt.getAttribute('data-alt-id');
                  setChoiceForDish(selections, day, mealType, dish, altId);
                  setSelections(selections);
                  showToast('Alternativa applicata', 'success');
                  renderDay();
                });
              });
            } else {
              const panel = li.querySelector('[data-inline-panel]');
              if (panel) panel.innerHTML = altsHtml;
              li.querySelectorAll('[data-alt-id]').forEach((btnAlt) => {
                btnAlt.addEventListener('click', () => {
                  const altId = btnAlt.getAttribute('data-alt-id');
                  setChoiceForDish(selections, day, mealType, dish, altId);
                  setSelections(selections);
                  showToast('Alternativa applicata', 'success');
                  renderDay(mealType);
                });
              });
            }
          } else if (act === 'note') {
            const html = `
              <h6 class="mb-2">Note</h6>
              <div class="alert alert-info" role="alert">${effDish.notes}</div>
            `;
            if (isTwoCol && rootSide) {
              renderRightPanel(rootSide, html);
            } else {
              const panel = li.querySelector('[data-inline-panel]');
              if (panel) panel.innerHTML = html;
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
      if (shoppingScope === 'week') {
        renderShoppingList(rootSide, collectUsedDishesForWeek(), 'Settimana');
      } else {
        renderShoppingList(rootSide, usedDishes, days[dayIdx]);
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
      if (shoppingScope === 'week') {
        renderShoppingList(rootSide, collectUsedDishesForWeek(), 'Settimana');
      } else {
        const used = collectUsedDishesForDay(days[dayIdx]);
        renderShoppingList(rootSide, used, days[dayIdx]);
      }
    });
    header.querySelector('#btnScopeDay').addEventListener('click', () => {
      shoppingScope = 'day';
      header.querySelector('#btnScopeDay').classList.add('active');
      header.querySelector('#btnScopeWeek').classList.remove('active');
      renderDay();
    });
    header.querySelector('#btnScopeWeek').addEventListener('click', () => {
      shoppingScope = 'week';
      header.querySelector('#btnScopeWeek').classList.add('active');
      header.querySelector('#btnScopeDay').classList.remove('active');
      renderDay();
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

  // Mount
  rootMain.innerHTML = '';
  rootMain.appendChild(header);
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
