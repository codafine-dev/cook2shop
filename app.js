/**
 * COOK2SHOP — app.js v4.1 (Merged Edition)
 * Logique principale de l'application.
 */

/* ══════════════════════════════════════════════════════
   1. CONFIGURATION
   ══════════════════════════════════════════════════════ */

const AI_CONFIG = {
  chatgpt: { auto: true,  url: (p) => `https://chatgpt.com/?q=${encodeURIComponent(p)}` },
  gemini:  { auto: false, url: ()  => 'https://gemini.google.com/app' },
};

const STORE_CONFIG = {
  carrefour: { 
    name: 'Carrefour', 
    url: 'https://www.carrefour.fr/', 
    useCopy: true 
  },
  leclerc: { 
    name: 'Leclerc', 
    url: (q) => `https://www.leclercrelay.fr/recherche?q=${encodeURIComponent(q)}`, 
    useCopy: false 
  },
  auchan: { 
    name: 'Auchan', 
    url: (q) => `https://www.auchandrive.fr/search?q=${encodeURIComponent(q)}`, 
    useCopy: false 
  },
};

function buildPrompt(input) {
  return `Analyse cette recette (URL ou texte) : ${input}

Réponds UNIQUEMENT avec un objet JSON strict, sans markdown, sans backticks, sans note, sans explication :
{
  "title": "Nom de la recette",
  "servings": 4,
  "prep_time": 10,
  "cook_time": 15,
  "main_cereal": "Blé tendre",
  "ingredients": [
    { "full": "225g de farine de blé", "name": "farine de blé" },
    { "full": "3 oeufs", "name": "oeufs" },
    { "full": "50cl de lait", "name": "lait" }
  ],
  "steps": ["Mélanger la farine et le sucre.", "Ajouter les oeufs un par un."]
}

Règles :
|- servings : nombre entier de personnes
|- prep_time : minutes de préparation (entier)
|- cook_time : minutes de cuisson (entier)
|- main_cereal : céréale principale ou null
|- ingredients : liste d'objets {full: texte complet, name: nom pur sans quantité}
|- steps : liste des étapes de préparation dans l'ordre
|- Si tu ne peux pas accéder à l'URL : {"title":"","ingredients":[],"steps":[]}
|- Aucun autre texte autorisé`;
}

async function logEvent(event, data) {
  console.log(`[Telemetry] ${event}:`, data);
  // TODO: Connecter à un webhook
}

/* ══════════════════════════════════════════════════════
   2. ÉTAT GLOBAL
   ══════════════════════════════════════════════════════ */

let selectedAI = 'chatgpt';
let currentUrl = '';
let selectedStore = 'carrefour';

/* ══════════════════════════════════════════════════════
   3. FLOW PRINCIPAL
   ══════════════════════════════════════════════════════ */

function preparePrompt() {
  const urlInput = document.getElementById('urlInput');
  const btn = document.getElementById('prepareBtn');
  const url = urlInput.value.trim();
  
  if (!url) { showToast("Colle une URL de recette d'abord !"); return; }

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Analyse...';

  setTimeout(() => {
    currentUrl = url;
    logEvent('recipe_prepared', { url: url });

    document.getElementById('promptBox').textContent = buildPrompt(currentUrl);
    document.getElementById('step2').style.display = 'block';
    document.getElementById('step3').style.display = 'block';
    document.getElementById('step2').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    btn.disabled = false;
    btn.textContent = originalText;
  }, 600);
}

function selectAI(ai, el) {
  selectedAI = ai;
  document.querySelectorAll('.ai-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function copyAndOpenAI() {
  const prompt = buildPrompt(currentUrl);
  const config = AI_CONFIG[selectedAI];
  navigator.clipboard.writeText(prompt).catch(() => {});

  if (config.auto) {
    window.open(config.url(prompt), '_blank', 'noopener');
    showToast('Prompt envoyé !');
  } else {
    showToast('✓ Prompt copié — colle avec Ctrl+V dans Gemini');
    setTimeout(() => window.open(config.url(), '_blank', 'noopener'), 600);
  }
}

function copyPromptOnly() {
  navigator.clipboard.writeText(buildPrompt(currentUrl))
    .then(() => showToast('Prompt copié !'))
    .catch(() => showToast('Erreur lors de la copie'));
}

function importJSON() {
  const raw = document.getElementById('jsonInput').value.trim();
  if (!raw) { showToast('Colle la réponse de ton IA'); return; }

  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const data = JSON.parse(clean);

    if (!data.title || !Array.isArray(data.ingredients) || !data.ingredients.length) {
      throw new Error('Structure inattendue');
    }

    saveToLocal({
      title:       data.title,
      servings:    data.servings    || null,
      prep_time:   data.prep_time   || null,
      cook_time:   data.cook_time   || null,
      main_cereal: data.main_cereal || null,
      ingredients: data.ingredients,
      steps:       Array.isArray(data.steps) ? data.steps : [],
      sourceUrl:   currentUrl || null,
    });

    logEvent('ai_imported', { title: data.title, url: currentUrl });
    resetFlow();
    renderRecipes();
    showToast(`"${data.title}" importée !`);
  } catch (e) {
    showToast('JSON invalide — vérifie la réponse de ton IA');
    console.error('[Cook2Shop] Erreur parsing JSON :', e);
  }
}

function resetFlow() {
  currentUrl = '';
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step3').style.display = 'none';
  document.getElementById('urlInput').value = '';
  document.getElementById('jsonInput').value = '';
}

/* ══════════════════════════════════════════════════════
   4. LOCALSTORAGE
   ══════════════════════════════════════════════════════ */

const STORAGE_KEY = 'c2s_recipes';

function getRecipes() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

function saveToLocal(recipe) {
  const list = getRecipes();
  list.unshift({
    ...recipe,
    id: Date.now(),
    date: new Date().toISOString().split('T')[0],
    checkedIngredients: [],
    doneSteps: [],
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function updateChecked(recipeId, checkedIngredients) {
  const list = getRecipes();
  const idx = list.findIndex(r => r.id === recipeId);
  if (idx !== -1) {
    list[idx].checkedIngredients = checkedIngredients;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
}

function updateDoneSteps(recipeId, doneSteps) {
  const list = getRecipes();
  const idx = list.findIndex(r => r.id === recipeId);
  if (idx !== -1) {
    list[idx].doneSteps = doneSteps;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
}

function deleteRecipe(id) {
  const list = getRecipes().filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  renderRecipes();
  showToast('Recette supprimée');
}

/* ══════════════════════════════════════════════════════
   5. RENDU DES RECETTES
   ══════════════════════════════════════════════════════ */


function scaleIngredient(ing, currentServings, targetServings) {
  if (!currentServings || currentServings === targetServings) return ing;
  const ratio = targetServings / currentServings;
  const regex = /^(\\d+(?:[.,]\\d+)?)\\s*([a-zA-Z°%]*)\\s*(?:de\\s|d')?(.+)$/i;
  const match = ing.match(regex);
  if (!match) return ing;
  let value = parseFloat(match[1].replace(',', '.'));
  const unit = match[2];
  const name = match[3];
  const newValue = (value * ratio).toFixed(2).replace(/\\.00$/, '').replace(/\\.0$/, '');
  return `${newValue}${unit} ${name}`.trim();
}
function renderRecipes() {
  const list = getRecipes();
  const filter = document.getElementById('dateFilter').value;
  const container = document.getElementById('recipeContainer');
  container.innerHTML = '';

  const filtered = list.filter(r => !filter || r.date === filter);

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty">
        <span class="empty-icon">🛒</span>
        <div class="empty-title">Bienvenue sur PanierRecette !</div>
        <div class="empty-desc" style="font-size:13px; color:var(--text-dim); margin-top:12px; max-width:300px; margin-left:auto; margin-right:auto; line-height:1.6">
          Transformez vos recettes préférées en listes de courses en 3 étapes simples :<br>
          1️⃣ Collez une URL ou un texte<br>
          2️⃣ Laissez l'IA extraire les ingrédients<br>
          3️⃣ Importez le résultat pour créer votre panier !
        </div>
      </div>`;
    return;
  }

  filtered.forEach(recipe => container.appendChild(buildRecipeCard(recipe)));
}

function buildRecipeCard(recipe) {
  const card = document.createElement('div');
  const isNew = Date.now() - recipe.id < 600000;
  card.className = 'recipe-card' + (isNew ? ' recipe-card-new' : '');

  const checkedSet = new Set(recipe.checkedIngredients || []);
  const doneSet    = new Set(recipe.doneSteps || []);
  const totalIng   = recipe.ingredients.length;
  const totalSteps = (recipe.steps || []).length;

  let activeStep = null;

  function getMetaText() {
    const parts = [];
    if (checkedSet.size > 0) parts.push(`${checkedSet.size}/${totalIng} courses`);
    if (doneSet.size > 0)    parts.push(`${doneSet.size}/${totalSteps} étapes`);
    return parts.join(' · ') || `${totalIng} ingr.`;
  }

  const header = document.createElement('div');
  header.className = 'recipe-card-header';
  header.innerHTML = `
    <div class="recipe-card-title">${recipe.title}</div>
    <div class="recipe-card-meta">${getMetaText()}</div>
    <div style="display:flex;gap:6px;align-items:center">
      <button class="delete-btn" title="Supprimer">✕</button>
      <span class="recipe-card-chevron">▾</span>
    </div>
  `;

  if (isNew) {
    const badge = document.createElement('span');
    badge.className = 'new-badge';
    badge.textContent = 'New';
    header.querySelector('.recipe-card-title').appendChild(badge);
  }

  header.addEventListener('click', () => card.classList.toggle('open'));
  header.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteRecipe(recipe.id);
  });

  const body = document.createElement('div');
  body.className = 'recipe-card-body';

  const tabs = document.createElement('div');
  tabs.className = 'recipe-tabs';

  const tabNames = [
    { key: 'fiche',   label: 'Fiche' },
    { key: 'courses', label: `Courses (${totalIng})` },
    { key: 'etapes',  label: `Étapes (${totalSteps})` },
  ];

  tabNames.forEach(({ key, label }, i) => {
    const btn = document.createElement('button');
    btn.className = 'recipe-tab' + (i === 0 ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      body.querySelectorAll('.recipe-tab').forEach(t => t.classList.remove('active'));
      body.querySelectorAll('.recipe-tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      body.querySelector(`#tab-${key}-${recipe.id}`).classList.add('active');
    });
    tabs.appendChild(btn);
  });

  const tabFiche = document.createElement('div');
  tabFiche.className = 'recipe-tab-content active';
  tabFiche.id = `tab-fiche-${recipe.id}`;

  const ficheGrid = document.createElement('div');
  ficheGrid.className = 'fiche-grid';

  const colLeft = document.createElement('div');
  colLeft.className = 'fiche-col';
  colLeft.innerHTML = `<div class="fiche-col-title">Caractéristiques</div>`;

  const caracRows = [
    { label: 'Nombre de personnes', value: recipe.servings    ? `${recipe.servings} personnes` : null },
    { label: 'Temps de préparation', value: recipe.prep_time  ? `${recipe.prep_time} mn`        : null },
    { label: 'Temps de cuisson',     value: recipe.cook_time  ? `${recipe.cook_time} mn`         : null },
    { label: 'Céréale principale',   value: recipe.main_cereal || null },
  ];

  let localServings = recipe.servings || 4;

  function updateServingsUI(val) {
    localServings = parseInt(val) || 1;
    const preview = colRight.querySelector('.fiche-ing-list');
    if (preview) {
      preview.innerHTML = recipe.ingredients.map(i => {
        const text = typeof i === 'string' ? i : i.full;
        return `› ${scaleIngredient(text, recipe.servings, localServings)}`;
      }).join('<br>');
    }
    const coursesTab = body.querySelector(`#tab-courses-${recipe.id} .ing-list`);
    if (coursesTab) {
      coursesTab.innerHTML = '';
      recipe.ingredients.forEach(ing => {
        const fullText = typeof ing === 'string' ? ing : ing.full;
        const scaled = scaleIngredient(fullText, recipe.servings, localServings);
        const isDone = checkedSet.has(fullText);
        const row = document.createElement('div');
        row.className = `ingredient-row${isDone ? ' done' : ''}`;
        row.innerHTML = `
          <button class="ing-btn" data-rid="${recipe.id}" data-ing="${encodeURIComponent(fullText)}">
            <span class="ing-chevron">${isDone ? '✓' : '›'}</span>
            <span class="ing-name">${scaled}</span>
          </button>
          <button class="store-btn" data-ing="${encodeURIComponent(typeof ing === 'string' ? ing : ing.name)}">→ ${STORE_CONFIG[selectedStore].name}</button>
        `;
        row.querySelector('.ing-btn').addEventListener('click', function () {
          const ingredient = decodeURIComponent(this.dataset.ing);
          const rid = parseInt(this.dataset.rid, 10);
          if (checkedSet.has(ingredient)) checkedSet.delete(ingredient);
          else checkedSet.add(ingredient);
          updateChecked(rid, [...checkedSet]);
          const done = checkedSet.has(ingredient);
          row.classList.toggle('done', done);
          row.querySelector('.ing-chevron').textContent = done ? '✓' : '›';
          header.querySelector('.recipe-card-meta').textContent = getMetaText();
        });
        row.querySelector('.store-btn').addEventListener('click', function () {
          openStore(decodeURIComponent(this.dataset.ing));
        });
        coursesTab.appendChild(row);
      });
    }
  }

  caracRows.forEach(({ label, value }) => {
    if (!value) return;
    const row = document.createElement('div');
    row.className = 'fiche-row';
    if (label === 'Nombre de personnes') {
      row.innerHTML = `
        <span class="fiche-label">${label}</span>
        <div style="display:flex; align-items:center; gap:4px">
          <input type="number" class="servings-input" value="${localServings}" min="1" style="width:40px; text-align:center; border:1px solid #ccc; border-radius:4px; font-family:var(--font-mono); font-size:12px">
          <span style="font-size:11px; color:var(--text-muted)">pers.</span>
        </div>`;
      row.querySelector('.servings-input').addEventListener('change', (e) => updateServingsUI(e.target.value));
    } else {
      row.innerHTML = `<span class="fiche-label">${label}</span><span class="fiche-value">${value}</span>`;
    }
    colLeft.appendChild(row);
  });

  const colRight = document.createElement('div');
  colRight.className = 'fiche-col';
  colRight.innerHTML = `<div class=\"fiche-col-title\">Ingrédients</div>`;

  const ingPreview = document.createElement('div');
  ingPreview.className = 'fiche-ing-list';
  ingPreview.innerHTML = recipe.ingredients.map(i => {
    const text = typeof i === 'string' ? i : i.full;
    return `› ${text}`;
  }).join('<br>');
  colRight.appendChild(ingPreview);

  ficheGrid.appendChild(colLeft);
  ficheGrid.appendChild(colRight);
  tabFiche.appendChild(ficheGrid);

  const tabCourses = document.createElement('div');
  tabCourses.className = 'recipe-tab-content';
  tabCourses.id = `tab-courses-${recipe.id}`;

  const actionRow = document.createElement('div');
  actionRow.className = 'btn-row';
  actionRow.style.marginBottom = '16px';

  const copyUrlBtn = document.createElement('button');
  copyUrlBtn.className = 'btn btn-outline btn-sm';
  copyUrlBtn.textContent = 'Copier l\'URL Carrefour';
  copyUrlBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyText('https://www.carrefour.fr/', 'URL copiée ! Collez-la dans votre navigateur 🌐');
  });

  const copyAllBtn = document.createElement('button');
  copyAllBtn.className = 'btn btn-accent btn-sm';
  copyAllBtn.textContent = 'Copier la liste pour Hopla';
  copyAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyAllForHopla(recipe);
  });

  actionRow.appendChild(copyUrlBtn);
  actionRow.appendChild(copyAllBtn);
  tabCourses.appendChild(actionRow);

  const storeChips = document.createElement('div');
  storeChips.className = 'ai-chips'; // Reuse AI chips styling
  Object.entries(STORE_CONFIG).forEach(([id, config]) => {
    const chip = document.createElement('button');
    chip.className = 'ai-chip' + (selectedStore === id ? ' active' : '');
    chip.textContent = config.name;
    chip.addEventListener('click', (e) => selectStore(id, e.target));
    storeChips.appendChild(chip);
  });
  tabCourses.appendChild(storeChips);

  const ingList = document.createElement('div');
  ingList.className = 'ing-list';

  recipe.ingredients.forEach(ing => {
    const fullText = typeof ing === 'string' ? ing : ing.full;
    const nameText = typeof ing === 'string' ? ing : ing.name;
    const isDone = checkedSet.has(fullText);
    const row = document.createElement('div');
    row.className = `ingredient-row${isDone ? ' done' : ''}`;

    row.innerHTML = `
      <button class="ing-btn" data-rid="${recipe.id}" data-ing="${encodeURIComponent(fullText)}">
        <span class="ing-chevron">${isDone ? '✓' : '›'}</span>
        <span class="ing-name">${fullText}</span>
      </button>
      <button class="store-btn" data-ing="${encodeURIComponent(nameText)}">→ ${STORE_CONFIG[selectedStore].name}</button>
    `;

    row.querySelector('.ing-btn').addEventListener('click', function () {
      const ingredient = decodeURIComponent(this.dataset.ing);
      const rid = parseInt(this.dataset.rid, 10);

      if (checkedSet.has(ingredient)) checkedSet.delete(ingredient);
      else checkedSet.add(ingredient);

      updateChecked(rid, [...checkedSet]);

      const done = checkedSet.has(ingredient);
      row.classList.toggle('done', done);
      row.querySelector('.ing-chevron').textContent = done ? '✓' : '›';
      header.querySelector('.recipe-card-meta').textContent = getMetaText();
    });

    row.querySelector('.store-btn').addEventListener('click', function () {
      openStore(decodeURIComponent(this.dataset.ing));
    });

    ingList.appendChild(row);
  });

  tabCourses.appendChild(ingList);

  const tabEtapes = document.createElement('div');
  tabEtapes.className = 'recipe-tab-content';
  tabEtapes.id = `tab-etapes-${recipe.id}`;

  if (!recipe.steps || !recipe.steps.length) {
    tabEtapes.innerHTML = `<div style="padding:20px 16px;font-size:13px;color:var(--text-muted)">Aucune étape disponible pour cette recette.</div>`;
  } else {
    const hint = document.createElement('div');
    hint.className = 'steps-hint';
    hint.textContent = '1er clic : surligner · 2e clic : marquer comme fait · 3e clic : reset';

    const stepsList = document.createElement('div');
    stepsList.className = 'steps-list';

    recipe.steps.forEach((stepText, idx) => {
      const row = document.createElement('div');

      function getRowClass() {
        if (doneSet.has(idx))    return 'step-row done';
        if (activeStep === idx)  return 'step-row active';
        return 'step-row';
      }

      function renderRow() {
        row.className = getRowClass();
        row.innerHTML = `
          <div class="step-circle">${doneSet.has(idx) ? '✓' : idx + 1}</div>
          <div class="step-text">${stepText}</div>
        `;
      }

      renderRow();

      row.addEventListener('click', () => {
        if (activeStep === idx && !doneSet.has(idx)) {
          doneSet.add(idx);
          activeStep = null;
        } else if (doneSet.has(idx)) {
          doneSet.delete(idx);
          activeStep = null;
        } else {
          activeStep = idx;
          stepsList.querySelectorAll('.step-row').forEach(r => {
            if (r !== row) r.className = doneSet.has(parseInt(r.dataset.idx)) ? 'step-row done' : 'step-row';
          });
        }

        updateDoneSteps(recipe.id, [...doneSet]);
        renderRow();
        header.querySelector('.recipe-card-meta').textContent = getMetaText();
      });

      row.dataset.idx = idx;
      stepsList.appendChild(row);
    });

    tabEtapes.appendChild(hint);
    tabEtapes.appendChild(stepsList);
  }

  body.appendChild(tabs);
  body.appendChild(tabFiche);
  body.appendChild(tabCourses);
  body.appendChild(tabEtapes);

  card.appendChild(header);
  card.appendChild(body);

  return card;
}

/* ══════════════════════════════════════════════════════
   6. INITIALISATION & HELPERS
   ══════════════════════════════════════════════════════ */

function openStore(query) {
  const store = STORE_CONFIG[selectedStore];
  if (!store) return;

  if (store.useCopy) {
    const prompt = `Bonjour Hopla, peux-tu ajouter ceci à mon panier s'il te plaît ?\\n\\n- ${query}`;
    navigator.clipboard.writeText(prompt).then(() => {
      showToast(`📋 Copié ! Collez ceci dans Hopla 🛒`);
      window.open(store.url, '_blank', 'noopener');
    }).catch(() => {
      showToast('Erreur de copie');
      window.open(store.url, '_blank', 'noopener');
    });
  } else {
    const url = typeof store.url === 'function' ? store.url(query) : store.url;
    window.open(url, '_blank', 'noopener');
  }
}

function copyText(text, toastMsg) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(toastMsg);
  }).catch(() => {
    showToast('Erreur de copie');
  });
}

function selectStore(store, el) {
  selectedStore = store;
  document.querySelectorAll('.store-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  
  // Update all current buttons in the DOM to reflect new store
  document.querySelectorAll('.store-btn').forEach(btn => {
    const storeName = STORE_CONFIG[selectedStore].name;
    btn.textContent = `→ ${storeName}`;
  });
}

function copyAllForHopla(recipe) {
  const list = recipe.ingredients.map(i => {
    const text = typeof i === 'string' ? i : i.full;
    return `- ${text}`;
  }).join('\\n');

  const prompt = `Bonjour Hopla, peux-tu ajouter ces ingrédients à mon panier s'il te plaît ?\\n\\n${list}`;
  
  copyText(prompt, '📋 Liste copiée ! Collez-la dans Hopla pour ajouter au panier 🛒');
}

function showToast(msg) {
  console.log(`[Toast] ${msg}`);
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  // Main Flow
  document.getElementById('prepareBtn').addEventListener('click', preparePrompt);
  document.getElementById('copyOpenBtn').addEventListener('click', copyAndOpenAI);
  document.getElementById('copyOnlyBtn').addEventListener('click', copyPromptOnly);
  document.getElementById('importBtn').addEventListener('click', importJSON);
  document.getElementById('resetBtn').addEventListener('click', resetFlow);

  // AI Chips
  document.querySelectorAll('.ai-chip').forEach(chip => {
    chip.addEventListener('click', (e) => selectAI(e.target.dataset.ai, e.target));
  });

  // Filters
  const dateFilter = document.getElementById('dateFilter');
  dateFilter.addEventListener('change', renderRecipes);
  document.getElementById('clearFilterBtn').addEventListener('click', () => {
    dateFilter.value = '';
    renderRecipes();
  });

  // Initial Render
  renderRecipes();
});
