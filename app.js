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

// --- 自动跳转 ChatGPT 并携带指令 ---
function askAI() {
    const url = document.getElementById('urlInput').value;
    if (!url) return alert("Collez d'abord une URL !");

    // 预设的超级 Prompt
    const prompt = `Analyses cette recette : ${url}. 
    Réponds UNIQUEMENT avec un objet JSON strict : 
    {"title":"...","tags":["Vegi","GF"],"ingredients":["..."],"tokens":{"total":500,"cost":0.0002}}`;

    // 编码成 URL 安全格式
    const encodedPrompt = encodeURIComponent(prompt);

    // 跳转到 ChatGPT，并将指令放在 URL 参数里 (ChatGPT 允许通过 q 参数传词)
    window.open(`https://chatgpt.com/?q=${encodedPrompt}`, '_blank');
}

// 在 checkImport 函数里增加对分享参数的解析
function checkImport() {
    const params = new URLSearchParams(window.location.search);
    
    // 手机分享会把文字或链接放在 'text' 或 'url' 参数里
    const sharedText = params.get('text') || params.get('url') || params.get('import');

    if (sharedText) {
        // 逻辑 A: 如果分享的是 Marmiton 的链接 (包含 http)
        if (sharedText.includes('http')) {
            const marmitonUrl = sharedText.match(/https?:\/\/[^\s]+/)[0];
            // 自动跳转到 ChatGPT 并携带预设 Prompt
            askAI(marmitonUrl); 
        } 
        // 逻辑 B: 如果分享的是 ChatGPT 回传的 JSON (包含 { )
        else if (sharedText.includes('{')) {
            try {
                const jsonMatch = sharedText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const data = JSON.parse(jsonMatch[0].replace(/\n/g, ' '));
                    saveToLocal(data);
                    renderRecipes();
                }
            } catch (e) { alert("Format JSON invalide"); }
        }
        
        // 清理 URL 避免重复触发
        window.history.replaceState({}, document.title, "/");
    }
}

// 自动去 ChatGPT 的函数
function askAI(targetUrl) {
    const prompt = `Analyses cette recette : ${targetUrl}. Réponds UNIQUEMENT avec un objet JSON strict : {"title":"...","tags":["Vegi","GF"],"ingredients":["..."],"tokens":{"total":500,"cost":0.0002}}`;
    // 在新窗口打开 ChatGPT
    window.open(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`, '_blank');
}