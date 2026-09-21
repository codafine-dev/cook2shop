/**
 * COOK2SHOP — app.js v4.1 (Merged Edition)
 * Logique principale de l'application.
 */

/* ══════════════════════════════════════════════════════
   1. CONFIGURATION
   ══════════════════════════════════════════════════════ */

const AI_CONFIG = {
  chatgpt: { auto: true,  url: (p) => `https://chatgpt.com/?q=${encodeURIComponent(p)}` },
  gemini:  { auto: true,  url: (p) => `https://gemini.google.com/app?q=${encodeURIComponent(p)}` },
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

const DEFAULT_RECIPES = [
  {
    title: "Madeleines au Sucre Roux",
    servings: 3,
    prep_time: 20,
    cook_time: 9,
    main_cereal: null,
    tags: ["sans cadmium", "gluten free", "sucré reduit"],
    ingredients: [
      { "full": "90 g de farine de pois chiches", "name": "farine de pois chiches" },
      { "full": "20 g de farine de coco", "name": "farine de coco" },
      { "full": "10 g de fécule de tapioca", "name": "fécule de tapioca" },
      { "full": "25 g de sucre roux", "name": "sucre roux" },
      { "full": "2 œufs", "name": "œufs" },
      { "full": "100 g de beurre fondu", "name": "beurre fondu" },
      { "full": "50 g de lait entier", "name": "lait entier" },
      { "full": "5 g de levure chimique", "name": "levure chimique" }
    ],
    steps: [
      "Fouetter vigoureusement les œufs et le sucre roux jusqu'à ce que le mélange double de volume.",
      "Tamiser ensemble la farine de pois chiches, la farine de coco, la fécule de tapioca et la levure chimique.",
      "Ajouter les ingrédients secs au mélange d'œufs en alternant avec le lait, puis incorporer le beurre fondu tiède.",
      "Laisser reposer la pâte au réfrigérateur pendant au moins 2 heures.",
      "Préchauffer le four à 210°C, remplir les moules aux trois quarts, cuire 4 minutes puis baisser à 180°C et poursuivre la cuisson 4 à 5 minutes."
    ]
  }
];

function buildPrompt(input) {
  return `Analyse cette recette (URL ou texte) : ${input}

Réponds UNIQUEMENT avec un objet JSON strict, sans markdown, sans backticks, sans note, sans explication :
{
  "title": "Nom de la recette",
  "servings": 4,
  "prep_time": 10,
  "cook_time": 15,
  "main_cereal": "Blé tendre",
  "tags": ["tag1", "tag2"],
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

const TELEMETRY_CONFIG = {
  endpoint: '/api/log',
};

async function logEvent(event, data) {
  console.log(`[Telemetry] ${event}:`, data);
  try {
    await fetch(TELEMETRY_CONFIG.endpoint, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data }),
      keepalive: true,
    });
  } catch (e) {
    console.error('[Telemetry] Error sending event:', e);
  }
}

/* ══════════════════════════════════════════════════════
   2. ÉTAT GLOBAL
   ══════════════════════════════════════════════════════ */

let selectedAI = 'chatgpt';
let currentUrl = '';
let selectedStore = 'carrefour';
let shoppingMode = false;
const shoppingSelection = new Map();
const excludedCombinedIngredients = new Set();

/* ══════════════════════════════════════════════════════
   3. FLOW PRINCIPAL
   ══════════════════════════════════════════════════════ */

// share.google / search.app sont des liens raccourcis générés par Chrome/
// l'app Google quand on partage depuis un résultat de recherche ou le fil
// Discover, plutôt que depuis la page de la recette elle-même. Google bloque
// activement toute tentative de résoudre ces liens côté serveur (403,
// détection anti-bot) — impossible à contourner proprement. La seule vraie
// solution : ouvrir la recette sur le site d'origine et utiliser SON bouton
// "Partager" à elle, qui donne l'URL réelle directement.
function isGoogleShortLink(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'share.google' || hostname === 'search.app';
  } catch {
    return false;
  }
}

function showShortLinkWarning(show) {
  const warning = document.getElementById('shortLinkWarning');
  if (warning) warning.style.display = show ? 'block' : 'none';
}

async function preparePrompt() {
  const urlInput = document.getElementById('urlInput');
  const btn = document.getElementById('prepareBtn');
  let url = urlInput.value.trim();
  
  if (!url) { showToast("Colle une URL de recette d'abord !"); return; }

  if (isGoogleShortLink(url)) {
    showShortLinkWarning(true);
    return;
  }
  showShortLinkWarning(false);
  
  btn.classList.remove('btn-accent');
  btn.classList.add('btn-success');
  
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
      tags:        Array.isArray(data.tags) ? data.tags : [],
      ingredients: data.ingredients,
      steps:       Array.isArray(data.steps) ? data.steps : [],
      sourceUrl:   currentUrl || null,
    });

    logEvent('ai_imported', { recipe: data, url: currentUrl });
    resetFlow();
    renderRecipes();
    const importPanel = document.getElementById('importPanel');
    const addRecipeBtn = document.getElementById('addRecipeBtn');
    importPanel.hidden = true;
    addRecipeBtn.setAttribute('aria-expanded', 'false');
    document.getElementById('recipesTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function getStoredRecipes() {
  let stored;

  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    stored = [];
  }

  if (!Array.isArray(stored)) stored = [];

  // Older versions accidentally persisted the built-in demo recipe whenever
  // a recipe was imported or updated. These copies have neither an id nor a date.
  const cleaned = stored.filter(recipe => !(
    recipe &&
    recipe.title === DEFAULT_RECIPES[0].title &&
    recipe.id == null &&
    recipe.date == null
  ));

  if (cleaned.length !== stored.length) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  }

  return cleaned;
}

function getRecipes() {
  return [...DEFAULT_RECIPES, ...getStoredRecipes()];
}

function saveToLocal(recipe) {
  const list = getStoredRecipes();
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
  const list = getStoredRecipes();
  const idx = list.findIndex(r => r.id === recipeId);
  if (idx !== -1) {
    list[idx].checkedIngredients = checkedIngredients;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
}

function updateDoneSteps(recipeId, doneSteps) {
  const list = getStoredRecipes();
  const idx = list.findIndex(r => r.id === recipeId);
  if (idx !== -1) {
    list[idx].doneSteps = doneSteps;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
}

function deleteRecipe(id) {
  const list = getStoredRecipes().filter(r => r.id !== id);
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
  const regex = /^(\d+(?:[.,]\d+)?)\s*([a-zA-ZÀ-ÿ°%]*)\s*(?:de\s|d')?(.+)$/i;
  const match = ing.match(regex);
  if (!match) return ing;
  let value = parseFloat(match[1].replace(',', '.'));
  const unit = match[2];
  const name = match[3];
  const newValue = (value * ratio).toFixed(2).replace(/\.00$/, '').replace(/\.0$/, '');
  return `${newValue}${unit} ${name}`.trim();
}

function getRecipeSelectionKey(recipe) {
  return String(recipe.id || `demo:${recipe.title}`);
}

function formatQuantity(value) {
  return Number(value.toFixed(2)).toString().replace('.', ',');
}

function getCombinedIngredients() {
  const combined = new Map();
  const knownUnits = new Set(['g', 'kg', 'mg', 'ml', 'cl', 'l']);

  shoppingSelection.forEach(({ recipe, servings }) => {
    const ratio = recipe.servings ? servings / recipe.servings : 1;
    recipe.ingredients.forEach((ingredient) => {
      const full = typeof ingredient === 'string' ? ingredient : ingredient.full;
      const explicitName = typeof ingredient === 'string' ? null : ingredient.name;
      const amountMatch = full.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/i);

      if (!amountMatch) {
        const text = scaleIngredient(full, recipe.servings, servings);
        const key = `text:${text.toLocaleLowerCase('fr')}`;
        if (!combined.has(key)) combined.set(key, { key, text });
        return;
      }

      const amount = parseFloat(amountMatch[1].replace(',', '.')) * ratio;
      let remainder = amountMatch[2].trim();
      let unit = '';
      let name = explicitName ? explicitName.trim() : '';

      if (name) {
        const lowerRemainder = remainder.toLocaleLowerCase('fr');
        const lowerName = name.toLocaleLowerCase('fr');
        const nameIndex = lowerRemainder.lastIndexOf(lowerName);
        if (nameIndex !== -1) {
          unit = remainder.slice(0, nameIndex).trim().replace(/\s+de$/i, '').replace(/^(?:de\s+|d')/i, '').trim();
        }
      } else {
        const parts = remainder.split(/\s+/);
        if (knownUnits.has((parts[0] || '').toLocaleLowerCase('fr'))) unit = parts.shift();
        if (parts[0] && /^(?:de|d')$/i.test(parts[0])) parts.shift();
        name = parts.join(' ') || remainder;
      }

      const normalizedName = name.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const normalizedUnit = unit.toLocaleLowerCase('fr').replace(/\s+/g, '');
      const key = `quantity:${normalizedName}:${normalizedUnit}`;
      const existing = combined.get(key);
      if (existing) existing.amount += amount;
      else combined.set(key, { key, amount, unit, name });
    });
  });

  return [...combined.values()].map((item) => ({
    ...item,
    text: item.text || `${formatQuantity(item.amount)}${item.unit ? ` ${item.unit}` : ''} ${item.name}`.trim(),
  }));
}

function updateShoppingBar() {
  const bar = document.getElementById('shoppingBar');
  const count = document.getElementById('shoppingBarCount');
  const reviewBtn = document.getElementById('reviewShoppingBtn');
  if (!bar) return;

  bar.hidden = !shoppingMode;
  const recipeCount = shoppingSelection.size;
  const ingredientCount = getCombinedIngredients().length;
  count.textContent = recipeCount
    ? `${recipeCount} recette${recipeCount > 1 ? 's' : ''} · ${ingredientCount} ingrédient${ingredientCount > 1 ? 's' : ''}`
    : 'Choisis au moins une recette';
  reviewBtn.disabled = recipeCount === 0;
}

function toggleRecipeForShopping(recipe) {
  const key = getRecipeSelectionKey(recipe);
  if (shoppingSelection.has(key)) shoppingSelection.delete(key);
  else shoppingSelection.set(key, { recipe, servings: recipe.servings || 4 });
  excludedCombinedIngredients.clear();
  renderRecipes();
  updateShoppingBar();
}

function changeShoppingServings(key, delta) {
  const selected = shoppingSelection.get(key);
  if (!selected) return;
  selected.servings = Math.max(1, selected.servings + delta);
  excludedCombinedIngredients.clear();
  renderRecipes();
  updateShoppingBar();
}

function setShoppingMode(enabled) {
  shoppingMode = enabled;
  const modeBtn = document.getElementById('shoppingModeBtn');
  const review = document.getElementById('shoppingReview');
  const container = document.getElementById('recipeContainer');
  const section = document.querySelector('.recipes-section');

  modeBtn.setAttribute('aria-pressed', String(enabled));
  modeBtn.textContent = enabled ? 'Quitter le mode courses' : 'Préparer mes courses';
  review.hidden = true;
  container.hidden = false;
  section.classList.remove('showing-shopping-review');

  if (!enabled) {
    shoppingSelection.clear();
    excludedCombinedIngredients.clear();
  }
  renderRecipes();
  updateShoppingBar();
}

function renderShoppingReview() {
  const items = getCombinedIngredients();
  const list = document.getElementById('combinedList');
  const summary = document.getElementById('shoppingRecipeSummary');
  const selected = [...shoppingSelection.values()];

  summary.textContent = selected
    .map(({ recipe, servings }) => `${recipe.title} · ${servings} pers.`)
    .join('  ·  ');
  list.innerHTML = '';

  items.forEach((item) => {
    const label = document.createElement('label');
    label.className = 'combined-item';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !excludedCombinedIngredients.has(item.key);
    input.addEventListener('change', () => {
      if (input.checked) excludedCombinedIngredients.delete(item.key);
      else excludedCombinedIngredients.add(item.key);
    });
    const text = document.createElement('span');
    text.textContent = item.text;
    label.append(input, text);
    list.appendChild(label);
  });
}

function openShoppingReview() {
  if (!shoppingSelection.size) return;
  renderShoppingReview();
  document.getElementById('recipeContainer').hidden = true;
  document.getElementById('shoppingReview').hidden = false;
  document.getElementById('shoppingBar').hidden = true;
  document.querySelector('.recipes-section').classList.add('showing-shopping-review');
  document.getElementById('shoppingReviewTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function editShoppingSelection() {
  document.getElementById('shoppingReview').hidden = true;
  document.getElementById('recipeContainer').hidden = false;
  document.querySelector('.recipes-section').classList.remove('showing-shopping-review');
  updateShoppingBar();
  document.getElementById('recipesTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function copyCombinedForHopla() {
  const items = getCombinedIngredients().filter((item) => !excludedCombinedIngredients.has(item.key));
  if (!items.length) {
    showToast('Choisis au moins un ingrédient');
    return;
  }
  const text = `Bonjour Hopla, peux-tu ajouter ces ingrédients à mon panier s'il te plaît ?\n\n${items.map((item) => item.text).join('\n')}`;
  copyText(text, 'Liste combinée copiée pour Hopla');
}

function renderRecipes() {
  const list = getRecipes();
  const filter = document.getElementById('dateFilter').value;
  const container = document.getElementById('recipeContainer');
  container.innerHTML = '';

  const filtered = list.filter(r => !filter || (r.date && r.date.startsWith(filter)));

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty">
        <span class="empty-icon">🛒</span>
        <div class="empty-title">Bienvenue sur PanierRecette !</div>
        <div class="empty-desc" style="font-size:13px; color:var(--text-dim); margin-top:12px; max-width:300px; margin-left:auto; margin-right:auto; line-height:1.6">
          Transformez vos recettes préférées en listes de courses en 3 étapes simples :<br>
          1️⃣ Collez une URL ou un texte<br>
          2️⃣ Laissez l'IA extraire les ingrédients<br>
          3️⃣ Importez le résultat pour créer votre panier !<br><br><a href="https://app.guidde.com/share/playbooks/qEJwyfB3fysx3hcpUJ5XRc" target="_blank" style="display:inline-block; margin-top:10px; padding:8px 16px; background:var(--accent); color:white; border-radius:20px; text-decoration:none; font-weight:bold; font-size:12px;">Voir la démo 📺</a>
        </div>
      </div>`;
    return;
  }

  filtered.forEach(recipe => container.appendChild(buildRecipeCard(recipe)));
}

function buildRecipeCard(recipe) {
  const card = document.createElement('div');
  const isNew = Date.now() - recipe.id < 600000;
  const selectionKey = getRecipeSelectionKey(recipe);
  const selectedForShopping = shoppingSelection.get(selectionKey);
  card.className = 'recipe-card' + (isNew ? ' recipe-card-new' : '') + (selectedForShopping ? ' selected-for-shopping' : '') + (shoppingMode ? ' shopping-mode' : '');

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
    ${shoppingMode ? `<button class="recipe-select-btn" type="button" aria-pressed="${Boolean(selectedForShopping)}" aria-label="${selectedForShopping ? 'Retirer' : 'Choisir'} ${recipe.title}"><span>${selectedForShopping ? '✓' : ''}</span></button>` : ''}
    <button class="recipe-card-main" type="button" aria-expanded="false">
      <span class="recipe-card-copy">
        <span class="recipe-card-title">${recipe.title}</span>
        <span class="recipe-tags">${(recipe.tags || []).map(t => `<span class="recipe-tag">${t}</span>`).join('')}</span>
      </span>
      <span class="recipe-card-meta">${getMetaText()}</span>
      <span class="recipe-card-chevron">▾</span>
    </button>
    ${selectedForShopping ? `<div class="shopping-servings"><button type="button" class="servings-step" data-delta="-1" aria-label="Une personne en moins">−</button><span><strong>${selectedForShopping.servings}</strong> personnes</span><button type="button" class="servings-step" data-delta="1" aria-label="Une personne en plus">＋</button></div>` : ''}
    <div class="recipe-card-actions">
      ${recipe.id ? '<button class="delete-btn" title="Supprimer" aria-label="Supprimer cette recette">✕</button>' : ''}
    </div>
  `;

  if (isNew) {
    const badge = document.createElement('span');
    badge.className = 'new-badge';
    badge.textContent = 'New';
    header.querySelector('.recipe-card-title').appendChild(badge);
  }

  const mainButton = header.querySelector('.recipe-card-main');

  function toggleCard() {
    const isOpen = card.classList.toggle('open');
    mainButton.setAttribute('aria-expanded', String(isOpen));
  }
  mainButton.addEventListener('click', () => {
    if (shoppingMode) toggleRecipeForShopping(recipe);
    else toggleCard();
  });

  const selectBtn = header.querySelector('.recipe-select-btn');
  if (selectBtn) selectBtn.addEventListener('click', () => toggleRecipeForShopping(recipe));

  header.querySelectorAll('.servings-step').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      changeShoppingServings(selectionKey, Number(button.dataset.delta));
    });
  });
  const deleteBtn = header.querySelector('.delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteRecipe(recipe.id);
    });
  }

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
    chip.className = 'ai-chip store-chip' + (selectedStore === id ? ' active' : '');
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
    navigator.clipboard.writeText(query).then(() => {
      showToast(`📋 ${query} copié ! Collez-le dans Carrefour 🛒`);
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
    return typeof i === 'string' ? i : i.name;
  }).join(', ');

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
  const importPanel = document.getElementById('importPanel');
  const addRecipeBtn = document.getElementById('addRecipeBtn');
  const closeImportBtn = document.getElementById('closeImportBtn');

  function setImportPanel(open) {
    importPanel.hidden = !open;
    addRecipeBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      importPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => document.getElementById('urlInput').focus(), 250);
    } else {
      addRecipeBtn.focus();
    }
  }

  addRecipeBtn.addEventListener('click', () => setImportPanel(importPanel.hidden));
  closeImportBtn.addEventListener('click', () => setImportPanel(false));
  document.getElementById('shoppingModeBtn').addEventListener('click', () => setShoppingMode(!shoppingMode));
  document.getElementById('cancelShoppingBtn').addEventListener('click', () => setShoppingMode(false));
  document.getElementById('reviewShoppingBtn').addEventListener('click', openShoppingReview);
  document.getElementById('editShoppingBtn').addEventListener('click', editShoppingSelection);
  document.getElementById('copyCombinedBtn').addEventListener('click', copyCombinedForHopla);

  // Main Flow
  document.getElementById('prepareBtn').addEventListener('click', preparePrompt);
  document.getElementById('copyOpenBtn').addEventListener('click', copyAndOpenAI);
  document.getElementById('copyOnlyBtn').addEventListener('click', copyPromptOnly);
  document.getElementById('importBtn').addEventListener('click', importJSON);
  document.getElementById('resetBtn').addEventListener('click', resetFlow);
  
  // Edit Link
  const editBtn = document.getElementById('editLinkBtn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      document.getElementById('step1').style.display = 'block';
      document.getElementById('step2').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      document.getElementById('urlInput').focus();
    });
  }
  
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
  
  // Web Share Target mobile
  const params = new URLSearchParams(window.location.search);
  const sharedUrl = params.get('url') || params.get('text');
  if (sharedUrl && sharedUrl.includes('http')) {
    setImportPanel(true);
    document.getElementById('urlInput').value = sharedUrl;
    window.history.replaceState({}, document.title, '/');
    
    if (isGoogleShortLink(sharedUrl)) {
      // Lien Google raccourci : on garde l'étape 1 visible avec l'avertissement
      // plutôt que de lancer une analyse qui échouera de toute façon.
      showShortLinkWarning(true);
    } else {
      // Cacher l'étape 1 si partage
      document.getElementById('step1').style.display = 'none';
      preparePrompt();
    }
  }
  
  // Change button color on input
  document.getElementById('urlInput').addEventListener('input', (e) => {
    const btn = document.getElementById('prepareBtn');
    const val = e.target.value.trim();
    if (val) {
      btn.classList.remove('btn-accent');
      btn.classList.add('btn-success');
    } else {
      btn.classList.remove('btn-success');
      btn.classList.add('btn-accent');
    }
    showShortLinkWarning(isGoogleShortLink(val));
  });
});
