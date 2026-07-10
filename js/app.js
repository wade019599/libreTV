// 全局变量
const DEFAULT_SELECTED_APIS = [
    "tyyszy",
    "dyttzy",
    "bfzy",
    "ruyi",
    "qiqi",
    "zy360",
    "heimuer",
    "jisu",
    "ffzy",
    "lzi"
];
const DEFAULT_SELECTED_APIS_VERSION = 'default-selected-apis-v2-10';
const CONTENT_MODE_STORAGE_KEY = 'preferredContentMode';
const YELLOW_FILTER_UNLOCK_QUERY = '/我爱你';
let selectedAPIs = JSON.parse(localStorage.getItem('selectedAPIs') || JSON.stringify(DEFAULT_SELECTED_APIS)); // 默认选中资源
let customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]'); // 存储自定义API列表

// 添加当前播放的集数索引
let currentEpisodeIndex = 0;
// 添加当前视频的所有集数
let currentEpisodes = [];
// 添加当前视频的标题
let currentVideoTitle = '';
// 全局变量用于倒序状态
let episodesReversed = false;
let apiHealthTimer = null;
const TV_SEARCH_KEYBOARD_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
];

// 页面初始化
document.addEventListener('DOMContentLoaded', async function () {
    // 设置默认API选择（如果是第一次加载）
    if (!localStorage.getItem('hasInitializedDefaults')) {
        // 默认选中资源
        selectedAPIs = DEFAULT_SELECTED_APIS.filter(apiKey => API_SITES[apiKey]);
        localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));

        // 默认选中过滤开关
        localStorage.setItem('yellowFilterEnabled', 'true');
        localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, 'true');

        // 默认启用豆瓣功能
        localStorage.setItem('doubanEnabled', 'true');

        // 标记已初始化默认值
        localStorage.setItem('hasInitializedDefaults', 'true');
    }

    await syncExternalAPISites();

    const apiHealthStatus = getApiHealthStatus();
    Object.keys(apiHealthStatus).forEach(apiKey => {
        if (apiHealthStatus[apiKey]?.deletedAt && API_SITES[apiKey]) {
            delete API_SITES[apiKey];
        }
    });
    selectedAPIs = selectedAPIs.filter(apiId => !apiHealthStatus[apiId]?.deletedAt);
    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));

    const defaultSelectedAPIs = DEFAULT_SELECTED_APIS.filter(apiKey => API_SITES[apiKey]);
    const selectedVersion = localStorage.getItem('selectedApiDefaultsVersion');
    if (selectedVersion !== DEFAULT_SELECTED_APIS_VERSION) {
        selectedAPIs = defaultSelectedAPIs;
        localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
        localStorage.setItem('selectedApiDefaultsVersion', DEFAULT_SELECTED_APIS_VERSION);
        localStorage.setItem('hasInitializedDefaults', 'true');
    }

    // 初始化API复选框
    initAPICheckboxes();

    // 初始化自定义API列表
    renderCustomAPIsList();

    // 初始化显示选中的API数量
    updateSelectedApiCount();

    // 渲染搜索历史
    renderSearchHistory();

    // 设置黄色内容过滤器开关初始状态
    const yellowFilterToggle = document.getElementById('yellowFilterToggle');
    if (yellowFilterToggle) {
        yellowFilterToggle.checked = localStorage.getItem('yellowFilterEnabled') === 'true';
    }

    // 设置广告过滤开关初始状态
    const adFilterToggle = document.getElementById('adFilterToggle');
    if (adFilterToggle) {
        adFilterToggle.checked = localStorage.getItem(PLAYER_CONFIG.adFilteringStorage) !== 'false'; // 默认为true
    }

    // 设置启动内容模式按钮状态
    updatePreferredContentModeButtons();
    initAppLineModeSetting();
    window.addEventListener('load', initAppLineModeSetting, { once: true });
    setTimeout(initAppLineModeSetting, 500);

    // 设置事件监听器
    setupEventListeners();
    initTvSearchKeyboard();

    // 根据设置进入默认内容，直接访问 /live 时保持直播页
    const preferredMode = localStorage.getItem(CONTENT_MODE_STORAGE_KEY) || 'vod';
    if (preferredMode === 'live' && window.location.pathname !== '/live') {
        window.location.replace('/live');
        return;
    }

    // 初始检查成人API选中状态
    setTimeout(checkAdultAPIsSelected, 100);

    // 启动API可用性定时检测
    startApiHealthMonitor();
});

function isTvSearchKeyboardDevice() {
    const ua = navigator.userAgent || '';
    return /JMTV-TV|Android\s+TV|AFT[A-Z0-9]*|SmartTV|Tizen|Web0S/i.test(ua);
}

function initTvSearchKeyboard() {
    if (!isTvSearchKeyboardDevice()) {
        return;
    }

    const searchInput = document.getElementById('searchInput');
    const toggleButton = document.getElementById('tvKeyboardToggle');
    const keyboard = document.getElementById('tvSearchKeyboard');
    if (!searchInput || !toggleButton || !keyboard) {
        return;
    }

    toggleButton.classList.remove('hidden');
    searchInput.setAttribute('inputmode', 'none');
    renderTvSearchKeyboard();
    searchInput.addEventListener('focus', openTvSearchKeyboard);
    searchInput.addEventListener('click', openTvSearchKeyboard);
}

function renderTvSearchKeyboard() {
    const rows = document.getElementById('tvSearchKeyboardRows');
    if (!rows) {
        return;
    }

    const letterRows = TV_SEARCH_KEYBOARD_ROWS.map(row => `
        <div class="grid gap-2" style="grid-template-columns: repeat(${row.length}, minmax(0, 1fr));">
            ${row.map(key => `
                <button type="button"
                        class="tv-key h-11 rounded-md bg-[#222] hover:bg-white focus:bg-white text-white hover:text-black focus:text-black text-base font-medium outline-none transition-colors"
                        onclick="pressTvSearchKey('${key}')">${key}</button>
            `).join('')}
        </div>
    `).join('');

    rows.innerHTML = `
        ${letterRows}
        <div class="grid grid-cols-5 gap-2">
            <button type="button" class="tv-key h-11 rounded-md bg-[#222] hover:bg-white focus:bg-white text-white hover:text-black focus:text-black text-sm outline-none transition-colors" onclick="pressTvSearchKey('backspace')">退格</button>
            <button type="button" class="tv-key h-11 rounded-md bg-[#222] hover:bg-white focus:bg-white text-white hover:text-black focus:text-black text-sm outline-none transition-colors" onclick="pressTvSearchKey('space')">空格</button>
            <button type="button" class="tv-key h-11 rounded-md bg-[#222] hover:bg-white focus:bg-white text-white hover:text-black focus:text-black text-sm outline-none transition-colors" onclick="pressTvSearchKey('clear')">清空</button>
            <button type="button" class="tv-key h-11 rounded-md bg-white text-black hover:bg-gray-200 focus:bg-gray-200 text-sm outline-none transition-colors" onclick="pressTvSearchKey('search')">搜索</button>
            <button type="button" class="tv-key h-11 rounded-md bg-[#222] hover:bg-white focus:bg-white text-white hover:text-black focus:text-black text-sm outline-none transition-colors" onclick="pressTvSearchKey('close')">关闭</button>
        </div>
    `;
}

function openTvSearchKeyboard() {
    const keyboard = document.getElementById('tvSearchKeyboard');
    if (!keyboard || !isTvSearchKeyboardDevice()) {
        return;
    }
    keyboard.classList.remove('hidden');
}

function closeTvSearchKeyboard() {
    const keyboard = document.getElementById('tvSearchKeyboard');
    if (keyboard) {
        keyboard.classList.add('hidden');
    }
    const toggleButton = document.getElementById('tvKeyboardToggle');
    if (toggleButton) {
        toggleButton.focus();
    }
}

function toggleTvSearchKeyboard() {
    const keyboard = document.getElementById('tvSearchKeyboard');
    if (!keyboard) {
        return;
    }
    if (keyboard.classList.contains('hidden')) {
        openTvSearchKeyboard();
        const firstKey = keyboard.querySelector('.tv-key');
        if (firstKey) {
            firstKey.focus();
        }
        return;
    }
    closeTvSearchKeyboard();
}

function pressTvSearchKey(key) {
    const input = document.getElementById('searchInput');
    if (!input) {
        return;
    }

    if (key === 'close') {
        closeTvSearchKeyboard();
        return;
    }
    if (key === 'search') {
        search();
        return;
    }

    let value = input.value || '';
    if (key === 'backspace') {
        value = value.slice(0, -1);
    } else if (key === 'space') {
        value += ' ';
    } else if (key === 'clear') {
        value = '';
    } else {
        value += key;
    }

    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function syncExternalAPISites() {
    if (!window.extendAPISites || typeof SOURCE_SYNC_CONFIG === 'undefined' || !SOURCE_SYNC_CONFIG.enabled) {
        return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SOURCE_SYNC_CONFIG.timeout);
    try {
        const response = await fetch(SOURCE_SYNC_CONFIG.endpoint, {
            headers: {
                'Accept': 'application/json'
            },
            signal: controller.signal
        });
        if (!response.ok) {
            return;
        }

        const data = await response.json();
        if (data && data.code === 200 && data.sites && typeof data.sites === 'object') {
            window.extendAPISites(data.sites);
        }
    } catch (error) {
        console.warn('同步外部资源站失败，继续使用本地配置:', error);
    } finally {
        clearTimeout(timeoutId);
    }
}

function getApiHealthStatus() {
    try {
        return JSON.parse(localStorage.getItem(API_HEALTH_CONFIG.cacheKey) || '{}');
    } catch (error) {
        console.error('读取API可用性缓存失败:', error);
        return {};
    }
}

function saveApiHealthStatus(status) {
    try {
        localStorage.setItem(API_HEALTH_CONFIG.cacheKey, JSON.stringify(status));
    } catch (error) {
        console.error('保存API可用性缓存失败:', error);
    }
}

function isApiHealthFresh(record) {
    return record && record.checkedAt && Date.now() - record.checkedAt < API_HEALTH_CONFIG.cacheExpiry;
}

function isApiAvailableForUse(apiId) {
    if (!API_HEALTH_CONFIG.enabled || !API_HEALTH_CONFIG.hideUnavailable || apiId.startsWith('custom_')) {
        return true;
    }
    const record = getApiHealthStatus()[apiId];
    if (record?.deletedAt) {
        return false;
    }
    if (record?.ok === false) {
        return false;
    }
    if (!isApiHealthFresh(record)) {
        return true;
    }
    return record.ok !== false;
}

function getSelectedAvailableAPIs() {
    return selectedAPIs.filter(apiId => isApiAvailableForUse(apiId));
}

async function testBuiltInApiHealth(apiKey) {
    const api = API_SITES[apiKey];
    if (!api || !api.api) {
        return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_HEALTH_CONFIG.timeout);
    try {
        const testUrl = `${api.api}${API_CONFIG.search.path}${encodeURIComponent(API_HEALTH_CONFIG.testKeyword)}`;
        const proxiedUrl = window.ProxyAuth?.addAuthToProxyUrl ?
            await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(testUrl)) :
            PROXY_URL + encodeURIComponent(testUrl);
        const response = await fetch(proxiedUrl, {
            headers: API_CONFIG.search.headers,
            signal: controller.signal
        });
        if (!response.ok) {
            return false;
        }
        const data = await response.json();
        return Boolean(data && data.code !== 400 && Array.isArray(data.list));
    } catch (error) {
        console.warn(`${api.name || apiKey} 可用性检测失败:`, error);
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function runApiHealthCheck(force = false) {
    if (!API_HEALTH_CONFIG.enabled) {
        return;
    }
    if (window.ProxyAuth && !window.ProxyAuth.hasProxyAuthSync()) {
        return;
    }

    const status = getApiHealthStatus();
    const apiKeys = Object.keys(API_SITES).filter(apiKey => {
        const api = API_SITES[apiKey];
        if (!api || !api.api || apiKey === 'testSource') {
            return false;
        }
        return !status[apiKey]?.deletedAt && (force || !isApiHealthFresh(status[apiKey]));
    });

    for (let i = 0; i < apiKeys.length; i += API_HEALTH_CONFIG.batchSize) {
        const batch = apiKeys.slice(i, i + API_HEALTH_CONFIG.batchSize);
        const results = await Promise.all(batch.map(async apiKey => ({
            apiKey,
            ok: await testBuiltInApiHealth(apiKey)
        })));
        results.forEach(({ apiKey, ok }) => {
            const now = Date.now();
            const previous = status[apiKey] || {};
            const failureSince = ok ? null : (previous.failureSince || now);
            const shouldDelete = !ok && now - failureSince >= API_HEALTH_CONFIG.deleteAfter;
            status[apiKey] = {
                ok,
                checkedAt: now,
                failureSince,
                deletedAt: shouldDelete ? now : previous.deletedAt,
                name: API_SITES[apiKey]?.name || apiKey,
                api: API_SITES[apiKey]?.api || previous.api || ''
            };
            if (ok) {
                delete status[apiKey].failureSince;
                delete status[apiKey].deletedAt;
            }
            if (shouldDelete) {
                delete API_SITES[apiKey];
                selectedAPIs = selectedAPIs.filter(id => id !== apiKey);
                localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
            }
        });
        saveApiHealthStatus(status);
    }

    initAPICheckboxes();
    updateSelectedApiCount();
}

function startApiHealthMonitor() {
    if (!API_HEALTH_CONFIG.enabled || apiHealthTimer) {
        return;
    }
    setTimeout(() => runApiHealthCheck(false), 1500);
    document.addEventListener('passwordVerified', () => runApiHealthCheck(false));
    apiHealthTimer = setInterval(() => runApiHealthCheck(true), API_HEALTH_CONFIG.interval);
}

// 初始化API复选框
function initAPICheckboxes() {
    const container = document.getElementById('apiCheckboxes');
    container.innerHTML = '';

    // 添加普通API组标题
    const normaldiv = document.createElement('div');
    normaldiv.id = 'normaldiv';
    normaldiv.className = 'grid grid-cols-2 gap-2';
    const normalTitle = document.createElement('div');
    normalTitle.className = 'api-group-title';
    normalTitle.textContent = '普通资源';
    normaldiv.appendChild(normalTitle);

    // 创建普通API源的复选框
    Object.keys(API_SITES).forEach(apiKey => {
        const api = API_SITES[apiKey];
        if (api.adult) return; // 跳过成人内容API，稍后添加

        const checked = selectedAPIs.includes(apiKey);

        const checkbox = document.createElement('div');
        checkbox.className = 'flex items-center';
        checkbox.innerHTML = `
            <input type="checkbox" id="api_${apiKey}" 
                   class="form-checkbox h-3 w-3 text-blue-600 bg-[#222] border border-[#333]" 
                   ${checked ? 'checked' : ''} 
                   data-api="${apiKey}">
            <label for="api_${apiKey}" class="ml-1 text-xs text-gray-400 truncate">${api.name}</label>
        `;
        normaldiv.appendChild(checkbox);

        // 添加事件监听器
        checkbox.querySelector('input').addEventListener('change', function () {
            updateSelectedAPIs();
            checkAdultAPIsSelected();
        });
    });
    container.appendChild(normaldiv);

    // 添加成人API列表
    addAdultAPI();

    // 初始检查成人内容状态
    checkAdultAPIsSelected();
}

// 添加成人API列表
function addAdultAPI() {
    // 仅在隐藏设置为false时添加成人API组
    if (!HIDE_BUILTIN_ADULT_APIS && (localStorage.getItem('yellowFilterEnabled') === 'false')) {
        const container = document.getElementById('apiCheckboxes');

        // 添加成人API组标题
        const adultdiv = document.createElement('div');
        adultdiv.id = 'adultdiv';
        adultdiv.className = 'grid grid-cols-2 gap-2';
        const adultTitle = document.createElement('div');
        adultTitle.className = 'api-group-title adult';
        adultTitle.innerHTML = `黄色资源采集站 <span class="adult-warning">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        </span>`;
        adultdiv.appendChild(adultTitle);

        // 创建成人API源的复选框
        Object.keys(API_SITES).forEach(apiKey => {
            const api = API_SITES[apiKey];
            if (!api.adult) return; // 仅添加成人内容API

            const checked = selectedAPIs.includes(apiKey);

            const checkbox = document.createElement('div');
            checkbox.className = 'flex items-center';
            checkbox.innerHTML = `
                <input type="checkbox" id="api_${apiKey}" 
                       class="form-checkbox h-3 w-3 text-blue-600 bg-[#222] border border-[#333] api-adult" 
                       ${checked ? 'checked' : ''} 
                       data-api="${apiKey}">
                <label for="api_${apiKey}" class="ml-1 text-xs text-pink-400 truncate">${api.name}</label>
            `;
            adultdiv.appendChild(checkbox);

            // 添加事件监听器
            checkbox.querySelector('input').addEventListener('change', function () {
                updateSelectedAPIs();
                checkAdultAPIsSelected();
            });
        });
        container.appendChild(adultdiv);
    }
}

// 检查是否有成人API被选中
function checkAdultAPIsSelected() {
    // 查找所有内置成人API复选框
    const adultBuiltinCheckboxes = document.querySelectorAll('#apiCheckboxes .api-adult:checked');

    // 查找所有自定义成人API复选框
    const customApiCheckboxes = document.querySelectorAll('#customApisList .api-adult:checked');

    const hasAdultSelected = adultBuiltinCheckboxes.length > 0 || customApiCheckboxes.length > 0;

    const yellowFilterToggle = document.getElementById('yellowFilterToggle');
    if (!yellowFilterToggle) return;
    const yellowFilterContainer = yellowFilterToggle.closest('div').parentNode;
    const filterDescription = yellowFilterContainer.querySelector('p.filter-description');

    // 如果选择了成人API，禁用黄色内容过滤器
    if (hasAdultSelected) {
        yellowFilterToggle.checked = false;
        yellowFilterToggle.disabled = true;
        localStorage.setItem('yellowFilterEnabled', 'false');

        // 添加禁用样式
        yellowFilterContainer.classList.add('filter-disabled');

        // 修改描述文字
        if (filterDescription) {
            filterDescription.innerHTML = '<strong class="text-pink-300">选中黄色资源站时无法启用此过滤</strong>';
        }

        // 移除提示信息（如果存在）
        const existingTooltip = yellowFilterContainer.querySelector('.filter-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
    } else {
        // 启用黄色内容过滤器
        yellowFilterToggle.disabled = false;
        yellowFilterContainer.classList.remove('filter-disabled');

        // 恢复原来的描述文字
        if (filterDescription) {
            filterDescription.innerHTML = '过滤"伦理片"等黄色内容';
        }

        // 移除提示信息
        const existingTooltip = yellowFilterContainer.querySelector('.filter-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
    }
}

// 渲染自定义API列表
function renderCustomAPIsList() {
    const container = document.getElementById('customApisList');
    if (!container) return;

    if (customAPIs.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500 text-center my-2">未添加自定义API</p>';
        return;
    }

    container.innerHTML = '';
    customAPIs.forEach((api, index) => {
        const apiItem = document.createElement('div');
        apiItem.className = 'flex items-center justify-between p-1 mb-1 bg-[#222] rounded';
        const textColorClass = api.isAdult ? 'text-pink-400' : 'text-white';
        const adultTag = api.isAdult ? '<span class="text-xs text-pink-400 mr-1">(18+)</span>' : '';
        // 新增 detail 地址显示
        const detailLine = api.detail ? `<div class="text-xs text-gray-400 truncate">detail: ${api.detail}</div>` : '';
        apiItem.innerHTML = `
            <div class="flex items-center flex-1 min-w-0">
                <input type="checkbox" id="custom_api_${index}" 
                       class="form-checkbox h-3 w-3 text-blue-600 mr-1 ${api.isAdult ? 'api-adult' : ''}" 
                       ${selectedAPIs.includes('custom_' + index) ? 'checked' : ''} 
                       data-custom-index="${index}">
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-medium ${textColorClass} truncate">
                        ${adultTag}${api.name}
                    </div>
                    <div class="text-xs text-gray-500 truncate">${api.url}</div>
                    ${detailLine}
                </div>
            </div>
            <div class="flex items-center">
                <button class="text-blue-500 hover:text-blue-700 text-xs px-1" onclick="editCustomApi(${index})">✎</button>
                <button class="text-red-500 hover:text-red-700 text-xs px-1" onclick="removeCustomApi(${index})">✕</button>
            </div>
        `;
        container.appendChild(apiItem);
        apiItem.querySelector('input').addEventListener('change', function () {
            updateSelectedAPIs();
            checkAdultAPIsSelected();
        });
    });
}

// 编辑自定义API
function editCustomApi(index) {
    if (index < 0 || index >= customAPIs.length) return;
    const api = customAPIs[index];
    document.getElementById('customApiName').value = api.name;
    document.getElementById('customApiUrl').value = api.url;
    document.getElementById('customApiDetail').value = api.detail || '';
    const isAdultInput = document.getElementById('customApiIsAdult');
    if (isAdultInput) isAdultInput.checked = api.isAdult || false;
    const form = document.getElementById('addCustomApiForm');
    if (form) {
        form.classList.remove('hidden');
        const buttonContainer = form.querySelector('div:last-child');
        buttonContainer.innerHTML = `
            <button onclick="updateCustomApi(${index})" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">更新</button>
            <button onclick="cancelEditCustomApi()" class="bg-[#444] hover:bg-[#555] text-white px-3 py-1 rounded text-xs">取消</button>
        `;
    }
}

// 更新自定义API
function updateCustomApi(index) {
    if (index < 0 || index >= customAPIs.length) return;
    const nameInput = document.getElementById('customApiName');
    const urlInput = document.getElementById('customApiUrl');
    const detailInput = document.getElementById('customApiDetail');
    const isAdultInput = document.getElementById('customApiIsAdult');
    const name = nameInput.value.trim();
    let url = urlInput.value.trim();
    const detail = detailInput ? detailInput.value.trim() : '';
    const isAdult = isAdultInput ? isAdultInput.checked : false;
    if (!name || !url) {
        showToast('请输入API名称和链接', 'warning');
        return;
    }
    if (!/^https?:\/\/.+/.test(url)) {
        showToast('API链接格式不正确，需以http://或https://开头', 'warning');
        return;
    }
    if (url.endsWith('/')) url = url.slice(0, -1);
    // 保存 detail 字段
    customAPIs[index] = { name, url, detail, isAdult };
    localStorage.setItem('customAPIs', JSON.stringify(customAPIs));
    renderCustomAPIsList();
    checkAdultAPIsSelected();
    restoreAddCustomApiButtons();
    nameInput.value = '';
    urlInput.value = '';
    if (detailInput) detailInput.value = '';
    if (isAdultInput) isAdultInput.checked = false;
    document.getElementById('addCustomApiForm').classList.add('hidden');
    showToast('已更新自定义API: ' + name, 'success');
}

// 取消编辑自定义API
function cancelEditCustomApi() {
    // 清空表单
    document.getElementById('customApiName').value = '';
    document.getElementById('customApiUrl').value = '';
    document.getElementById('customApiDetail').value = '';
    const isAdultInput = document.getElementById('customApiIsAdult');
    if (isAdultInput) isAdultInput.checked = false;

    // 隐藏表单
    document.getElementById('addCustomApiForm').classList.add('hidden');

    // 恢复添加按钮
    restoreAddCustomApiButtons();
}

// 恢复自定义API添加按钮
function restoreAddCustomApiButtons() {
    const form = document.getElementById('addCustomApiForm');
    const buttonContainer = form.querySelector('div:last-child');
    buttonContainer.innerHTML = `
        <button onclick="addCustomApi()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">添加</button>
        <button onclick="cancelAddCustomApi()" class="bg-[#444] hover:bg-[#555] text-white px-3 py-1 rounded text-xs">取消</button>
    `;
}

// 更新选中的API列表
function updateSelectedAPIs() {
    // 获取所有内置API复选框
    const builtInApiCheckboxes = document.querySelectorAll('#apiCheckboxes input:checked');

    // 获取选中的内置API
    const builtInApis = Array.from(builtInApiCheckboxes).map(input => input.dataset.api);

    // 获取选中的自定义API
    const customApiCheckboxes = document.querySelectorAll('#customApisList input:checked');
    const customApiIndices = Array.from(customApiCheckboxes).map(input => 'custom_' + input.dataset.customIndex);

    // 合并内置和自定义API
    selectedAPIs = [...builtInApis, ...customApiIndices];

    // 保存到localStorage
    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));

    // 更新显示选中的API数量
    updateSelectedApiCount();
}

// 更新选中的API数量显示
function updateSelectedApiCount() {
    const countEl = document.getElementById('selectedApiCount');
    if (countEl) {
        countEl.textContent = selectedAPIs.length;
    }
}

// 全选或取消全选API
function selectAllAPIs(selectAll = true, excludeAdult = false) {
    const checkboxes = document.querySelectorAll('#apiCheckboxes input[type="checkbox"]');

    checkboxes.forEach(checkbox => {
        if (excludeAdult && checkbox.classList.contains('api-adult')) {
            checkbox.checked = false;
        } else {
            checkbox.checked = selectAll;
        }
    });

    updateSelectedAPIs();
    checkAdultAPIsSelected();
}

// 显示添加自定义API表单
function showAddCustomApiForm() {
    const form = document.getElementById('addCustomApiForm');
    if (form) {
        form.classList.remove('hidden');
    }
}

// 取消添加自定义API - 修改函数来重用恢复按钮逻辑
function cancelAddCustomApi() {
    const form = document.getElementById('addCustomApiForm');
    if (form) {
        form.classList.add('hidden');
        document.getElementById('customApiName').value = '';
        document.getElementById('customApiUrl').value = '';
        document.getElementById('customApiDetail').value = '';
        const isAdultInput = document.getElementById('customApiIsAdult');
        if (isAdultInput) isAdultInput.checked = false;

        // 确保按钮是添加按钮
        restoreAddCustomApiButtons();
    }
}

// 添加自定义API
function addCustomApi() {
    const nameInput = document.getElementById('customApiName');
    const urlInput = document.getElementById('customApiUrl');
    const detailInput = document.getElementById('customApiDetail');
    const isAdultInput = document.getElementById('customApiIsAdult');
    const name = nameInput.value.trim();
    let url = urlInput.value.trim();
    const detail = detailInput ? detailInput.value.trim() : '';
    const isAdult = isAdultInput ? isAdultInput.checked : false;
    if (!name || !url) {
        showToast('请输入API名称和链接', 'warning');
        return;
    }
    if (!/^https?:\/\/.+/.test(url)) {
        showToast('API链接格式不正确，需以http://或https://开头', 'warning');
        return;
    }
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    // 保存 detail 字段
    customAPIs.push({ name, url, detail, isAdult });
    localStorage.setItem('customAPIs', JSON.stringify(customAPIs));
    const newApiIndex = customAPIs.length - 1;
    selectedAPIs.push('custom_' + newApiIndex);
    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));

    // 重新渲染自定义API列表
    renderCustomAPIsList();
    updateSelectedApiCount();
    checkAdultAPIsSelected();
    nameInput.value = '';
    urlInput.value = '';
    if (detailInput) detailInput.value = '';
    if (isAdultInput) isAdultInput.checked = false;
    document.getElementById('addCustomApiForm').classList.add('hidden');
    showToast('已添加自定义API: ' + name, 'success');
}

// 移除自定义API
function removeCustomApi(index) {
    if (index < 0 || index >= customAPIs.length) return;

    const apiName = customAPIs[index].name;

    // 从列表中移除API
    customAPIs.splice(index, 1);
    localStorage.setItem('customAPIs', JSON.stringify(customAPIs));

    // 从选中列表中移除此API
    const customApiId = 'custom_' + index;
    selectedAPIs = selectedAPIs.filter(id => id !== customApiId);

    // 更新大于此索引的自定义API索引
    selectedAPIs = selectedAPIs.map(id => {
        if (id.startsWith('custom_')) {
            const currentIndex = parseInt(id.replace('custom_', ''));
            if (currentIndex > index) {
                return 'custom_' + (currentIndex - 1);
            }
        }
        return id;
    });

    localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));

    // 重新渲染自定义API列表
    renderCustomAPIsList();

    // 更新选中的API数量
    updateSelectedApiCount();

    // 重新检查成人API选中状态
    checkAdultAPIsSelected();

    showToast('已移除自定义API: ' + apiName, 'info');
}

function toggleSettings(e) {
    const settingsPanel = document.getElementById('settingsPanel');
    if (!settingsPanel) return;

    if (settingsPanel.classList.contains('show')) {
        settingsPanel.classList.remove('show');
        settingsPanel.setAttribute('aria-hidden', 'true');
    } else {
        settingsPanel.classList.add('show');
        settingsPanel.setAttribute('aria-hidden', 'false');
        initAppLineModeSetting();
    }

    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
}

function updatePreferredContentModeButtons() {
    const preferredMode = localStorage.getItem(CONTENT_MODE_STORAGE_KEY) || 'vod';
    const vodButton = document.getElementById('contentModeVodSetting');
    const liveButton = document.getElementById('contentModeLiveSetting');
    if (!vodButton || !liveButton) return;

    const activeClass = 'px-3 py-2 rounded-lg border border-white bg-white text-black text-sm transition-colors';
    const inactiveClass = 'px-3 py-2 rounded-lg border border-[#333] bg-[#191919] text-gray-300 text-sm transition-colors hover:border-white hover:text-white';
    vodButton.className = preferredMode === 'live' ? inactiveClass : activeClass;
    liveButton.className = preferredMode === 'live' ? activeClass : inactiveClass;
    vodButton.setAttribute('aria-checked', preferredMode === 'live' ? 'false' : 'true');
    liveButton.setAttribute('aria-checked', preferredMode === 'live' ? 'true' : 'false');
}

function initAppLineModeSetting() {
    const setting = document.getElementById('appLineModeSetting');
    const select = document.getElementById('appLineModeSelect');
    if (!setting || !select || !window.JMTVApp) return;

    try {
        if (typeof window.JMTVApp.hasBackupLine !== 'function' || !window.JMTVApp.hasBackupLine()) {
            return;
        }
        const mode = typeof window.JMTVApp.getLineMode === 'function' ? window.JMTVApp.getLineMode() : 'primary';
        select.value = mode === 'backup' ? 'backup' : 'primary';
        setting.classList.remove('hidden');
        setting.classList.add('block');
    } catch (error) {
        console.warn('初始化 App 线路设置失败:', error);
    }
}

function setAppLineMode(mode) {
    if (!window.JMTVApp || typeof window.JMTVApp.setLineMode !== 'function') {
        return;
    }
    const lineMode = mode === 'backup' ? 'backup' : 'primary';
    try {
        window.JMTVApp.setLineMode(lineMode);
    } catch (error) {
        console.error('切换 App 线路失败:', error);
        if (typeof showToast === 'function') {
            showToast('切换 App 线路失败', 'error');
        }
    }
}

function setPreferredContentMode(mode) {
    const preferredMode = mode === 'live' ? 'live' : 'vod';
    localStorage.setItem(CONTENT_MODE_STORAGE_KEY, preferredMode);
    updatePreferredContentModeButtons();

    const targetPath = preferredMode === 'live' ? '/live' : '/';
    if (window.location.pathname !== targetPath) {
        window.location.assign(targetPath);
    }
}

// 设置事件监听器
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    // 回车搜索
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            revealYellowFilterSetting(this.value.trim());
        });
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                search();
            }
        });
    }

    // 点击外部关闭设置面板和历史记录面板
    document.addEventListener('click', function (e) {
        // 关闭设置面板
        const settingsPanel = document.querySelector('#settingsPanel.show');
        const settingsButton = document.querySelector('#settingsPanel .close-btn');

        if (settingsPanel && settingsButton &&
            !settingsPanel.contains(e.target) &&
            !settingsButton.contains(e.target)) {
            settingsPanel.classList.remove('show');
            settingsPanel.setAttribute('aria-hidden', 'true');
        }

        // 关闭历史记录面板
        const historyPanel = document.querySelector('#historyPanel.show');
        const historyButton = document.querySelector('#historyPanel .close-btn');

        if (historyPanel && historyButton &&
            !historyPanel.contains(e.target) &&
            !historyButton.contains(e.target)) {
            historyPanel.classList.remove('show');
        }
    });

    // 黄色内容过滤开关事件绑定
    const yellowFilterToggle = document.getElementById('yellowFilterToggle');
    if (yellowFilterToggle) {
        yellowFilterToggle.addEventListener('change', function (e) {
            localStorage.setItem('yellowFilterEnabled', e.target.checked);

            // 控制黄色内容接口的显示状态
            const adultdiv = document.getElementById('adultdiv');
            if (adultdiv) {
                if (e.target.checked === true) {
                    adultdiv.style.display = 'none';
                } else if (e.target.checked === false) {
                    adultdiv.style.display = ''
                }
            } else {
                // 添加成人API列表
                addAdultAPI();
            }
        });
    }

    // 广告过滤开关事件绑定
    const adFilterToggle = document.getElementById('adFilterToggle');
    if (adFilterToggle) {
        adFilterToggle.addEventListener('change', function (e) {
            localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, e.target.checked);
        });
    }
}

function revealYellowFilterSetting(query) {
    if (query !== YELLOW_FILTER_UNLOCK_QUERY) {
        return false;
    }
    const yellowFilterSetting = document.getElementById('yellowFilterSetting');
    if (yellowFilterSetting) {
        yellowFilterSetting.classList.remove('hidden');
        yellowFilterSetting.classList.add('flex');
    }
    setTimeout(() => {
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel) {
            settingsPanel.classList.add('show');
            settingsPanel.setAttribute('aria-hidden', 'false');
            initAppLineModeSetting();
        }
        if (yellowFilterSetting) {
            yellowFilterSetting.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 0);
    return true;
}

// 重置搜索区域
function resetSearchArea() {
    if (typeof stopLivePlayback === 'function') {
        stopLivePlayback();
    }
    document.body.classList.remove('jmtv-tv-mode');
    document.body.classList.remove('jmtv-phone-mode');
    const liveArea = document.getElementById('liveArea');
    if (liveArea) {
        liveArea.classList.add('hidden');
    }
    const searchArea = document.getElementById('searchArea');
    if (searchArea) {
        searchArea.classList.remove('hidden');
    }
    if (typeof setLiveModeButton === 'function') {
        setLiveModeButton(false);
    }

    // 清理搜索结果
    document.getElementById('results').innerHTML = '';
    document.getElementById('searchInput').value = '';

    // 恢复搜索区域的样式
    document.getElementById('searchArea').classList.add('flex-1');
    document.getElementById('searchArea').classList.remove('mb-8');
    document.getElementById('resultsArea').classList.add('hidden');

    // 确保页脚正确显示，移除相对定位
    const footer = document.querySelector('.footer');
    if (footer) {
        footer.style.position = '';
    }

    // 如果有豆瓣功能，检查是否需要显示豆瓣推荐区域
    if (typeof updateDoubanVisibility === 'function') {
        updateDoubanVisibility();
    }

    // 重置URL为主页
    try {
        window.history.pushState(
            {},
            `JMTV - 免费在线视频搜索与观看平台`,
            `/`
        );
        // 更新页面标题
        document.title = `JMTV - 免费在线视频搜索与观看平台`;
    } catch (e) {
        console.error('更新浏览器历史失败:', e);
    }
}

// 获取自定义API信息
function getCustomApiInfo(customApiIndex) {
    const index = parseInt(customApiIndex);
    if (isNaN(index) || index < 0 || index >= customAPIs.length) {
        return null;
    }
    return customAPIs[index];
}

function normalizeSearchText(text) {
    return (text || '')
        .toString()
        .toLowerCase()
        .replace(/[\s\-_:：·.。!！?？,，、"'“”‘’《》<>【】\[\]()（）]/g, '');
}

function isSearchResultMatched(item, query) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
        return true;
    }
    const normalizedName = normalizeSearchText(item?.vod_name || '');
    return normalizedName.includes(normalizedQuery);
}

function renderSearchResultCards(items) {
    return items.map(item => {
        const safeId = item.vod_id ? item.vod_id.toString().replace(/[^\w-]/g, '') : '';
        const safeName = (item.vod_name || '').toString()
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const sourceInfo = item.source_name ?
            `<span class="bg-[#222] text-xs px-1.5 py-0.5 rounded-full">${item.source_name}</span>` : '';
        const sourceCode = item.source_code || '';
        const apiUrlAttr = item.api_url ?
            `data-api-url="${item.api_url.replace(/"/g, '&quot;')}"` : '';
        const hasCover = item.vod_pic && item.vod_pic.startsWith('http');
        const coverUrl = hasCover && window.ProxyAuth?.addAuthToProxyUrlSync ?
            window.ProxyAuth.addAuthToProxyUrlSync(PROXY_URL + encodeURIComponent(item.vod_pic)) :
            'image/nomedia.png';

        return `
            <div class="card-hover bg-[#111] rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02] h-full shadow-sm hover:shadow-md"
                 onclick="showDetails('${safeId}','${safeName}','${sourceCode}')" ${apiUrlAttr}>
                <div class="flex h-full">
                    ${hasCover ? `
                    <div class="relative flex-shrink-0 search-card-img-container">
                        <img src="${coverUrl}" alt="${safeName}"
                             class="h-full w-full object-cover transition-transform hover:scale-110"
                             onerror="this.onerror=null; this.src='https://via.placeholder.com/300x450?text=无封面'; this.classList.add('object-contain');"
                             loading="lazy">
                        <div class="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent"></div>
                    </div>` : ''}

                    <div class="p-2 flex flex-col flex-grow">
                        <div class="flex-grow">
                            <h3 class="font-semibold mb-2 break-words line-clamp-2 ${hasCover ? '' : 'text-center'}" title="${safeName}">${safeName}</h3>
                            <div class="flex flex-wrap ${hasCover ? '' : 'justify-center'} gap-1 mb-2">
                                ${(item.type_name || '').toString().replace(/</g, '&lt;') ?
                `<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-blue-500 text-blue-300">
                                      ${(item.type_name || '').toString().replace(/</g, '&lt;')}
                                  </span>` : ''}
                                ${(item.vod_year || '') ?
                `<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-purple-500 text-purple-300">
                                      ${item.vod_year}
                                  </span>` : ''}
                            </div>
                            <p class="text-gray-400 line-clamp-2 overflow-hidden ${hasCover ? '' : 'text-center'} mb-2">
                                ${(item.vod_remarks || '暂无介绍').toString().replace(/</g, '&lt;')}
                            </p>
                        </div>

                        <div class="flex justify-between items-center mt-1 pt-1 border-t border-gray-800">
                            ${sourceInfo ? `<div>${sourceInfo}</div>` : '<div></div>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 搜索功能 - 修改为支持多选API和多页结果
async function search() {
    // 强化的密码保护校验 - 防止绕过
    try {
        if (window.ensurePasswordProtection) {
            window.ensurePasswordProtection();
        } else {
            // 兼容性检查
            if (window.isPasswordProtected && window.isPasswordVerified) {
                if (window.isPasswordProtected() && !window.isPasswordVerified()) {
                    showPasswordModal && showPasswordModal();
                    return;
                }
            }
        }
    } catch (error) {
        console.warn('Password protection check failed:', error.message);
        return;
    }
    const query = document.getElementById('searchInput').value.trim();

    if (!query) {
        showToast('请输入搜索内容', 'info');
        return;
    }

    if (revealYellowFilterSetting(query)) {
        showToast('黄色内容过滤已显示', 'success');
        return;
    }

    const availableSelectedAPIs = getSelectedAvailableAPIs();
    if (availableSelectedAPIs.length === 0) {
        showToast('请至少选择一个API源', 'warning');
        return;
    }
    const searchConfig = typeof SEARCH_EXECUTION_CONFIG !== 'undefined' ? SEARCH_EXECUTION_CONFIG : {};
    const searchConcurrency = searchConfig.concurrency || 4;
    const searchTimeout = searchConfig.timeout || 18000;
    const searchApiIds = availableSelectedAPIs;

    try {
        // 保存搜索历史
        saveSearchHistory(query);

        const searchResultsCount = document.getElementById('searchResultsCount');
        const resultsDiv = document.getElementById('results');
        const progressStatus = document.getElementById('searchProgressStatus');
        let renderedCount = 0;
        let nextApiIndex = 0;
        const deadline = Date.now() + searchTimeout;
        const yellowFilterEnabled = localStorage.getItem('yellowFilterEnabled') === 'true';
        const banned = ['伦理片', '福利', '里番动漫', '门事件', '萝莉少女', '制服诱惑', '国产传媒', 'cosplay', '黑丝诱惑', '无码', '日本无码', '有码', '日本有码', 'SWAG', '网红主播', '色情片', '同性片', '福利视频', '福利片'];

        if (searchResultsCount) {
            searchResultsCount.textContent = '0';
        }
        if (progressStatus) {
            progressStatus.classList.remove('hidden');
            progressStatus.classList.add('flex');
        }
        document.getElementById('searchArea').classList.remove('flex-1');
        document.getElementById('searchArea').classList.add('mb-8');
        document.getElementById('resultsArea').classList.remove('hidden');
        const doubanArea = document.getElementById('doubanArea');
        if (doubanArea) {
            doubanArea.classList.add('hidden');
        }
        resultsDiv.innerHTML = '';

        try {
            const encodedQuery = encodeURIComponent(query);
            window.history.pushState(
                { search: query },
                `搜索: ${query} - JMTV`,
                `/s=${encodedQuery}`
            );
            document.title = `搜索: ${query} - JMTV`;
        } catch (e) {
            console.error('更新浏览器历史失败:', e);
        }

        const appendResults = (results) => {
            let filtered = (Array.isArray(results) ? results : [])
                .filter(item => isSearchResultMatched(item, query));
            if (yellowFilterEnabled) {
                filtered = filtered.filter(item => {
                    const typeName = item.type_name || '';
                    return !banned.some(keyword => typeName.includes(keyword));
                });
            }
            if (filtered.length === 0) {
                return;
            }
            resultsDiv.insertAdjacentHTML('beforeend', renderSearchResultCards(filtered));
            renderedCount += filtered.length;
            if (searchResultsCount) {
                searchResultsCount.textContent = renderedCount;
            }
        };

        const workerCount = Math.min(searchConcurrency, searchApiIds.length);
        const workers = Array.from({ length: workerCount }, async () => {
            while (nextApiIndex < searchApiIds.length) {
                const remainingTime = deadline - Date.now();
                if (remainingTime <= 0) {
                    return;
                }
                const apiId = searchApiIds[nextApiIndex++];
                const results = await Promise.race([
                    searchByAPIAndKeyWord(apiId, query),
                    new Promise(resolve => setTimeout(() => resolve(null), remainingTime))
                ]);
                appendResults(results);
            }
        });

        await Promise.all(workers);
        if (Date.now() >= deadline && nextApiIndex < searchApiIds.length) {
            showToast('部分数据源响应较慢，已先显示当前搜索结果', 'info');
        }

        if (renderedCount === 0) {
            resultsDiv.innerHTML = `
                <div class="col-span-full text-center py-16">
                    <svg class="mx-auto h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 class="mt-2 text-lg font-medium text-gray-400">没有找到匹配的结果</h3>
                    <p class="mt-1 text-sm text-gray-500">请尝试其他关键词或更换数据源</p>
                </div>
            `;
            if (searchResultsCount) {
                searchResultsCount.textContent = '0';
            }
        } else {
            if (progressStatus) {
                progressStatus.classList.add('hidden');
                progressStatus.classList.remove('flex');
            }
        }
    } catch (error) {
        console.error('搜索错误:', error);
        if (error.name === 'AbortError') {
            showToast('搜索请求超时，请检查网络连接', 'error');
        } else {
            showToast('搜索请求失败，请稍后重试', 'error');
        }
    } finally {
        const progressStatus = document.getElementById('searchProgressStatus');
        if (progressStatus) {
            progressStatus.classList.add('hidden');
            progressStatus.classList.remove('flex');
        }
    }
}

// 切换清空按钮的显示状态
function toggleClearButton() {
    const searchInput = document.getElementById('searchInput');
    const clearButton = document.getElementById('clearSearchInput');
    if (searchInput.value !== '') {
        clearButton.classList.remove('hidden');
    } else {
        clearButton.classList.add('hidden');
    }
}

// 清空搜索框内容
function clearSearchInput() {
    const searchInput = document.getElementById('searchInput');
    searchInput.value = '';
    const clearButton = document.getElementById('clearSearchInput');
    clearButton.classList.add('hidden');
}

// 劫持搜索框的value属性以检测外部修改
function hookInput() {
    const input = document.getElementById('searchInput');
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

    // 重写 value 属性的 getter 和 setter
    Object.defineProperty(input, 'value', {
        get: function () {
            // 确保读取时返回字符串（即使原始值为 undefined/null）
            const originalValue = descriptor.get.call(this);
            return originalValue != null ? String(originalValue) : '';
        },
        set: function (value) {
            // 显式将值转换为字符串后写入
            const strValue = String(value);
            descriptor.set.call(this, strValue);
            this.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    // 初始化输入框值为空字符串（避免初始值为 undefined）
    input.value = '';
}
document.addEventListener('DOMContentLoaded', hookInput);

// 显示详情 - 修改为支持自定义API
async function showDetails(id, vod_name, sourceCode) {
    // 密码保护校验
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            showPasswordModal && showPasswordModal();
            return;
        }
    }
    if (!id) {
        showToast('视频ID无效', 'error');
        return;
    }

    showLoading();
    try {
        // 构建API参数
        let apiParams = '';

        // 处理自定义API源
        if (sourceCode.startsWith('custom_')) {
            const customIndex = sourceCode.replace('custom_', '');
            const customApi = getCustomApiInfo(customIndex);
            if (!customApi) {
                showToast('自定义API配置无效', 'error');
                hideLoading();
                return;
            }
            // 传递 detail 字段
            if (customApi.detail) {
                apiParams = '&customApi=' + encodeURIComponent(customApi.url) + '&customDetail=' + encodeURIComponent(customApi.detail) + '&source=custom';
            } else {
                apiParams = '&customApi=' + encodeURIComponent(customApi.url) + '&source=custom';
            }
        } else {
            // 内置API
            apiParams = '&source=' + sourceCode;
        }

        // Add a timestamp to prevent caching
        const timestamp = new Date().getTime();
        const cacheBuster = `&_t=${timestamp}`;
        const response = await fetch(`/api/detail?id=${encodeURIComponent(id)}${apiParams}${cacheBuster}`);

        const data = await response.json();

        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalContent = document.getElementById('modalContent');

        // 显示来源信息
        const sourceName = data.videoInfo && data.videoInfo.source_name ?
            ` <span class="text-sm font-normal text-gray-400">(${data.videoInfo.source_name})</span>` : '';

        // 不对标题进行截断处理，允许完整显示
        modalTitle.innerHTML = `<span class="break-words">${vod_name || '未知视频'}</span>${sourceName}`;
        currentVideoTitle = vod_name || '未知视频';

        if (data.episodes && data.episodes.length > 0) {
            // 构建详情信息HTML
            let detailInfoHtml = '';
            if (data.videoInfo) {
                // Prepare description text, strip HTML and trim whitespace
                const descriptionText = data.videoInfo.desc ? data.videoInfo.desc.replace(/<[^>]+>/g, '').trim() : '';

                // Check if there's any actual grid content
                const hasGridContent = data.videoInfo.type || data.videoInfo.year || data.videoInfo.area || data.videoInfo.director || data.videoInfo.actor || data.videoInfo.remarks;

                if (hasGridContent || descriptionText) { // Only build if there's something to show
                    detailInfoHtml = `
                <div class="modal-detail-info">
                    ${hasGridContent ? `
                    <div class="detail-grid">
                        ${data.videoInfo.type ? `<div class="detail-item"><span class="detail-label">类型:</span> <span class="detail-value">${data.videoInfo.type}</span></div>` : ''}
                        ${data.videoInfo.year ? `<div class="detail-item"><span class="detail-label">年份:</span> <span class="detail-value">${data.videoInfo.year}</span></div>` : ''}
                        ${data.videoInfo.area ? `<div class="detail-item"><span class="detail-label">地区:</span> <span class="detail-value">${data.videoInfo.area}</span></div>` : ''}
                        ${data.videoInfo.director ? `<div class="detail-item"><span class="detail-label">导演:</span> <span class="detail-value">${data.videoInfo.director}</span></div>` : ''}
                        ${data.videoInfo.actor ? `<div class="detail-item"><span class="detail-label">主演:</span> <span class="detail-value">${data.videoInfo.actor}</span></div>` : ''}
                        ${data.videoInfo.remarks ? `<div class="detail-item"><span class="detail-label">备注:</span> <span class="detail-value">${data.videoInfo.remarks}</span></div>` : ''}
                    </div>` : ''}
                    ${descriptionText ? `
                    <div class="detail-desc">
                        <p class="detail-label">简介:</p>
                        <p class="detail-desc-content">${descriptionText}</p>
                    </div>` : ''}
                </div>
                `;
                }
            }

            currentEpisodes = data.episodes;
            currentEpisodeIndex = 0;

            modalContent.innerHTML = `
                ${detailInfoHtml}
                <div class="flex flex-wrap items-center justify-between mb-4 gap-2">
                    <div class="flex items-center gap-2">
                        <button onclick="toggleEpisodeOrder('${sourceCode}', '${id}')" 
                                class="px-3 py-1.5 bg-[#333] hover:bg-[#444] border border-[#444] rounded text-sm transition-colors flex items-center gap-1">
                            <svg class="w-4 h-4 transform ${episodesReversed ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
                            </svg>
                            <span>${episodesReversed ? '正序排列' : '倒序排列'}</span>
                        </button>
                        <span class="text-gray-400 text-sm">共 ${data.episodes.length} 集</span>
                    </div>
                    <button onclick="copyLinks()" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors">
                        复制链接
                    </button>
                </div>
                <div id="episodesGrid" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    ${renderEpisodes(vod_name, sourceCode, id)}
                </div>
            `;
        } else {
            modalContent.innerHTML = `
                <div class="text-center py-8">
                    <div class="text-red-400 mb-2">❌ 未找到播放资源</div>
                    <div class="text-gray-500 text-sm">该视频可能暂时无法播放，请尝试其他视频</div>
                </div>
            `;
        }

        modal.classList.remove('hidden');
    } catch (error) {
        console.error('获取详情错误:', error);
        showToast('获取详情失败，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

// 更新播放视频函数，修改为使用/watch路径而不是直接打开player.html
function playVideo(url, vod_name, sourceCode, episodeIndex = 0, vodId = '') {
    // 密码保护校验
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            showPasswordModal && showPasswordModal();
            return;
        }
    }

    // 获取当前路径作为返回页面
    let currentPath = window.location.href;

    // 构建播放页面URL，使用watch.html作为中间跳转页
    let watchUrl = `watch.html?id=${vodId || ''}&source=${sourceCode || ''}&url=${encodeURIComponent(url)}&index=${episodeIndex}&title=${encodeURIComponent(vod_name || '')}`;

    // 添加返回URL参数
    if (currentPath.includes('index.html') || currentPath.endsWith('/')) {
        watchUrl += `&back=${encodeURIComponent(currentPath)}`;
    }

    // 保存当前状态到localStorage
    try {
        localStorage.setItem('currentVideoTitle', vod_name || '未知视频');
        localStorage.setItem('currentEpisodes', JSON.stringify(currentEpisodes));
        localStorage.setItem('currentEpisodeIndex', episodeIndex);
        localStorage.setItem('currentSourceCode', sourceCode || '');
        localStorage.setItem('lastPlayTime', Date.now());
        localStorage.setItem('lastSearchPage', currentPath);
        localStorage.setItem('lastPageUrl', currentPath);  // 确保保存返回页面URL
    } catch (e) {
        console.error('保存播放状态失败:', e);
    }

    // 在当前标签页中打开播放页面
    window.location.href = watchUrl;
}

// 弹出播放器页面
function showVideoPlayer(url) {
    // 在打开播放器前，隐藏详情弹窗
    const detailModal = document.getElementById('modal');
    if (detailModal) {
        detailModal.classList.add('hidden');
    }
    // 临时隐藏搜索结果和豆瓣区域，防止高度超出播放器而出现滚动条
    document.getElementById('resultsArea').classList.add('hidden');
    document.getElementById('doubanArea').classList.add('hidden');
    // 在框架中打开播放页面
    videoPlayerFrame = document.createElement('iframe');
    videoPlayerFrame.id = 'VideoPlayerFrame';
    videoPlayerFrame.className = 'fixed w-full h-screen z-40';
    videoPlayerFrame.src = url;
    document.body.appendChild(videoPlayerFrame);
    // 将焦点移入iframe
    videoPlayerFrame.focus();
}

// 关闭播放器页面
function closeVideoPlayer(home = false) {
    videoPlayerFrame = document.getElementById('VideoPlayerFrame');
    if (videoPlayerFrame) {
        videoPlayerFrame.remove();
        // 恢复搜索结果显示
        document.getElementById('resultsArea').classList.remove('hidden');
        // 关闭播放器时也隐藏详情弹窗
        const detailModal = document.getElementById('modal');
        if (detailModal) {
            detailModal.classList.add('hidden');
        }
        // 如果启用豆瓣区域则显示豆瓣区域
        if (localStorage.getItem('doubanEnabled') === 'true') {
            document.getElementById('doubanArea').classList.remove('hidden');
        }
    }
    if (home) {
        // 刷新主页
        window.location.href = '/'
    }
}

// 播放上一集
function playPreviousEpisode(sourceCode) {
    if (currentEpisodeIndex > 0) {
        const prevIndex = currentEpisodeIndex - 1;
        const prevUrl = currentEpisodes[prevIndex];
        playVideo(prevUrl, currentVideoTitle, sourceCode, prevIndex);
    }
}

// 播放下一集
function playNextEpisode(sourceCode) {
    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        const nextIndex = currentEpisodeIndex + 1;
        const nextUrl = currentEpisodes[nextIndex];
        playVideo(nextUrl, currentVideoTitle, sourceCode, nextIndex);
    }
}

// 处理播放器加载错误
function handlePlayerError() {
    hideLoading();
    showToast('视频播放加载失败，请尝试其他视频源', 'error');
}

// 辅助函数用于渲染剧集按钮（使用当前的排序状态）
function renderEpisodes(vodName, sourceCode, vodId) {
    const episodes = episodesReversed ? [...currentEpisodes].reverse() : currentEpisodes;
    return episodes.map((episode, index) => {
        // 根据倒序状态计算真实的剧集索引
        const realIndex = episodesReversed ? currentEpisodes.length - 1 - index : index;
        return `
            <button id="episode-${realIndex}" onclick="playVideo('${episode}','${vodName.replace(/"/g, '&quot;')}', '${sourceCode}', ${realIndex}, '${vodId}')" 
                    class="px-4 py-2 bg-[#222] hover:bg-[#333] border border-[#333] rounded-lg transition-colors text-center episode-btn">
                ${realIndex + 1}
            </button>
        `;
    }).join('');
}

// 复制视频链接到剪贴板
function copyLinks() {
    const episodes = episodesReversed ? [...currentEpisodes].reverse() : currentEpisodes;
    const linkList = episodes.join('\r\n');
    navigator.clipboard.writeText(linkList).then(() => {
        showToast('播放链接已复制', 'success');
    }).catch(err => {
        showToast('复制失败，请检查浏览器权限', 'error');
    });
}

// 切换排序状态的函数
function toggleEpisodeOrder(sourceCode, vodId) {
    episodesReversed = !episodesReversed;
    // 重新渲染剧集区域，使用 currentVideoTitle 作为视频标题
    const episodesGrid = document.getElementById('episodesGrid');
    if (episodesGrid) {
        episodesGrid.innerHTML = renderEpisodes(currentVideoTitle, sourceCode, vodId);
    }

    // 更新按钮文本和箭头方向
    const toggleBtn = document.querySelector(`button[onclick="toggleEpisodeOrder('${sourceCode}', '${vodId}')"]`);
    if (toggleBtn) {
        toggleBtn.querySelector('span').textContent = episodesReversed ? '正序排列' : '倒序排列';
        const arrowIcon = toggleBtn.querySelector('svg');
        if (arrowIcon) {
            arrowIcon.style.transform = episodesReversed ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    }
}

// 从URL导入配置
async function importConfigFromUrl() {
    // 创建模态框元素
    let modal = document.getElementById('importUrlModal');
    if (modal) {
        document.body.removeChild(modal);
    }

    modal = document.createElement('div');
    modal.id = 'importUrlModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-40';

    modal.innerHTML = `
        <div class="bg-[#191919] rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative">
            <button id="closeUrlModal" class="absolute top-4 right-4 text-gray-400 hover:text-white text-xl">&times;</button>
            
	            <h3 class="text-xl font-bold mb-4">从URL导入配置</h3>
	            
	            <div class="mb-4">
	                <input type="text" id="configUrl" placeholder="输入配置文件URL或资源站API URL" 
	                       class="w-full px-3 py-2 bg-[#222] border border-[#333] rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
	            </div>
            
            <div class="flex justify-end space-x-2">
                <button id="confirmUrlImport" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">导入</button>
                <button id="cancelUrlImport" class="bg-[#444] hover:bg-[#555] text-white px-4 py-2 rounded">取消</button>
            </div>
        </div>`;

    document.body.appendChild(modal);

    // 关闭按钮事件
    document.getElementById('closeUrlModal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    // 取消按钮事件
    document.getElementById('cancelUrlImport').addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    // 确认导入按钮事件
    document.getElementById('confirmUrlImport').addEventListener('click', async () => {
        const url = document.getElementById('configUrl').value.trim();
        if (!url) {
            showToast('请输入配置文件URL', 'warning');
            return;
        }

        // 验证URL格式
        try {
            const urlObj = new URL(url);
            if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
                showToast('URL必须以http://或https://开头', 'warning');
                return;
            }
        } catch (e) {
            showToast('URL格式不正确', 'warning');
            return;
        }

	        showLoading('正在从URL导入配置...');

	        try {
	            // 获取配置内容：资源站常返回 text/html，所以不能只依赖响应头判断 JSON。
	            const importUrl = window.ProxyAuth?.addAuthToProxyUrl ?
	                await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(url)) :
	                url;
	            const response = await fetch(importUrl, {
	                mode: 'cors',
	                headers: {
	                    'Accept': 'application/json'
	                }
	            });
	            if (!response.ok) throw '获取配置文件失败';

	            const content = await response.text();
	            let config;
	            try {
	                config = JSON.parse(content);
	            } catch (parseError) {
	                throw '响应不是有效的JSON格式';
	            }

	            if (config.name === 'JMTV-Settings') {
	                // 验证哈希
	                const dataHash = await sha256(JSON.stringify(config.data));
	                if (dataHash !== config.hash) throw '配置文件哈希值不匹配';

	                // 导入配置
	                for (let item in config.data) {
	                    localStorage.setItem(item, config.data[item]);
	                }

	                showToast('配置文件导入成功，3 秒后自动刷新本页面。', 'success');
	                setTimeout(() => {
	                    window.location.reload();
	                }, 3000);
	                return;
	            }

	            if (config && Array.isArray(config.list) && (config.code !== undefined || config.page !== undefined || config.total !== undefined)) {
	                const urlObj = new URL(url);
	                let apiUrl = `${urlObj.origin}${urlObj.pathname}`;
	                if (apiUrl.endsWith('/')) {
	                    apiUrl = apiUrl.slice(0, -1);
	                }

	                const existedIndex = customAPIs.findIndex(api => api.url === apiUrl);
	                if (existedIndex !== -1) {
	                    const existedSelectedId = `custom_${existedIndex}`;
	                    if (!selectedAPIs.includes(existedSelectedId)) {
	                        selectedAPIs.push(existedSelectedId);
	                        localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
	                    }
	                    renderCustomAPIsList();
	                    updateSelectedApiCount();
	                    showToast('该资源站API已存在，已自动选中。', 'info');
	                    return;
	                }

	                const hostName = urlObj.hostname.replace(/^www\./, '');
	                const apiName = config.msg && config.msg !== '数据列表' ? config.msg : hostName;
	                customAPIs.push({ name: apiName, url: apiUrl, detail: '', isAdult: false });
	                localStorage.setItem('customAPIs', JSON.stringify(customAPIs));

	                const newApiIndex = customAPIs.length - 1;
	                selectedAPIs.push(`custom_${newApiIndex}`);
	                localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));

	                renderCustomAPIsList();
	                updateSelectedApiCount();
	                checkAdultAPIsSelected();
	                showToast(`已添加自定义API: ${apiName}`, 'success');
	                return;
	            }

	            throw '配置文件格式不正确：仅支持JMTV设置文件或苹果CMS资源站API响应';
	        } catch (error) {
	            const message = typeof error === 'string' ? error : '导入配置失败';
	            showToast(`从URL导入配置出错 (${message})`, 'error');
        } finally {
            hideLoading();
            document.body.removeChild(modal);
        }
    });

    // 点击模态框外部关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// 配置文件导入功能
async function importConfig() {
    showImportBox(async (file) => {
        try {
            // 检查文件类型
            if (!(file.type === 'application/json' || file.name.endsWith('.json'))) throw '文件类型不正确';

            // 检查文件大小
            if (file.size > 1024 * 1024 * 10) throw new Error('文件大小超过 10MB');

            // 读取文件内容
            const content = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject('文件读取失败');
                reader.readAsText(file);
            });

            // 解析并验证配置
            const config = JSON.parse(content);
            if (config.name !== 'JMTV-Settings') throw '配置文件格式不正确';

            // 验证哈希
            const dataHash = await sha256(JSON.stringify(config.data));
            if (dataHash !== config.hash) throw '配置文件哈希值不匹配';

            // 导入配置
            for (let item in config.data) {
                localStorage.setItem(item, config.data[item]);
            }

            showToast('配置文件导入成功，3 秒后自动刷新本页面。', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        } catch (error) {
            const message = typeof error === 'string' ? error : '配置文件格式错误';
            showToast(`配置文件读取出错 (${message})`, 'error');
        }
    });
}

// 配置文件导出功能
async function exportConfig() {
    // 存储配置数据
    const config = {};
    const items = {};

    const settingsToExport = [
        'selectedAPIs',
        'customAPIs',
        'yellowFilterEnabled',
        'adFilteringEnabled',
        'doubanEnabled',
        CONTENT_MODE_STORAGE_KEY,
        'hasInitializedDefaults'
    ];

    // 导出设置项
    settingsToExport.forEach(key => {
        const value = localStorage.getItem(key);
        if (value !== null) {
            items[key] = value;
        }
    });

    // 导出历史记录
    const viewingHistory = localStorage.getItem('viewingHistory');
    if (viewingHistory) {
        items['viewingHistory'] = viewingHistory;
    }

    const searchHistory = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (searchHistory) {
        items[SEARCH_HISTORY_KEY] = searchHistory;
    }

    const times = Date.now().toString();
    config['name'] = 'JMTV-Settings';  // 配置文件名，用于校验
    config['time'] = times;               // 配置文件生成时间
    config['cfgVer'] = '1.0.0';           // 配置文件版本
    config['data'] = items;               // 配置文件数据
    config['hash'] = await sha256(JSON.stringify(config['data']));  // 计算数据的哈希值，用于校验

    // 将配置数据保存为 JSON 文件
    saveStringAsFile(JSON.stringify(config), 'JMTV-Settings_' + times + '.json');
}

// 将字符串保存为文件
function saveStringAsFile(content, fileName) {
    // 创建Blob对象并指定类型
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    // 生成临时URL
    const url = window.URL.createObjectURL(blob);
    // 创建<a>标签并触发下载
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    // 清理临时对象
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// 移除Node.js的require语句，因为这是在浏览器环境中运行的

