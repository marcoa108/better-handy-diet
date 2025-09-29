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
    return { name: x.name, quantity: parts.join(' + ') };
  });
  list.sort((a, b) => a.name.localeCompare(b.name));
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
  const html = list.length
    ? `<ul class="list-group">${list
        .map((i) => `<li class="list-group-item d-flex justify-content-between"><span>${i.name}</span><span class="text-muted">${i.quantity}</span></li>`)
        .join('')}</ul>`
    : '<div class="text-muted">Nessun ingrediente</div>';
  renderRightPanel(
    sideEl,
    `<h5 class="mb-3">Lista spesa (giorno corrente)</h5>${html}`
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
  const days = Object.keys(data);
  let dayIdx = 0;

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

  const mealsContainer = document.createElement('div');

  function updateDayTitle() {
    document.getElementById('dayTitle').textContent = days[dayIdx];
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
            rootSide.querySelectorAll('[data-alt-id]').forEach((btnAlt) => {
              btnAlt.addEventListener('click', () => {
                const altId = btnAlt.getAttribute('data-alt-id');
                setChoiceForDish(selections, day, mealType, dish, altId);
                setSelections(selections);
                showToast('Alternativa applicata', 'success');
                renderDay();
              });
            });
          } else if (act === 'note') {
            const html = `
              <h5 class="mb-3">Note</h5>
              <div class="alert alert-info" role="alert">
                ${effDish.notes}
              </div>
            `;
            renderRightPanel(rootSide, html);
          } else if (act === 'reset') {
            setChoiceForDish(selections, day, mealType, dish, null);
            setSelections(selections);
            showToast('Ripristinato', 'warning');
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
    renderDay();
  });
  header.querySelector('#nextDay').addEventListener('click', () => {
    dayIdx = (dayIdx + 1) % days.length;
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
