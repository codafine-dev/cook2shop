/**
 * COOK2SHOP — app.js v4.1 (Merged Edition)
 * Logique principale de l'application.
 *
 * Architecture :
 *   1. Configuration (URLs des IAs, template du prompt)
 *   2. État global (variables partagées entre fonctions)
 *   3. Flow principal (étapes 1 → 2 → 3)
 *   4. Gestion du localStorage (sauvegarde / lecture)
 *   5. Rendu des recettes (HTML dynamique)
 *   6. Actions sur les ingrédients (cocher, ouvrir Carrefour)
 *   7. Utilitaires (toast, escape, etc.)
 *   8. Initialisation (DOMContentLoaded)
 */

/* ══════════════════════════════════════════════════════
   1. CONFIGURATION
   ══════════════════════════════════════════════════════ */

/**
 * IAs supportées.
 * chatgpt : ?q= pré-remplit le champ automatiquement.
 * gemini  : pas de ?q=, on copie dans le presse-papier + message.
 */
const AI_CONFIG = {
  chatgpt: { auto: true,  url: (p) => `https://chatgpt.com/?q=${encodeURIComponent(p)}` },
  gemini:  { auto: false, url: ()  => 'https://gemini.google.com/app' },
};

/**
 * Prompt enrichi v4 :
 * Demande tous les champs nécessaires pour la fiche et les étapes.
 */
function buildPrompt(url) {
  return `Analyse cette recette : ${url}\n\nRéponds UNIQUEMENT avec un objet JSON strict, sans markdown, sans backticks, sans note, sans explication :\n{\n  \"title\": \"Nom de la recette\",\n  \"servings\": 4,\n  \"prep_time\": 10,\n  \"cook_time\": 15,\n  \"main_cereal\": \"Blé tendre\",\n  \"ingredients\": [\"225g de farine de blé\", \"3 oeufs\", \"50cl de lait\"],\n  \"steps\": [\"Mélanger la farine et le sucre.\", \"Ajouter les oeufs un par un.\"]\n}\n\nRègles :\n- servings : nombre entier de personnes\n- prep_time : minutes de préparation (entier)\n- cook_time : minutes de cuisson (entier)\n- main_cereal : céréale principale ou null\n- ingredients : liste de chaînes avec quantité + unité\n- steps : liste des étapes de préparation dans l'ordre\n- Si tu ne peux pas accéder à l'URL : {\"title\":\"\",\"ingredients\":[],\"steps\":[]}\n- Aucun autre texte autorisé`;
}

/**
 * Envoie un événement de télémétrie vers un endpoint distant.
 * Actuellement en mode 'simulé' (console), prêt à être connecté à un webhook ou API.
 */
async function logEvent(event, data) {
  console.log(`[Telemetry] ${event}:`, data);
  // TODO: Connecter à un webhook (Make.com, Supabase, etc.)
}


/* ══════════════════════════════════════════════════════
   2. ÉTAT GLOBAL
   ══════════════════════════════════════════════════════ */

let selectedAI = 'chatgpt';
let currentUrl = '';


/* ══════════════════════════════════════════════════════
   3. FLOW PRINCIPAL
   ══════════════════════════════════════════════════════ */

function preparePrompt() {
  const urlInput = document.getElementById('urlInput');
  const btn = document.getElementById('prepareBtn');
  const url = urlInput.value.trim();
  
  if (!url) { showToast("Colle une URL de recette d'abord !"); return; }

  // --- UX Update: Simulation de traitement ---
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Analyse...';

  setTimeout(() => {
    currentUrl = url;
    
    // Télémétrie
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
    showToast(`\"${data.title}\" importée !`);

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

function renderRecipes() {
  const list = getRecipes();
  const filter = document.getElementById('dateFilter').value;
  const container = document.getElementById('recipeContainer');
  container.innerHTML = '';

  const filtered = list.filter(r => !filter || r.date === filter);

  if (!filtered.length) {
    container.innerHTML = `\\n      <div class=\\\"empty\\\">\\n        <span class=\\\"empty-icon\\\">🛒</span>\\n        <div class=\\\"empty-title\\\">Aucune recette importée</div>\\n      </div>`;
    return;
  }

  filtered.forEach(recipe => container.appendChild(buildRecipeCard(recipe)));
}

function buildRecipeCard(recipe) {
  const card = document.createElement('div');
  card.className = 'recipe-card';

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
  header.innerHTML = `\\n    <div class=\\\"recipe-card-title\\\">${recipe.title}</div>\\n    <div class=\\\"recipe-card-meta\\\">${getMetaText()}</div>\\n    <div style=\\\"display:flex;gap:6px;align-items:center\\\">\\n      <button class=\\\"delete-btn\\\" title=\\\"Supprimer\\\">✕</button>\\n      <span class=\\\"recipe-card-chevron\\\">▾</span>\\n    </div>\\n  `;

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
  colLeft.innerHTML = `<div class=\\\"fiche-col-title\\\">Caractéristiques</div>`;

  const caracRows = [
    { label: 'Nombre de personnes', value: recipe.servings    ? `${recipe.servings} personnes` : null },
    { label: 'Temps de préparation', value: recipe.prep_time  ? `${recipe.prep_time} mn`        : null },
    { label: 'Temps de cuisson',     value: recipe.cook_time  ? `${recipe.cook_time} mn`         : null },
    { label: 'Céréale principale',   value: recipe.main_cereal || null },
  ];

  caracRows.forEach(({ label, value }) => {
    if (!value) return;
    const row = document.createElement('div');
    row.className = 'fiche-row';
    row.innerHTML = `<span class=\\\"fiche-label\\\">${label}</span><span class=\"fiche-value\">${value}</span>`;
    colLeft.appendChild(row);
  });

  const colRight = document.createElement('div');
  colRight.className = 'fiche-col';
  colRight.innerHTML = `<div class=\\\"fiche-col-title\\\">Ingrédients</div>`;

  const ingPreview = document.createElement('div');
  ingPreview.className = 'fiche-ing-list';
  ingPreview.innerHTML = recipe.ingredients.map(i => `› ${i}`).join('<br>');
  colRight.appendChild(ingPreview);

  ficheGrid.appendChild(colLeft);
  ficheGrid.appendChild(colRight);
  tabFiche.appendChild(ficheGrid);

  const tabCourses = document.createElement('div');
  tabCourses.className = 'recipe-tab-content';
  tabCourses.id = `tab-courses-${recipe.id}`;

  const ingList = document.createElement('div');
  ingList.className = 'ing-list';

  recipe.ingredients.forEach(ing => {
    const isDone = checkedSet.has(ing);
    const row = document.createElement('div');
    row.className = `ingredient-row${isDone ? ' done' : ''}`;

    row.innerHTML = `\\n      <button class=\\\"ing-btn\\\" data-rid=\\\"${recipe.id}\\\" data-ing=\\\"${encodeURIComponent(ing)}\\\">\\n        <span class=\\\"ing-chevron\\\">${isDone ? '✓' : '›'}</span>\\n        <span class=\"ing-name\">${ing}</span>\\n      </button>\\n      <button class=\\\"carrefour-btn\\\" data-ing=\\\"${encodeURIComponent(ing)}\\\">→ Carrefour</button>\\n    `;

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

    row.querySelector('.carrefour-btn').addEventListener('click', function () {
      openCarrefour(decodeURIComponent(this.dataset.ing));
    });

    ingList.appendChild(row);
  });

  tabCourses.appendChild(ingList);

  const tabEtapes = document.createElement('div');
  tabEtapes.className = 'recipe-tab-content';
  tabEtapes.id = `tab-etapes-${recipe.id}`;

  if (!recipe.steps || !recipe.steps.length) {
    tabEtapes.innerHTML = `<div style=\\\"padding:20px 16px;font-size:13px;color:var(--text-muted)\\\">Aucune étape disponible pour cette recette.</div>`;
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
        row.innerHTML = `\\n          <div class=\\\"step-circle\\\">${doneSet.has(idx) ? '✓' : idx + 1}</div>\\n          <div class=\\\"step-text\\\">${stepText}</div>\\n        `;
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

function clearDateFilter() {
  document.getElementById('dateFilter').value = '';
  renderRecipes();
}


/* ══════════════════════════════════════════════════════
   6. ACTIONS
   ══════════════════════════════════════════════════════ */

function openCarrefour(ingredient) {
  // Nettoyage amélioré : retire quantités, unités, et mots de liaison
  const cleaned = ingredient
    .replace(/^\\d+[\\d,.]*\\s*(g|kg|ml|l|cl|dl|cs|cc|tsp|tbsp|litre[s]?)?\\s*(de\\s|d')?/i, '')
    .replace(/\\s*(et\\s|avec\\s|ou\\s)/i, ' ')
    .trim();
  const query = cleaned || ingredient;

  navigator.clipboard.writeText(query).catch(() => {});
  window.open(`https://www.carrefour.fr/s?q=${encodeURIComponent(query)}`, '_blank', 'noopener');
  showToast(`→ Carrefour : \\\"${query}\\\"`);
}


/* ══════════════════════════════════════════════════════
   7. UTILITAIRES
   ══════════════════════════════════════════════════════ */

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

function escapeStr(str) {
  return str.replace(/'/g, \"\\\\'\").replace(/\"/g, '&quot;');
}


/* ══════════════════════════════════════════════════════
   8. INITIALISATION
   ══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  renderRecipes();

  // Listeners statiques
  document.getElementById('prepareBtn').addEventListener('click', preparePrompt);
  document.getElementById('copyOpenBtn').addEventListener('click', copyAndOpenAI);
  document.getElementById('copyOnlyBtn').addEventListener('click', copyPromptOnly);
  document.getElementById('importBtn').addEventListener('click', importJSON);
  document.getElementById('resetBtn').addEventListener('click', resetFlow);
  document.getElementById('clearFilterBtn').addEventListener('click', clearDateFilter);
  document.getElementById('dateFilter').addEventListener('change', renderRecipes);

  document.getElementById('urlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') preparePrompt();
  });

  // Chips IA
  document.querySelectorAll('.ai-chip').forEach(chip => {
    chip.addEventListener('click', function () { selectAI(this.dataset.ai, this); });
  });

  // Web Share Target mobile
  const params = new URLSearchParams(window.location.search);
  const sharedUrl = params.get('url') || params.get('text');
  if (sharedUrl && sharedUrl.includes('http')) {
    document.getElementById('urlInput').value = sharedUrl;
    window.history.replaceState({}, document.title, '/');
    preparePrompt();
  }
});
