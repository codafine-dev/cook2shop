/**
 * Cook2Shop Core Logic
 */

// --- 1. 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    checkImport();    // 检查是否有来自 ChatGPT 的数据
    renderRecipes();  // 渲染列表
});

// --- 2. 检查来自书签脚本的导入 ---
function checkImport() {
    const params = new URLSearchParams(window.location.search);
    const rawData = params.get('import');

    if (rawData) {
        try {
            const data = JSON.parse(decodeURIComponent(rawData));
            saveToLocal(data);
            // 清理 URL 参数，保持地址栏干净
            window.history.replaceState({}, document.title, "/");
        } catch (e) {
            alert("Erreur lors de l'importation Cook2Shop.");
        }
    }
}

// --- 3. 模拟分析 (手动输入时使用) ---
function handleAnalysis() {
    const url = document.getElementById('urlInput').value;
    if (!url) return;

    // 模拟一个 AI 返回的结构
    const mockData = {
        title: "Recette Simulée",
        tags: ["Vegi", "GF"],
        tokens: { total: 450, cost: 0.0002 },
        ingredients: ["Exemple 1", "Exemple 2"]
    };

    saveToLocal(mockData);
    document.getElementById('urlInput').value = '';
    renderRecipes();
}

// --- 4. 存储逻辑 ---
function saveToLocal(recipe) {
    let list = JSON.parse(localStorage.getItem('c2s_recipes') || '[]');
    
    // 补齐元数据
    const newEntry = {
        ...recipe,
        id: Date.now(),
        date: new Date().toISOString().split('T')[0]
    };

    list.unshift(newEntry);
    localStorage.setItem('c2s_recipes', JSON.stringify(list));
}

// --- 5. 渲染渲染 ---
function renderRecipes() {
    const list = JSON.parse(localStorage.getItem('c2s_recipes') || '[]');
    const filter = document.getElementById('dateFilter').value;
    const container = document.getElementById('recipeContainer');
    
    container.innerHTML = '';

    list.filter(r => !filter || r.date === filter).forEach(item => {
        const tags = item.tags.map(t => `<span class="badge rounded-pill bg-success tag-badge me-1">${t}</span>`).join('');
        
        container.innerHTML += `
            <div class="col-12 mb-3">
                <div class="card shadow-sm recipe-card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between">
                            <h6 class="fw-bold">${item.title}</h6>
                            <small class="text-muted">${item.date}</small>
                        </div>
                        <div class="mb-2">${tags}</div>
                        <div class="token-info d-flex justify-content-between mt-2">
                            <span>⚡ ${item.tokens?.total || 0} tokens</span>
                            <span>${item.tokens?.cost || 0} €</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

function clearDateFilter() {
    document.getElementById('dateFilter').value = '';
    renderRecipes();
}
