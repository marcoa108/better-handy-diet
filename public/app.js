async function loadDiet() {
  const statusEls = Array.from(document.querySelectorAll('#status, #status-a, #status-b'));
  try {
    const res = await fetch('/api/diet');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    // Simple render: list first day and its meals
    const firstDay = Object.keys(data)[0];
    const meals = data[firstDay];

    const blocks = [];
    Object.entries(meals).forEach(([mealType, items]) => {
      const li = items
        .map((d) => `<li><strong>${d.name}</strong> <span class="text-muted">${d.quantityFromName || ''}</span></li>`) 
        .join('');
      blocks.push(`<section class="mb-3"><h3 class="h6">${mealType}</h3><ul>${li}</ul></section>`);
    });

    const html = `<div class="mb-3"><span class="badge bg-primary">${firstDay}</span></div>${blocks.join('')}`;

    const single = document.getElementById('content');
    if (single) single.innerHTML = html;

    const a = document.getElementById('content-a');
    const b = document.getElementById('content-b');
    if (a && b) { a.innerHTML = html; b.innerHTML = html; }

    statusEls.forEach((el) => el && el.remove());
  } catch (err) {
    statusEls.forEach((el) => { if (el) { el.className = 'alert alert-danger'; el.textContent = 'Errore caricamento dati: ' + err.message; } });
  }
}

loadDiet();
