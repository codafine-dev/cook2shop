/**
 * COOK2SHOP — app.js
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
 * URLs d'ouverture pour chaque chatbot IA.
 * Quand l'utilisateur clique "Copier & ouvrir l'IA",
 * on ouvre l'URL correspondante dans un nouvel onglet.
 */
const AI_URLS = {
    chatgpt: 'https://chatgpt.com/',
    gemini:  'https://gemini.google.com/app',
    claude:  'https://claude.ai/new',
    copilot: 'https://copilot.microsoft.com/',
  };
  
  /**
   * Template du prompt envoyé à l'IA.
   * On lui demande de renvoyer UNIQUEMENT du JSON strict,
   * sans markdown ni backticks, pour faciliter le parsing.
   *
   * @param {string} url - URL de la recette à analyser
   * @returns {string} Le prompt complet prêt à être copié
   */
  function buildPrompt(url) {
    return `Analyse cette recette : ${url}
  
  Réponds UNIQUEMENT avec un objet JSON strict, sans markdown, sans backticks :
  {"title":"Nom de la recette","ingredients":["200g de farine","3 oeufs","1 citron"]}
  
  Règles :
  - Chaque ingrédient = une chaîne avec quantité + unité si précisées
  - Pas de commentaire, pas d'explication, juste le JSON`;
  }
  
  
  /* ══════════════════════════════════════════════════════
     2. ÉTAT GLOBAL
     ══════════════════════════════════════════════════════ */
  
  /**
   * L'IA actuellement sélectionnée par l'utilisateur.
   * Valeur initiale : 'chatgpt' (premier chip actif dans le HTML)
   */
  let selectedAI = 'chatgpt';
  
  /**
   * L'URL de recette saisie à l'étape 1.
   * Conservée ici pour pouvoir la réutiliser à l'étape 2 (prompt)
   * et l'attacher à la recette sauvegardée.
   */
  let currentUrl = '';
  
  
  /* ══════════════════════════════════════════════════════
     3. FLOW PRINCIPAL (étapes 1 → 2 → 3)
     ══════════════════════════════════════════════════════ */
  
  /**
   * ÉTAPE 1 — Appelée au clic sur "Préparer"
   * Récupère l'URL, génère le prompt, révèle les étapes 2 et 3.
   */
  function preparePrompt() {
    const url = document.getElementById('urlInput').value.trim();
  
    if (!url) {
      showToast('Colle une URL de recette d\'abord !');
      return;
    }
  
    // Sauvegarde l'URL dans l'état global
    currentUrl = url;
  
    // Met à jour l'affichage du prompt dans la boîte de l'étape 2
    updatePromptBox();
  
    // Révèle les étapes 2 et 3 (elles étaient cachées via style="display:none")
    document.getElementById('step2').style.display = 'block';
    document.getElementById('step3').style.display = 'block';
  
    // Scroll doux vers l'étape 2
    document.getElementById('step2').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  
  /**
   * Met à jour le contenu de #promptBox avec le prompt généré.
   * Appelée à chaque changement d'URL ou de sélection d'IA.
   */
  function updatePromptBox() {
    document.getElementById('promptBox').textContent = buildPrompt(currentUrl);
  }
  
  /**
   * Sélectionne une IA.
   * Appelée au clic sur un chip (ChatGPT, Gemini…).
   *
   * @param {string} ai  - clé dans AI_URLS ('chatgpt', 'gemini'…)
   * @param {Element} el - l'élément cliqué (pour lui ajouter .active)
   */
  function selectAI(ai, el) {
    selectedAI = ai;
  
    // Retire .active sur tous les chips, puis l'ajoute au chip cliqué
    document.querySelectorAll('.ai-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  }
  
  /**
   * ÉTAPE 2 — Copie le prompt ET ouvre l'IA dans un nouvel onglet.
   *
   * Pourquoi window.open avec '_blank' ?
   * → La PWA reste ouverte dans l'onglet d'origine.
   *   L'utilisateur peut revenir dessus pour coller le JSON (étape 3).
   *   Si on avait utilisé window.location.href, on quitterait la PWA
   *   et toute la liste de courses disparaîtrait.
   */
  function copyAndOpenAI() {
    const prompt = buildPrompt(currentUrl);
    const encoded = encodeURIComponent(prompt);
  
    const urls = {
      chatgpt: `https://chatgpt.com/?q=${encoded}`,
      gemini:  `https://gemini.google.com/app?q=${encoded}`,
      claude:  `https://claude.ai/new?q=${encoded}`,
      copilot: `https://copilot.microsoft.com/?q=${encoded}`,
    };
  
    navigator.clipboard.writeText(prompt).catch(() => {});
    window.open(urls[selectedAI], '_blank', 'noopener');
    showToast('Prompt envoyé !');
  }
  
  /**
   * Copie le prompt sans ouvrir l'IA.
   * Utile si l'utilisateur préfère l'ouvrir lui-même.
   */
  function copyPromptOnly() {
    navigator.clipboard.writeText(buildPrompt(currentUrl))
      .then(() => showToast('Prompt copié !'))
      .catch(() => showToast('Erreur lors de la copie'));
  }
  
  /**
   * ÉTAPE 3 — Parse le JSON collé par l'utilisateur et sauvegarde la recette.
   *
   * Robustesse : on nettoie les backticks markdown au cas où l'IA
   * aurait répondu avec ```json ... ``` malgré les instructions.
   */
  function importJSON() {
    const raw = document.getElementById('jsonInput').value.trim();
  
    if (!raw) {
      showToast('Colle d\'abord la réponse de l\'IA');
      return;
    }
  
    try {
      // Nettoyage : retire les balises markdown ```json ... ```
      const clean = raw.replace(/```json|```/g, '').trim();
  
      // Parse le JSON
      const data = JSON.parse(clean);
  
      // Validation minimale : on vérifie que title et ingredients sont présents
      if (!data.title || !Array.isArray(data.ingredients) || data.ingredients.length === 0) {
        throw new Error('Structure JSON inattendue — title et ingredients requis');
      }
  
      // Sauvegarde dans localStorage
      saveToLocal({
        title: data.title,
        ingredients: data.ingredients,
        sourceUrl: currentUrl || null, // URL source, pour référence
      });
  
      // Réinitialise le flow et rafraîchit la liste
      resetFlow();
      renderRecipes();
      showToast(`"${data.title}" importée !`);
  
    } catch (e) {
      // Affiche un message d'erreur clair
      showToast('JSON invalide — vérifie la réponse de l\'IA');
      console.error('[Cook2Shop] Erreur parsing JSON :', e.message);
    }
  }
  
  /**
   * Remet tout à zéro :
   * - Cache les étapes 2 et 3
   * - Vide les champs URL et JSON
   * - Réinitialise l'état global
   */
  function resetFlow() {
    currentUrl = '';
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step3').style.display = 'none';
    document.getElementById('urlInput').value = '';
    document.getElementById('jsonInput').value = '';
  }
  
  
  /* ══════════════════════════════════════════════════════
     4. LOCALSTORAGE — Sauvegarde et lecture
     ══════════════════════════════════════════════════════ */
  
  /**
   * Clé utilisée dans localStorage.
   * Centraliser ici évite les fautes de frappe.
   */
  const STORAGE_KEY = 'c2s_recipes';
  
  /**
   * Lit toutes les recettes depuis localStorage.
   * Retourne un tableau vide si rien n'est sauvegardé.
   *
   * @returns {Array} tableau de recettes
   */
  function getRecipes() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  }
  
  /**
   * Sauvegarde une nouvelle recette en tête de liste (la plus récente en premier).
   *
   * @param {Object} recipe - { title, ingredients, sourceUrl }
   */
  function saveToLocal(recipe) {
    const list = getRecipes();
  
    // On enrichit la recette avec un id unique et la date d'ajout
    const newEntry = {
      ...recipe,
      id: Date.now(),                              // timestamp = id unique
      date: new Date().toISOString().split('T')[0], // "2026-03-31"
      checkedIngredients: [],                       // liste des ingrédients cochés (vide au départ)
    };
  
    // Ajoute en tête et sauvegarde
    list.unshift(newEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
  
  /**
   * Met à jour la liste des ingrédients cochés d'une recette spécifique.
   * Appelée chaque fois que l'utilisateur coche/décoche un ingrédient.
   *
   * @param {number} recipeId           - id de la recette
   * @param {string[]} checkedIngredients - tableau des noms d'ingrédients cochés
   */
  function updateChecked(recipeId, checkedIngredients) {
    const list = getRecipes();
    const idx = list.findIndex(r => r.id === recipeId);
    if (idx !== -1) {
      list[idx].checkedIngredients = checkedIngredients;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  }
  
  /**
   * Supprime une recette par son id.
   *
   * @param {number} id - id de la recette à supprimer
   */
  function deleteRecipe(id) {
    const list = getRecipes().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    renderRecipes();
    showToast('Recette supprimée');
  }
  
  
  /* ══════════════════════════════════════════════════════
     5. RENDU DES RECETTES
     ══════════════════════════════════════════════════════ */
  
  /**
   * Vide et reconstruit #recipeContainer avec toutes les recettes.
   * Appelée après chaque modification (import, suppression, filtre).
   */
  function renderRecipes() {
    const list = getRecipes();
    const filter = document.getElementById('dateFilter').value; // ex: "2026-03-31"
    const container = document.getElementById('recipeContainer');
  
    // Vide le conteneur
    container.innerHTML = '';
  
    // Filtre par date si un filtre est actif
    const filtered = list.filter(r => !filter || r.date === filter);
  
    // État vide
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty">
          <span class="empty-icon">🛒</span>
          <div class="empty-title">Aucune recette importée</div>
        </div>`;
      return;
    }
  
    // Construit et injecte une carte par recette
    filtered.forEach(recipe => {
      container.appendChild(buildRecipeCard(recipe));
    });
  }
  
  /**
   * Construit la carte HTML d'une recette.
   * La carte fonctionne comme un accordéon :
   * - Header cliquable → toggle .open → liste d'ingrédients visible
   *
   * @param {Object} recipe - objet recette depuis localStorage
   * @returns {HTMLElement} div.recipe-card
   */
  function buildRecipeCard(recipe) {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.dataset.id = recipe.id;
  
    // Set des ingrédients déjà cochés (pour affichage initial)
    const checked = new Set(recipe.checkedIngredients || []);
    const total = recipe.ingredients.length;
    const doneCount = checked.size;
  
    /* ── Header de la carte ── */
    const header = document.createElement('div');
    header.className = 'recipe-card-header';
    header.innerHTML = `
      <div class="recipe-card-title">${recipe.title}</div>
      <div class="recipe-card-meta">${doneCount}/${total}</div>
      <div style="display:flex;gap:6px;align-items:center">
        <button
          class="btn btn-outline btn-sm"
          onclick="event.stopPropagation(); deleteRecipe(${recipe.id})"
          title="Supprimer cette recette"
        >✕</button>
        <span class="recipe-card-chevron">▾</span>
      </div>
    `;
  
    // Toggle accordéon au clic sur le header
    header.addEventListener('click', () => {
      card.classList.toggle('open');
    });
  
    /* ── Liste d'ingrédients ── */
    const ingList = document.createElement('div');
    ingList.className = 'recipe-ingredients';
  
    recipe.ingredients.forEach(ing => {
      const isDone = checked.has(ing);
      const row = document.createElement('div');
      row.className = `ingredient-row${isDone ? ' done' : ''}`;
  
      row.innerHTML = `
        <button
          class="ing-btn"
          onclick="toggleIngredient(${recipe.id}, '${escapeStr(ing)}', this)"
          title="Cocher / décocher"
        >
          <span class="ing-check">${isDone ? '✓' : ''}</span>
          <span class="ing-name">${ing}</span>
        </button>
        <button
          class="carrefour-btn"
          onclick="openCarrefour('${escapeStr(ing)}')"
          title="Rechercher sur Carrefour (nouvel onglet)"
        >
          → Carrefour
        </button>
      `;
  
      ingList.appendChild(row);
    });
  
    card.appendChild(header);
    card.appendChild(ingList);
    return card;
  }
  
  /**
   * Réinitialise le filtre date et rafraîchit la liste.
   */
  function clearDateFilter() {
    document.getElementById('dateFilter').value = '';
    renderRecipes();
  }
  
  
  /* ══════════════════════════════════════════════════════
     6. ACTIONS SUR LES INGRÉDIENTS
     ══════════════════════════════════════════════════════ */
  
  /**
   * Coche ou décoche un ingrédient.
   * Met à jour localStorage ET l'UI directement (sans re-render complet)
   * pour éviter que la carte se referme.
   *
   * @param {number} recipeId   - id de la recette
   * @param {string} ingredient - nom de l'ingrédient
   * @param {Element} btn       - le bouton .ing-btn cliqué (pour remonter au .ingredient-row)
   */
  function toggleIngredient(recipeId, ingredient, btn) {
    // Relit la recette depuis localStorage pour avoir l'état à jour
    const recipe = getRecipes().find(r => r.id === recipeId);
    if (!recipe) return;
  
    // Toggle : ajoute ou retire l'ingrédient de la liste des cochés
    const checked = new Set(recipe.checkedIngredients || []);
    if (checked.has(ingredient)) {
      checked.delete(ingredient);
    } else {
      checked.add(ingredient);
    }
  
    // Sauvegarde le nouvel état
    updateChecked(recipeId, [...checked]);
  
    // Mise à jour de l'UI sans re-render complet
    const row = btn.closest('.ingredient-row');
    const isDone = checked.has(ingredient);
    row.classList.toggle('done', isDone);
    row.querySelector('.ing-check').textContent = isDone ? '✓' : '';
  
    // Met à jour le compteur dans le header de la carte ("3/8")
    const card = row.closest('.recipe-card');
    const updatedRecipe = getRecipes().find(r => r.id === recipeId);
    const newDone = (updatedRecipe.checkedIngredients || []).length;
    card.querySelector('.recipe-card-meta').textContent = `${newDone}/${updatedRecipe.ingredients.length}`;
  }
  
  /**
   * Ouvre Carrefour dans un NOUVEL ONGLET avec la recherche de l'ingrédient.
   * La PWA reste ouverte dans l'onglet d'origine → les boutons ne disparaissent pas.
   *
   * On nettoie le nom avant la recherche :
   * "200g de farine" → on cherche "farine" (pas "200g de farine")
   *
   * @param {string} ingredient - nom de l'ingrédient (éventuellement avec quantité)
   */
  function openCarrefour(ingredient) {
    // Retire la quantité en début de chaîne : "200g de ", "3 ", "1 litre de "…
    const cleaned = ingredient
      .replace(/^\d+[\d,.]*\s*(g|kg|ml|l|cl|dl|cs|cc|tsp|tbsp|litre[s]?)?\s*(de\s|d')?/i, '')
      .trim();
  
    // Fallback : si le nettoyage a tout supprimé, on garde l'original
    const query = cleaned || ingredient;
  
    // Copie dans le presse-papier (pratique si l'utilisateur veut coller manuellement)
    navigator.clipboard.writeText(query).catch(() => {
      // Silencieux si le clipboard n'est pas disponible (ex: HTTP)
    });
  
    // Ouvre Carrefour dans un NOUVEL onglet
    // → '_blank' : nouvel onglet (la PWA reste ouverte)
    // → 'noopener' : sécurité (la nouvelle page ne peut pas accéder à window.opener)
    window.open(
      `https://www.carrefour.fr/s?q=${encodeURIComponent(query)}`,
      '_blank',
      'noopener'
    );
  
    showToast(`→ Carrefour : "${query}"`);
  }
  
  
  /* ══════════════════════════════════════════════════════
     7. UTILITAIRES
     ══════════════════════════════════════════════════════ */
  
  /**
   * Affiche une notification temporaire en bas de l'écran.
   * Se supprime automatiquement après 2.4s (sync avec l'animation CSS).
   *
   * @param {string} msg - message à afficher
   */
  function showToast(msg) {
    // Supprime un éventuel toast déjà visible
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
  
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
  
    // Supprime après la durée de l'animation (2.4s)
    setTimeout(() => t.remove(), 2400);
  }
  
  /**
   * Échappe les apostrophes et backslashes dans une chaîne.
   * Nécessaire pour injecter des chaînes dans des attributs onclick HTML
   * sans casser la syntaxe JS.
   *
   * Ex: "huile d'olive" → "huile d\\'olive"
   *
   * @param {string} s - chaîne à échapper
   * @returns {string}
   */
  function escapeStr(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
  }
  
  
  /* ══════════════════════════════════════════════════════
     8. INITIALISATION
     ══════════════════════════════════════════════════════ */
  
  /**
   * Point d'entrée : s'exécute quand le DOM est prêt.
   *
   * Deux actions :
   * 1. Web Share Target : si l'utilisateur a partagé une URL
   *    depuis son navigateur mobile vers la PWA, on pré-remplit le champ.
   * 2. Affichage initial de la liste des recettes sauvegardées.
   */
  document.addEventListener('DOMContentLoaded', () => {
  
    // ── Web Share Target (mobile) ──
    // Quand on partage une URL depuis Safari/Chrome vers Cook2Shop,
    // l'OS ajoute l'URL en paramètre GET (?url=... ou ?text=...)
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text');
  
    if (sharedUrl && sharedUrl.includes('http')) {
      // Pré-remplit le champ URL
      document.getElementById('urlInput').value = sharedUrl;
      // Nettoie l'URL de la barre d'adresse pour éviter de re-déclencher au reload
      window.history.replaceState({}, document.title, '/');
      // Lance automatiquement l'étape 1
      preparePrompt();
    }
  
    // ── Affichage initial ──
    renderRecipes();
  });