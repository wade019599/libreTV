const liveState = {
    loaded: false,
    loading: false,
    channels: [],
    groups: [],
    activeGroup: '全部',
    hls: null,
    currentSource: 'txt',
    currentChannelId: '',
    playMode: 'direct',
    playToken: 0,
    playWatchdog: null,
    playProgressTimer: null,
    videoFrameCallbackId: null,
    tvControlsTimer: null,
    currentPlaybackUrl: '',
    resumeFailHandler: null,
    recovering: false
};

const LIVE_FIRST_FRAME_TIMEOUT = 12000;
const LIVE_STALL_TIMEOUT = 15000;
const LIVE_FREEZE_TIMEOUT = 6000;
const LIVE_PAUSE_TIMEOUT = 2500;
const LIVE_AUTO_SWITCH_BLOCKED_SOURCE_PATTERN = /推流|rtmp|srt|gb28181|webrtc/i;
const LIVE_AUTO_SWITCH_BLOCKED_SOURCE_VALUES = ['hls_txt', 'hls_m3u'];
const APP_LIVE_SYNC_SETTINGS_KEY = 'appLiveSyncSettings';
const APP_BUNDLED_LIVE_SOURCE_URL = '/iptv/result.txt';
const APP_BUNDLED_LIVE_SOURCE_VERSION = '20260710-v1';
const APP_BUNDLED_LIVE_SUBSCRIPTIONS_URL = '/iptv/config/subscribe.txt';
const APP_LIVE_SYNC_DEFAULTS = Object.freeze({
    speedTestEnabled: false,
    rateFilterEnabled: false,
    resolutionFilterEnabled: false,
    concurrency: 10,
    timeoutSeconds: 5,
    minRateMbps: 0.1,
    minResolution: '1280x720',
    maxResolution: '3840x2160'
});

function getAppLiveSyncSettings() {
    let saved = {};
    try {
        saved = JSON.parse(localStorage.getItem(APP_LIVE_SYNC_SETTINGS_KEY) || '{}');
    } catch (error) {
        console.warn('读取直播源同步参数失败:', error);
    }

    const normalizeNumber = (value, fallback, min, max, integer = false) => {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        const normalized = Math.min(max, Math.max(min, number));
        return integer ? Math.round(normalized) : Math.round(normalized * 100) / 100;
    };
    const normalizeResolution = (value, fallback) => {
        const match = String(value || '').trim().match(/^(\d{2,5})\s*[xX×]\s*(\d{2,5})$/);
        return match ? `${Number(match[1])}x${Number(match[2])}` : fallback;
    };

    return {
        speedTestEnabled: saved.speedTestEnabled === true,
        rateFilterEnabled: saved.rateFilterEnabled === true,
        resolutionFilterEnabled: saved.resolutionFilterEnabled === true,
        concurrency: normalizeNumber(saved.concurrency, APP_LIVE_SYNC_DEFAULTS.concurrency, 1, 20, true),
        timeoutSeconds: normalizeNumber(saved.timeoutSeconds, APP_LIVE_SYNC_DEFAULTS.timeoutSeconds, 1, 60, true),
        minRateMbps: normalizeNumber(saved.minRateMbps, APP_LIVE_SYNC_DEFAULTS.minRateMbps, 0, 1000),
        minResolution: normalizeResolution(saved.minResolution, APP_LIVE_SYNC_DEFAULTS.minResolution),
        maxResolution: normalizeResolution(saved.maxResolution, APP_LIVE_SYNC_DEFAULTS.maxResolution)
    };
}

function initAppLiveSyncSettingsControls(settings = APP_LIVE_SYNC_DEFAULTS) {
    const values = {
        liveSyncSpeedTestEnabled: settings.speedTestEnabled,
        liveSyncRateFilterEnabled: settings.rateFilterEnabled,
        liveSyncResolutionFilterEnabled: settings.resolutionFilterEnabled,
        liveSyncConcurrency: settings.concurrency,
        liveSyncTimeout: settings.timeoutSeconds,
        liveSyncMinRate: settings.minRateMbps,
        liveSyncMinResolution: settings.minResolution,
        liveSyncMaxResolution: settings.maxResolution
    };
    Object.entries(values).forEach(([id, value]) => {
        const control = document.getElementById(id);
        if (!control) return;
        if (control.type === 'checkbox') control.checked = Boolean(value);
        else control.value = String(value);
    });

    const status = document.getElementById('appLiveSyncSettingsStatus');
    if (status) {
        status.className = 'text-xs text-gray-500';
        if (settings.speedTestEnabled) {
            status.textContent = `测速已开启，并发 ${settings.concurrency}，超时 ${settings.timeoutSeconds} 秒`;
        } else if (settings.rateFilterEnabled || settings.resolutionFilterEnabled) {
            status.textContent = '测速未开启，速率和分辨率过滤暂不生效';
        } else {
            status.textContent = '测速未开启，同步时保留全部已解析线路';
        }
    }
}

function saveAppLiveSyncSettings(silent = false) {
    const status = document.getElementById('appLiveSyncSettingsStatus');
    const minResolution = String(document.getElementById('liveSyncMinResolution')?.value || '').trim();
    const maxResolution = String(document.getElementById('liveSyncMaxResolution')?.value || '').trim();
    const minMatch = minResolution.match(/^(\d{2,5})\s*[xX×]\s*(\d{2,5})$/);
    const maxMatch = maxResolution.match(/^(\d{2,5})\s*[xX×]\s*(\d{2,5})$/);
    if (!minMatch || !maxMatch) {
        if (status) {
            status.className = 'text-xs text-red-400';
            status.textContent = '分辨率格式应为宽x高，例如 1280x720';
        }
        return false;
    }

    const minWidth = Number(minMatch[1]);
    const minHeight = Number(minMatch[2]);
    const maxWidth = Number(maxMatch[1]);
    const maxHeight = Number(maxMatch[2]);
    if (minWidth > maxWidth || minHeight > maxHeight) {
        if (status) {
            status.className = 'text-xs text-red-400';
            status.textContent = '最大分辨率不能低于最小分辨率';
        }
        return false;
    }

    const readNumber = (id, fallback, min, max, integer = false) => {
        const number = Number(document.getElementById(id)?.value);
        if (!Number.isFinite(number)) return fallback;
        const normalized = Math.min(max, Math.max(min, number));
        return integer ? Math.round(normalized) : Math.round(normalized * 100) / 100;
    };
    const settings = {
        speedTestEnabled: document.getElementById('liveSyncSpeedTestEnabled')?.checked === true,
        rateFilterEnabled: document.getElementById('liveSyncRateFilterEnabled')?.checked === true,
        resolutionFilterEnabled: document.getElementById('liveSyncResolutionFilterEnabled')?.checked === true,
        concurrency: readNumber('liveSyncConcurrency', APP_LIVE_SYNC_DEFAULTS.concurrency, 1, 20, true),
        timeoutSeconds: readNumber('liveSyncTimeout', APP_LIVE_SYNC_DEFAULTS.timeoutSeconds, 1, 60, true),
        minRateMbps: readNumber('liveSyncMinRate', APP_LIVE_SYNC_DEFAULTS.minRateMbps, 0, 1000),
        minResolution: `${minWidth}x${minHeight}`,
        maxResolution: `${maxWidth}x${maxHeight}`
    };
    localStorage.setItem(APP_LIVE_SYNC_SETTINGS_KEY, JSON.stringify(settings));
    const normalizedValues = {
        liveSyncConcurrency: settings.concurrency,
        liveSyncTimeout: settings.timeoutSeconds,
        liveSyncMinRate: settings.minRateMbps,
        liveSyncMinResolution: settings.minResolution,
        liveSyncMaxResolution: settings.maxResolution
    };
    Object.entries(normalizedValues).forEach(([id, value]) => {
        const control = document.getElementById(id);
        if (control) control.value = String(value);
    });
    if (!silent && status) {
        status.className = 'text-xs text-green-400';
        status.textContent = '直播源同步参数已保存';
    }
    return true;
}

function resetAppLiveSyncSettings() {
    localStorage.setItem(APP_LIVE_SYNC_SETTINGS_KEY, JSON.stringify(APP_LIVE_SYNC_DEFAULTS));
    initAppLiveSyncSettingsControls(APP_LIVE_SYNC_DEFAULTS);
    const status = document.getElementById('appLiveSyncSettingsStatus');
    if (status) {
        status.className = 'text-xs text-green-400';
        status.textContent = '已恢复默认同步参数';
    }
}

function getAppLiveSourceCache() {
    try {
        return JSON.parse(localStorage.getItem(APP_LIVE_SOURCE_CACHE_KEY) || 'null');
    } catch (error) {
        console.warn('读取App直播源缓存失败:', error);
        return null;
    }
}

function makeAppLiveChannelId(group, name, index) {
    const text = `${group}|${name}|${index}`;
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return `app_${Math.abs(hash).toString(36)}_${index}`;
}

function parseAppLivePlaylist(text, type = 'txt') {
    const channels = [];
    const groups = [];
    const channelIndex = new Map();
    const addGroup = group => {
        const groupName = String(group || '未分组').trim() || '未分组';
        if (!groups.includes(groupName)) {
            groups.push(groupName);
        }
        return groupName;
    };
    const addChannel = (name, group, url, logo = '') => {
        const channelName = String(name || '').trim();
        const channelUrl = String(url || '').trim();
        if (!channelName || !/^https?:\/\//i.test(channelUrl)) {
            return;
        }
        const groupName = addGroup(group);
        const key = `${groupName.toLowerCase()}|${channelName.toLowerCase()}`;
        const existing = channelIndex.get(key);
        if (existing) {
            if (!existing.urls.includes(channelUrl)) {
                existing.urls.push(channelUrl);
            }
            return;
        }
        const channel = {
            id: makeAppLiveChannelId(groupName, channelName, channels.length),
            name: channelName,
            group: groupName,
            logo,
            url: channelUrl,
            urls: [channelUrl]
        };
        channels.push(channel);
        channelIndex.set(key, channel);
    };

    if (type === 'm3u' || /^#EXTM3U/i.test(String(text || '').trim())) {
        let pending = null;
        String(text || '').split(/\r?\n/).forEach(rawLine => {
            const line = rawLine.trim();
            if (!line) {
                return;
            }
            if (line.startsWith('#EXTINF')) {
                const groupMatch = line.match(/group-title="([^"]*)"/i);
                const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
                const commaIndex = line.lastIndexOf(',');
                pending = {
                    name: commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : '未知频道',
                    group: groupMatch ? groupMatch[1].trim() : '未分组',
                    logo: logoMatch ? logoMatch[1].trim() : ''
                };
                return;
            }
            if (line.startsWith('#')) {
                return;
            }
            if (pending) {
                addChannel(pending.name, pending.group, line, pending.logo);
                pending = null;
            }
        });
        return { channels, groups };
    }

    let currentGroup = '未分组';
    String(text || '').split(/\r?\n/).forEach(rawLine => {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            return;
        }
        const parts = line.split(/[,，]/);
        if (parts.length >= 2 && parts[1].trim() === '#genre#') {
            currentGroup = addGroup(parts[0]);
            return;
        }
        const separatorIndex = line.search(/[,，]/);
        if (separatorIndex <= 0) {
            return;
        }
        const channelName = line.slice(0, separatorIndex).trim();
        const channelUrl = line.slice(separatorIndex + 1).split('$')[0].trim();
        addChannel(channelName, currentGroup, channelUrl);
    });
    return { channels, groups };
}

async function filterAppLiveChannels(channels, settings, onProgress) {
    const tasks = [];
    const passedUrls = channels.map(() => []);
    channels.forEach((channel, channelIndex) => {
        const urls = Array.isArray(channel.urls) && channel.urls.length ? channel.urls : [channel.url];
        urls.forEach(url => {
            if (/^https?:\/\//i.test(String(url || '').trim())) {
                tasks.push({ channelIndex, url: String(url).trim() });
            }
        });
    });

    const stats = {
        total: tasks.length,
        tested: 0,
        passed: 0,
        rejected: 0,
        failed: 0,
        rateRejected: 0,
        resolutionRejected: 0,
        unknownResolution: 0
    };
    if (!tasks.length) {
        return { channels: [], groups: [], stats };
    }

    const minResolution = settings.minResolution.split('x').map(Number);
    const maxResolution = settings.maxResolution.split('x').map(Number);
    const maxReadBytes = 1024 * 1024;
    let taskCursor = 0;
    const workerCount = Math.min(settings.concurrency, tasks.length);

    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (taskCursor < tasks.length) {
            const task = tasks[taskCursor];
            taskCursor += 1;
            let detectedResolution = null;
            let measuredRate = 0;
            let linePassed = false;
            let failed = false;

            try {
                let requestUrl = task.url;
                for (let depth = 0; depth < 3; depth += 1) {
                    const proxiedUrl = window.ProxyAuth?.addAuthToProxyUrl
                        ? await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(requestUrl))
                        : PROXY_URL + encodeURIComponent(requestUrl);
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), settings.timeoutSeconds * 1000);
                    const startedAt = performance.now();
                    let response;
                    let bytes = new Uint8Array(0);
                    try {
                        response = await fetch(proxiedUrl, {
                            headers: { 'Accept': 'application/vnd.apple.mpegurl,video/*,*/*' },
                            signal: controller.signal
                        });
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}`);
                        }

                        if (response.body?.getReader) {
                            const reader = response.body.getReader();
                            const chunks = [];
                            let received = 0;
                            while (received < maxReadBytes) {
                                const result = await reader.read();
                                if (result.done) break;
                                const remaining = maxReadBytes - received;
                                const chunk = result.value.byteLength > remaining
                                    ? result.value.slice(0, remaining)
                                    : result.value;
                                chunks.push(chunk);
                                received += chunk.byteLength;
                            }
                            try {
                                await reader.cancel();
                            } catch {
                                // 部分 WebView 不支持主动取消已完成的读取。
                            }
                            bytes = new Uint8Array(received);
                            let offset = 0;
                            chunks.forEach(chunk => {
                                bytes.set(chunk, offset);
                                offset += chunk.byteLength;
                            });
                        } else {
                            const buffer = new Uint8Array(await response.arrayBuffer());
                            bytes = buffer.byteLength > maxReadBytes ? buffer.slice(0, maxReadBytes) : buffer;
                        }
                    } finally {
                        clearTimeout(timeoutId);
                    }

                    const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
                    const responseText = new TextDecoder('utf-8').decode(bytes);
                    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
                    const isPlaylist = contentType.includes('mpegurl')
                        || contentType.includes('m3u')
                        || /\.m3u8?(?:$|[?#])/i.test(requestUrl)
                        || /^\s*#EXTM3U/i.test(responseText);
                    if (!isPlaylist) {
                        measuredRate = bytes.byteLength / elapsedSeconds / 1024 / 1024;
                        linePassed = bytes.byteLength > 0;
                        break;
                    }

                    const resolutionMatch = responseText.match(/RESOLUTION\s*=\s*(\d+)x(\d+)/i);
                    if (resolutionMatch && !detectedResolution) {
                        detectedResolution = [Number(resolutionMatch[1]), Number(resolutionMatch[2])];
                    }
                    const mediaLine = responseText.split(/\r?\n/)
                        .map(line => line.trim())
                        .find(line => line && !line.startsWith('#'));
                    if (!mediaLine) {
                        throw new Error('直播清单中没有可测速的媒体地址');
                    }

                    const mediaUrl = new URL(mediaLine, requestUrl);
                    if (mediaUrl.hostname === 'jmtv.local' && mediaUrl.pathname === '/api/live/media') {
                        requestUrl = mediaUrl.searchParams.get('url') || '';
                    } else {
                        requestUrl = mediaUrl.href;
                    }
                    if (!/^https?:\/\//i.test(requestUrl)) {
                        throw new Error('直播清单中的媒体地址无效');
                    }
                    if (depth === 2) {
                        throw new Error('直播清单嵌套层级过深');
                    }
                }

                if (!linePassed) {
                    throw new Error('直播线路没有返回有效媒体数据');
                }
                if (settings.rateFilterEnabled && measuredRate < settings.minRateMbps) {
                    stats.rateRejected += 1;
                } else if (settings.resolutionFilterEnabled && detectedResolution
                    && (detectedResolution[0] < minResolution[0]
                        || detectedResolution[1] < minResolution[1]
                        || detectedResolution[0] > maxResolution[0]
                        || detectedResolution[1] > maxResolution[1])) {
                    stats.resolutionRejected += 1;
                } else {
                    if (settings.resolutionFilterEnabled && !detectedResolution) {
                        stats.unknownResolution += 1;
                    }
                    passedUrls[task.channelIndex].push(task.url);
                    stats.passed += 1;
                    linePassed = true;
                }
            } catch (error) {
                failed = true;
                console.warn(`直播线路测速失败：${task.url}`, error);
            }

            stats.tested += 1;
            if (failed) stats.failed += 1;
            if (failed || !linePassed || !passedUrls[task.channelIndex].includes(task.url)) {
                stats.rejected += 1;
            }
            if (typeof onProgress === 'function') {
                onProgress(stats.tested, stats.total);
            }
        }
    }));

    const filteredChannels = channels.flatMap((channel, channelIndex) => {
        const urls = passedUrls[channelIndex];
        return urls.length ? [{ ...channel, url: urls[0], urls }] : [];
    });
    const groups = [...new Set(filteredChannels.map(channel => channel.group || '未分组'))];
    return { channels: filteredChannels, groups, stats };
}

async function syncLiveSourceFromUrl(url, options = {}) {
    const sourceUrl = String(url || '').trim();
    const useBundledSubscriptions = !sourceUrl
        && typeof isLocalAppBundle === 'function'
        && isLocalAppBundle();
    if (sourceUrl && !/^https?:\/\/.+/i.test(sourceUrl)) {
        if (!options.silent && typeof showToast === 'function') {
            showToast('直播源地址格式不正确', 'warning');
        }
        return false;
    }
    if (!sourceUrl && !useBundledSubscriptions) {
        if (!options.silent && typeof showToast === 'function') {
            showToast('请输入直播源地址', 'warning');
        }
        return false;
    }

    if (!options.silent && typeof showLoading === 'function') {
        showLoading(useBundledSubscriptions ? '正在读取内置订阅...' : '正在同步直播源...');
    }
    try {
        const syncSettings = getAppLiveSyncSettings();
        let sourceEntries = [{ url: sourceUrl, userAgent: '' }];
        if (useBundledSubscriptions) {
            const subscriptionsResponse = await fetch(APP_BUNDLED_LIVE_SUBSCRIPTIONS_URL, { cache: 'no-store' });
            if (!subscriptionsResponse.ok) {
                throw new Error(`内置订阅读取失败：HTTP ${subscriptionsResponse.status}`);
            }
            const seenUrls = new Set();
            sourceEntries = [];
            for (const rawLine of (await subscriptionsResponse.text()).split(/\r?\n/)) {
                const line = rawLine.replace(/^\uFEFF/, '').trim();
                if (/^\[WHITELIST\]$/i.test(line)) {
                    break;
                }
                if (!line || line.startsWith('#')) {
                    continue;
                }
                const match = line.match(/^(https?:\/\/\S+?)(?:\s+UA="([^"]*)")?\s*$/i);
                if (!match || seenUrls.has(match[1])) {
                    continue;
                }
                seenUrls.add(match[1]);
                sourceEntries.push({ url: match[1], userAgent: match[2] || '' });
            }
            if (!sourceEntries.length) {
                throw new Error('内置订阅列表没有有效地址');
            }
        }

        const sourceResults = [];
        const batchSize = useBundledSubscriptions ? 4 : 1;
        for (let offset = 0; offset < sourceEntries.length; offset += batchSize) {
            const batch = sourceEntries.slice(offset, offset + batchSize);
            if (useBundledSubscriptions && !options.silent && typeof showLoading === 'function') {
                showLoading(`正在同步内置订阅 ${Math.min(offset + batch.length, sourceEntries.length)}/${sourceEntries.length}`);
            }
            const batchResults = await Promise.all(batch.map(async entry => {
                let proxyUrl = PROXY_URL + encodeURIComponent(entry.url);
                if (entry.userAgent) {
                    proxyUrl += `?ua=${encodeURIComponent(entry.userAgent)}`;
                }
                const proxiedUrl = window.ProxyAuth?.addAuthToProxyUrl
                    ? await window.ProxyAuth.addAuthToProxyUrl(proxyUrl)
                    : proxyUrl;
                const sourceController = new AbortController();
                const sourceTimeoutId = setTimeout(() => sourceController.abort(), syncSettings.timeoutSeconds * 1000);
                try {
                    const response = await fetch(proxiedUrl, {
                        headers: { 'Accept': 'text/plain,application/vnd.apple.mpegurl,*/*' },
                        signal: sourceController.signal
                    });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    const content = await response.text();
                    const type = /\.m3u8?(?:$|\?)/i.test(entry.url) || /^#EXTM3U/i.test(content.trim()) ? 'm3u' : 'txt';
                    const parsed = parseAppLivePlaylist(content, type);
                    if (!parsed.channels.length) {
                        throw new Error('未解析到有效频道');
                    }
                    return { entry, type, parsed, error: null };
                } catch (error) {
                    console.warn(`订阅同步失败：${entry.url}`, error);
                    return { entry, type: '', parsed: null, error };
                } finally {
                    clearTimeout(sourceTimeoutId);
                }
            }));
            sourceResults.push(...batchResults);
        }

        const successfulResults = sourceResults.filter(result => result.parsed?.channels?.length);
        if (!successfulResults.length) {
            const firstError = sourceResults.find(result => result.error)?.error;
            throw firstError || new Error('所有直播订阅均同步失败');
        }
        const mergedChannels = dedupeLiveChannels(successfulResults.flatMap(result => result.parsed.channels));
        const mergedGroups = [...new Set([
            ...successfulResults.flatMap(result => result.parsed.groups || []),
            ...mergedChannels.map(channel => channel.group || '未分组')
        ])];
        const filtered = syncSettings.speedTestEnabled
            ? await filterAppLiveChannels(mergedChannels, syncSettings, (completed, total) => {
                if (!options.silent && typeof showLoading === 'function') {
                    showLoading(`正在测速 ${completed}/${total}`);
                }
            })
            : { channels: mergedChannels, groups: mergedGroups, stats: null };
        if (!filtered.channels.length) {
            throw new Error('测速或过滤后没有可用频道，请调整同步参数');
        }
        const cache = {
            sourceUrl,
            sourceType: useBundledSubscriptions ? 'subscriptions' : successfulResults[0].type,
            sourceCount: successfulResults.length,
            sourceTotal: sourceEntries.length,
            updatedAt: Date.now(),
            channels: filtered.channels,
            groups: filtered.groups,
            syncSettings,
            syncStats: filtered.stats
        };
        localStorage.setItem(APP_LIVE_SOURCE_URL_KEY, sourceUrl);
        localStorage.setItem(APP_LIVE_SOURCE_CACHE_KEY, JSON.stringify(cache));
        if (typeof updateAppManualSyncStatus === 'function') {
            updateAppManualSyncStatus();
        }
        if (!options.silent && typeof showToast === 'function') {
            const sourceText = useBundledSubscriptions
                ? `，订阅成功 ${successfulResults.length}/${sourceEntries.length}`
                : '';
            const statsText = filtered.stats
                ? `，线路通过 ${filtered.stats.passed}/${filtered.stats.total}，过滤 ${filtered.stats.rejected}`
                : '';
            const resolutionText = filtered.stats?.unknownResolution
                ? `，${filtered.stats.unknownResolution} 条线路未识别分辨率并已保留`
                : '';
            showToast(`直播源同步完成：${filtered.channels.length} 个频道${sourceText}${statsText}${resolutionText}`, 'success');
        }
        return true;
    } catch (error) {
        console.error('同步直播源失败:', error);
        if (!options.silent && typeof showToast === 'function') {
            const message = error?.name === 'AbortError'
                ? '响应超时，请增大直播源同步参数中的响应超时'
                : error.message || error;
            showToast(`同步直播源失败：${message}`, 'error');
        }
        return false;
    } finally {
        if (!options.silent && typeof hideLoading === 'function') {
            hideLoading();
        }
    }
}

async function syncLiveSourceFromSettings() {
    if (!saveAppLiveSyncSettings(true)) {
        return;
    }
    const input = document.getElementById('liveSourceUrlInput');
    const sourceUrl = input ? input.value.trim() : '';
    const success = await syncLiveSourceFromUrl(sourceUrl);
    if (success && liveState.loaded) {
        liveState.loaded = false;
        await loadLiveChannels(false);
    }
}

async function openLiveSourceSyncDialog() {
    const savedUrl = localStorage.getItem(APP_LIVE_SOURCE_URL_KEY) || '';
    const success = await syncLiveSourceFromUrl(savedUrl);
    if (success) {
        liveState.loaded = false;
        await loadLiveChannels(false);
    }
}

function isTvAppWebView() {
    const ua = navigator.userAgent || '';
    return /JMTV-TV|Android\s+TV|AFT[A-Z0-9]*|SmartTV|Tizen|Web0S/i.test(ua);
}

function isAndroidAppWebView() {
    return /JMTV-Android/i.test(navigator.userAgent || '');
}

function isAutoSwitchableLiveSource(sourceOption) {
    if (!sourceOption || !sourceOption.value) {
        return false;
    }
    const sourceValue = String(sourceOption.value || '').trim();
    const sourceLabel = String(sourceOption.label || '').trim();
    if (LIVE_AUTO_SWITCH_BLOCKED_SOURCE_VALUES.includes(sourceValue)) {
        return false;
    }
    return !LIVE_AUTO_SWITCH_BLOCKED_SOURCE_PATTERN.test(`${sourceValue} ${sourceLabel}`);
}

function applyLiveDeviceClass(active) {
    const ua = navigator.userAgent || '';
    const isTv = /JMTV-TV|Android\s+TV|AFT[A-Z0-9]*|SmartTV|Tizen|Web0S/i.test(ua);
    const isPhone = !isTv && (/JMTV-Phone|JMTV-Android|Android|iPhone|Mobile/i.test(ua) || window.matchMedia('(max-width: 700px)').matches);
    document.body.classList.toggle('jmtv-tv-mode', Boolean(active) && isTv);
    document.body.classList.toggle('jmtv-phone-mode', Boolean(active) && isPhone);
}

function showTvLiveControls(autoHide = true) {
    if (!isTvAppWebView()) return;
    document.body.classList.remove('jmtv-tv-controls-hidden');
    if (liveState.tvControlsTimer) {
        clearTimeout(liveState.tvControlsTimer);
        liveState.tvControlsTimer = null;
    }
    if (autoHide) {
        liveState.tvControlsTimer = setTimeout(() => {
            if (isTvAppWebView() && !document.getElementById('liveArea')?.classList.contains('hidden')) {
                document.body.classList.add('jmtv-tv-controls-hidden');
            }
        }, 3000);
    }
}

function clearTvLiveControlsTimer() {
    if (liveState.tvControlsTimer) {
        clearTimeout(liveState.tvControlsTimer);
        liveState.tvControlsTimer = null;
    }
    document.body.classList.remove('jmtv-tv-controls-hidden');
}

function setLiveModeButton(active) {
    const vodBtn = document.getElementById('vodModeBtn');
    const liveBtn = document.getElementById('liveModeBtn');
    if (!vodBtn || !liveBtn) return;

    vodBtn.className = active
        ? 'px-4 py-2 rounded-md text-sm text-gray-300 hover:text-white transition-colors'
        : 'px-4 py-2 rounded-md text-sm bg-white text-black transition-colors';
    liveBtn.className = active
        ? 'px-4 py-2 rounded-md text-sm bg-white text-black transition-colors'
        : 'px-4 py-2 rounded-md text-sm text-gray-300 hover:text-white transition-colors';
}

function showLivePage() {
    applyLiveDeviceClass(true);
    const searchArea = document.getElementById('searchArea');
    const resultsArea = document.getElementById('resultsArea');
    const doubanArea = document.getElementById('doubanArea');
    const liveArea = document.getElementById('liveArea');

    if (searchArea) searchArea.classList.add('hidden');
    if (resultsArea) resultsArea.classList.add('hidden');
    if (doubanArea) doubanArea.classList.add('hidden');
    if (liveArea) liveArea.classList.remove('hidden');
    setLiveModeButton(true);

    try {
        window.history.pushState({ live: true }, '电视直播 - JMTV', '/live');
        document.title = '电视直播 - JMTV';
    } catch (error) {
        console.error('更新直播页面地址失败:', error);
    }

    if (!liveState.loaded && !liveState.loading) {
        loadLiveChannels(false);
    }
    showTvLiveControls(true);
}

function showVodPage() {
    stopLivePlayback();
    applyLiveDeviceClass(false);
    clearTvLiveControlsTimer();
    const liveArea = document.getElementById('liveArea');
    const searchArea = document.getElementById('searchArea');
    if (liveArea) liveArea.classList.add('hidden');
    if (searchArea) searchArea.classList.remove('hidden');
    setLiveModeButton(false);
    if (typeof resetToHome === 'function') {
        resetToHome();
    }
}

async function loadLiveChannels(force = false) {
    const status = document.getElementById('liveStatus');
    const notice = document.getElementById('liveConfigNotice');
    const sourceSelect = document.getElementById('liveSourceSelect');
    const source = sourceSelect ? sourceSelect.value : liveState.currentSource;
    liveState.currentSource = source;
    liveState.loading = true;
    if (status) status.textContent = '正在加载直播频道...';
    if (notice) notice.classList.add('hidden');

    try {
        if (typeof isLocalAppBundle === 'function' && isLocalAppBundle()) {
            let cache = getAppLiveSourceCache();
            if (force && cache?.sourceUrl) {
                await syncLiveSourceFromUrl(cache.sourceUrl, { silent: true });
                cache = getAppLiveSourceCache();
            }
            const bundledCacheExpired = cache?.sourceType === 'bundled'
                && cache.bundledSourceVersion !== APP_BUNDLED_LIVE_SOURCE_VERSION;
            if (!cache || !Array.isArray(cache.channels) || cache.channels.length === 0 || bundledCacheExpired) {
                // 首次使用直接读取 APK 内置直播源，用户后续手动同步的数据仍优先保留。
                const response = await fetch(APP_BUNDLED_LIVE_SOURCE_URL, { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`内置直播源读取失败：HTTP ${response.status}`);
                }
                const parsed = parseAppLivePlaylist(await response.text(), 'txt');
                if (!parsed.channels.length) {
                    throw new Error('内置直播源未解析到有效频道');
                }
                cache = {
                    sourceUrl: '',
                    sourceType: 'bundled',
                    bundledSourceVersion: APP_BUNDLED_LIVE_SOURCE_VERSION,
                    updatedAt: Date.now(),
                    channels: parsed.channels,
                    groups: parsed.groups
                };
                localStorage.setItem(APP_LIVE_SOURCE_CACHE_KEY, JSON.stringify(cache));
            }
            if (!cache || !Array.isArray(cache.channels) || cache.channels.length === 0) {
                throw new Error('没有可用的直播源，请在设置中手动同步');
            }

            liveState.playMode = 'proxy';
            liveState.channels = dedupeLiveChannels(cache.channels);
            const groupNames = [];
            (Array.isArray(cache.groups) ? cache.groups : []).forEach(group => {
                const groupName = String(group || '').trim();
                if (groupName && !groupNames.includes(groupName)) {
                    groupNames.push(groupName);
                }
            });
            liveState.channels.forEach(channel => {
                const groupName = String(channel?.group || '未分组').trim() || '未分组';
                if (!groupNames.includes(groupName)) {
                    groupNames.push(groupName);
                }
            });
            liveState.groups = ['全部', ...groupNames];
            liveState.activeGroup = '全部';
            liveState.loaded = true;
            renderLiveGroups();
            renderLiveChannels();
            if (isTvAppWebView() && liveState.channels.length > 0 && !liveState.currentChannelId) {
                playLiveChannel(liveState.channels[0].id);
                setTimeout(() => focusCurrentLiveChannel(), 200);
            }
            if (status) {
                status.textContent = `本地频道 ${liveState.channels.length} 个`;
            }
            if (typeof updateAppManualSyncStatus === 'function') {
                updateAppManualSyncStatus();
            }
            return;
        }

        const response = await fetch(`/api/live/channels?source=${encodeURIComponent(source)}${force ? '&force=1' : ''}`, {
            headers: { 'Accept': 'application/json' }
        });
        const data = await response.json();
        if (!response.ok || data.code !== 200) {
            throw new Error(data.msg || '直播频道加载失败');
        }

        liveState.playMode = data.playMode === 'proxy' ? 'proxy' : 'direct';
        liveState.channels = dedupeLiveChannels(Array.isArray(data.channels) ? data.channels : []);
        const groupNames = [];
        (Array.isArray(data.groups) ? data.groups : []).forEach(group => {
            const groupName = String(group || '').trim();
            if (groupName && !groupNames.includes(groupName)) {
                groupNames.push(groupName);
            }
        });
        liveState.channels.forEach(channel => {
            const groupName = String(channel?.group || '未分组').trim() || '未分组';
            if (!groupNames.includes(groupName)) {
                groupNames.push(groupName);
            }
        });
        liveState.groups = ['全部', ...groupNames];
        liveState.activeGroup = '全部';
        liveState.loaded = true;
        renderLiveGroups();
        renderLiveChannels();
        if (isTvAppWebView() && liveState.channels.length > 0 && !liveState.currentChannelId) {
            playLiveChannel(liveState.channels[0].id);
            setTimeout(() => focusCurrentLiveChannel(), 200);
        }
        if (status) {
            const cacheText = data.cached ? '缓存' : '最新';
            status.textContent = `${cacheText}频道 ${liveState.channels.length} 个`;
        }
    } catch (error) {
        console.error('加载直播频道失败:', error);
        liveState.channels = [];
        liveState.groups = ['全部'];
        renderLiveGroups();
        renderLiveChannels();
        if (status) status.textContent = error.message;
        if (notice && /IPTV_API_BASE_URL|未配置/.test(error.message)) {
            notice.classList.remove('hidden');
        }
        if (typeof showToast === 'function') {
            showToast(error.message || '直播频道加载失败', 'error');
        }
    } finally {
        liveState.loading = false;
    }
}

function dedupeLiveChannels(channels) {
    const channelMap = new Map();
    channels.forEach(channel => {
        const name = String(channel?.name || '').trim().toLowerCase();
        const group = String(channel?.group || '未分组').trim().toLowerCase();
        const key = `${group}|${name}`;
        if (!name) {
            return;
        }
        const urls = getLiveChannelUrls(channel);
        if (urls.length === 0) {
            return;
        }
        if (channelMap.has(key)) {
            const existing = channelMap.get(key);
            urls.forEach(url => {
                if (!existing.urls.includes(url)) {
                    existing.urls.push(url);
                }
            });
            return;
        }
        channelMap.set(key, {
            ...channel,
            name: String(channel.name || '').trim(),
            group: String(channel.group || '未分组').trim() || '未分组',
            url: urls[0],
            urls
        });
    });
    return Array.from(channelMap.values());
}

function getLiveChannelUrls(channel) {
    const urls = Array.isArray(channel?.urls) ? channel.urls : [channel?.url];
    return urls
        .map(url => String(url || '').trim())
        .filter((url, index, list) => /^https?:\/\//i.test(url) && list.indexOf(url) === index);
}

function renderLiveGroups() {
    const groupList = document.getElementById('liveGroupList');
    if (!groupList) return;

    groupList.innerHTML = liveState.groups.map((group, index) => {
        const active = group === liveState.activeGroup;
        return `
            <button onclick="setLiveGroupByIndex(${index})"
                    class="live-group-button w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${active ? 'bg-white text-black is-active' : 'bg-[#191919] text-gray-300 hover:bg-[#222] hover:text-white'}">
                ${escapeLiveText(group)}
            </button>
        `;
    }).join('');
}

function setLiveGroupByIndex(index) {
    setLiveGroup(liveState.groups[index] || '全部');
}

function setLiveGroup(group) {
    liveState.activeGroup = group || '全部';
    renderLiveGroups();
    renderLiveChannels();
    if (isTvAppWebView()) {
        setTimeout(() => focusCurrentLiveChannel(), 0);
    }
}

function renderLiveChannels() {
    const grid = document.getElementById('liveChannelGrid');
    const searchInput = document.getElementById('liveSearchInput');
    if (!grid) return;

    const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const groupNames = [];
    liveState.channels.forEach(channel => {
        const groupName = String(channel?.group || '未分组').trim() || '未分组';
        if (!groupNames.includes(groupName)) {
            groupNames.push(groupName);
        }
    });
    const visibleGroups = liveState.activeGroup === '全部' ? groupNames : [liveState.activeGroup];
    const isAllGroups = liveState.activeGroup === '全部';

    const columns = visibleGroups.map(group => {
        const filtered = liveState.channels.filter(channel => {
            const displayName = String(channel?.name || '').trim();
            const channelGroup = String(channel?.group || '未分组').trim() || '未分组';
            if (!displayName || getLiveChannelUrls(channel).length === 0) {
                return false;
            }
            const groupMatched = channelGroup === group;
            const keywordMatched = !keyword || `${displayName} ${channelGroup}`.toLowerCase().includes(keyword);
            return groupMatched && keywordMatched;
        });

        if (filtered.length === 0) {
            return '';
        }

        const cards = filtered.map(channel => {
            const lineCount = getLiveChannelUrls(channel).length;
            const displayName = String(channel.name || '').trim();
            return `
                <button onclick="playLiveChannel('${channel.id}')"
                        data-live-channel-id="${channel.id}"
                        class="live-channel-card bg-[#111] border border-[#333] hover:border-white rounded-lg p-3 text-left transition-colors min-h-[84px] ${channel.id === liveState.currentChannelId ? 'is-playing' : ''}">
                    <span class="live-channel-name block text-white font-medium line-clamp-2">${escapeLiveText(displayName)}</span>
                    <span class="live-channel-meta block text-xs text-gray-500 mt-2 truncate">
                        <span class="live-channel-group">${escapeLiveText(channel.group || '未分组')}</span>
                        <span class="live-channel-lines">${lineCount} 条线路</span>
                    </span>
                </button>
            `;
        }).join('');

        return `
            <section class="live-channel-column" data-live-group="${escapeLiveText(group)}">
                <div class="live-channel-column-title">
                    <span>${escapeLiveText(group)}</span>
                    <span>${filtered.length}</span>
                </div>
                <div class="live-channel-list">
                    ${cards}
                </div>
            </section>
        `;
    }).filter(Boolean);

    grid.className = `live-channel-columns ${isAllGroups ? 'is-all-groups' : 'is-single-group'}${columns.length === 0 ? ' is-empty' : ''}`;

    if (columns.length === 0) {
        grid.innerHTML = `
            <div class="live-channel-empty text-center py-16 text-gray-500">
                ${liveState.activeGroup === '全部' ? '暂无匹配频道' : '该分类暂无可播放频道'}
            </div>
        `;
        return;
    }

    grid.innerHTML = columns.join('');
}

async function buildLiveMediaUrl(url, playlist = false) {
    if (typeof isLocalAppBundle === 'function' && isLocalAppBundle()) {
        const playlistQuery = playlist ? '&playlist=1' : '';
        return `/api/live/media?url=${encodeURIComponent(url)}${playlistQuery}`;
    }
    // 直连模式下，播放流量由客户机直接访问直播源，服务器只负责频道列表。
    if (liveState.playMode !== 'proxy') {
        return url;
    }
    if (!window.ProxyAuth || !window.ProxyAuth.getPasswordHash) {
        return url;
    }
    const hash = await window.ProxyAuth.getPasswordHash();
    if (!hash) {
        return url;
    }
    const playlistQuery = playlist ? '&playlist=1' : '';
    return `/api/live/media?url=${encodeURIComponent(url)}&auth=${encodeURIComponent(hash)}&t=${Date.now()}${playlistQuery}`;
}

function clearLiveWatchdog() {
    if (liveState.playWatchdog) {
        clearTimeout(liveState.playWatchdog);
        liveState.playWatchdog = null;
    }
}

function clearLiveProgressWatchdog() {
    if (liveState.playProgressTimer) {
        clearInterval(liveState.playProgressTimer);
        liveState.playProgressTimer = null;
    }
    const video = document.getElementById('liveVideo');
    if (video && liveState.videoFrameCallbackId && typeof video.cancelVideoFrameCallback === 'function') {
        try {
            video.cancelVideoFrameCallback(liveState.videoFrameCallbackId);
        } catch {
            // 部分 WebView 实现不完整，取消失败可忽略。
        }
    }
    liveState.videoFrameCallbackId = null;
}

function setLiveLoading(active, text = '正在加载') {
    const overlay = document.getElementById('liveLoadingOverlay');
    const label = document.getElementById('liveLoadingText');
    if (!overlay) return;
    if (label) {
        label.textContent = text;
    }
    overlay.classList.toggle('hidden', !active);
}

function setLiveVideoLoading(active) {
    const frame = document.querySelector('.live-video-frame');
    if (frame) {
        if (active) {
            frame.classList.remove('is-idle');
        }
        frame.classList.toggle('is-loading', Boolean(active));
    }
}

function setLiveVideoIdle(active) {
    const frame = document.querySelector('.live-video-frame');
    if (frame) {
        frame.classList.toggle('is-idle', Boolean(active));
    }
}

function setLiveResumeButton(active) {
    const button = document.getElementById('liveResumeButton');
    if (button) {
        button.classList.toggle('hidden', !active);
    }
}

function resumeLivePlayback() {
    const video = document.getElementById('liveVideo');
    if (!video || !liveState.currentPlaybackUrl) {
        return;
    }
    setLiveResumeButton(false);
    setLiveVideoIdle(false);
    setLiveLoading(true, '正在恢复播放');
    video.play().catch(error => {
        console.warn('直播手动恢复播放失败:', error);
        setLiveLoading(false);
        setLiveVideoIdle(true);
        setLiveResumeButton(true);
        if (typeof liveState.resumeFailHandler === 'function') {
            liveState.resumeFailHandler();
        }
    });
}

function armLiveWatchdog(video, timeout, onTimeout) {
    clearLiveWatchdog();
    liveState.playWatchdog = setTimeout(() => {
        liveState.playWatchdog = null;
        if (typeof onTimeout === 'function') {
            onTimeout();
        }
    }, timeout);
}

function bindLiveStallWatchdog(video, onTimeout) {
    const restartStallTimer = () => {
        setLiveLoading(true, '正在缓冲');
        clearLiveWatchdog();
        liveState.playWatchdog = setTimeout(() => {
            liveState.playWatchdog = null;
            if (!video.paused && typeof onTimeout === 'function') {
                onTimeout();
            }
        }, LIVE_STALL_TIMEOUT);
    };
    video.onwaiting = restartStallTimer;
    video.onstalled = restartStallTimer;
    video.onplaying = () => {
        clearLiveWatchdog();
        setLiveResumeButton(false);
        setLiveVideoIdle(false);
        setLiveVideoLoading(false);
        setLiveLoading(false);
    };
    video.oncanplay = () => {
        clearLiveWatchdog();
        setLiveResumeButton(false);
        setLiveVideoIdle(false);
        setLiveVideoLoading(false);
        setLiveLoading(false);
    };
    video.onloadeddata = () => {
        clearLiveWatchdog();
        setLiveResumeButton(false);
        setLiveVideoIdle(false);
        setLiveVideoLoading(false);
        setLiveLoading(false);
    };
    video.onpause = () => {
        clearLiveWatchdog();
        liveState.playWatchdog = setTimeout(() => {
            liveState.playWatchdog = null;
            if (!video.ended && video.paused && liveState.currentPlaybackUrl) {
                setLiveVideoIdle(true);
                setLiveResumeButton(true);
            }
        }, LIVE_PAUSE_TIMEOUT);
    };
}

function bindLiveProgressWatchdog(video, onTimeout) {
    clearLiveProgressWatchdog();
    let lastTime = video.currentTime || 0;
    let lastMovedAt = Date.now();
    let lastFrameAt = Date.now();
    const useFrameCallback = typeof video.requestVideoFrameCallback === 'function';
    const watchFrame = () => {
        lastFrameAt = Date.now();
        if (liveState.playProgressTimer && typeof video.requestVideoFrameCallback === 'function') {
            liveState.videoFrameCallbackId = video.requestVideoFrameCallback(watchFrame);
        }
    };
    if (useFrameCallback) {
        liveState.videoFrameCallbackId = video.requestVideoFrameCallback(watchFrame);
    }
    liveState.playProgressTimer = setInterval(() => {
        if (video.paused) {
            setLiveVideoIdle(true);
            setLiveResumeButton(true);
            lastTime = video.currentTime || 0;
            lastMovedAt = Date.now();
            lastFrameAt = Date.now();
            return;
        }
        if (video.readyState < 2) {
            lastTime = video.currentTime || 0;
            lastMovedAt = Date.now();
            lastFrameAt = Date.now();
            return;
        }
        if (useFrameCallback && Date.now() - lastFrameAt >= LIVE_FREEZE_TIMEOUT) {
            clearLiveProgressWatchdog();
            setLiveLoading(true, '正在切换线路');
            if (typeof onTimeout === 'function') {
                onTimeout();
            }
            return;
        }
        const currentTime = video.currentTime || 0;
        if (currentTime > lastTime + 0.2) {
            lastTime = currentTime;
            lastMovedAt = Date.now();
            setLiveLoading(false);
            return;
        }
        if (Date.now() - lastMovedAt >= LIVE_FREEZE_TIMEOUT) {
            clearLiveProgressWatchdog();
            setLiveLoading(true, '正在切换线路');
            if (typeof onTimeout === 'function') {
                onTimeout();
            }
        }
    }, 1000);
}

function playLiveWithNativeVideo(video, playbackUrl, onFail) {
    const showNativeControls = !isTvAppWebView();
    video.controls = showNativeControls;
    if (!showNativeControls) {
        video.removeAttribute('controls');
    }
    liveState.currentPlaybackUrl = playbackUrl;
    liveState.resumeFailHandler = onFail;
    video.onerror = () => {
        setLiveVideoLoading(false);
        setLiveVideoIdle(true);
        setLiveLoading(false);
        if (typeof onFail === 'function') {
            onFail();
            return;
        }
        const meta = document.getElementById('livePlayerMeta');
        if (meta) {
            meta.textContent = '当前线路播放失败';
        }
    };
    armLiveWatchdog(video, LIVE_FIRST_FRAME_TIMEOUT, onFail);
    bindLiveStallWatchdog(video, onFail);
    bindLiveProgressWatchdog(video, onFail);
    video.src = playbackUrl;
    video.load();
    video.play().catch(error => {
        console.warn('直播原生播放失败:', error);
        clearLiveWatchdog();
        setLiveVideoLoading(false);
        setLiveVideoIdle(true);
        setLiveResumeButton(true);
    });
}

function requestTvLiveFullscreen() {
    // 电视端使用页面级全屏布局；不调用 requestFullscreen，避免部分 Android TV WebView 视频层卡死。
}

async function playLiveChannel(channelId) {
    let channel = liveState.channels.find(item => item.id === channelId);
    if (!channel) return;
    let lineUrls = getLiveChannelUrls(channel);
    if (lineUrls.length === 0) {
        showToast && showToast('当前浏览器不支持该直播协议', 'warning');
        return;
    }

    const panel = document.getElementById('livePlayerPanel');
    const video = document.getElementById('liveVideo');
    const title = document.getElementById('livePlayerTitle');
    const meta = document.getElementById('livePlayerMeta');
    if (!panel || !video) return;
    const showNativeControls = !isTvAppWebView();
    video.controls = showNativeControls;
    if (!showNativeControls) {
        video.removeAttribute('controls');
    }

    liveState.currentChannelId = channel.id;
    liveState.playToken += 1;
    const playToken = liveState.playToken;
    const sourceSelect = document.getElementById('liveSourceSelect');
    const sourceOptions = sourceSelect
        ? Array.from(sourceSelect.options).map(option => ({
            value: option.value,
            label: option.textContent.trim() || option.value
        })).filter(option => option.value && isAutoSwitchableLiveSource(option))
        : [];
    // 单个直播源内的线路全部失败后，继续在其它直播源中查找同名频道。
    const triedSources = new Set([liveState.currentSource]);
    const targetName = String(channel.name || '').trim().toLowerCase();
    const targetGroup = String(channel.group || '未分组').trim().toLowerCase();
    if (title) title.textContent = channel.name;
    if (meta) meta.textContent = `${channel.group || '未分组'} · 线路 1/${lineUrls.length}`;
    panel.classList.remove('hidden');
    requestTvLiveFullscreen();
    showTvLiveControls(true);
    renderLiveChannels();
    if (!isTvAppWebView()) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const startLine = async (lineIndex) => {
        if (playToken !== liveState.playToken) {
            return;
        }
        if (lineIndex >= lineUrls.length) {
            for (const sourceOption of sourceOptions) {
                if (triedSources.has(sourceOption.value)) {
                    continue;
                }
                triedSources.add(sourceOption.value);
                if (sourceSelect) {
                    sourceSelect.value = sourceOption.value;
                }
                liveState.currentSource = sourceOption.value;
                setLiveLoading(true, `当前线路不可用，正在尝试${sourceOption.label}`);
                if (meta) {
                    meta.textContent = `${channel.group || '未分组'} · 正在切换到${sourceOption.label}`;
                }
                await loadLiveChannels(true);
                if (playToken !== liveState.playToken) {
                    return;
                }
                const sameGroupChannel = liveState.channels.find(item => {
                    const name = String(item?.name || '').trim().toLowerCase();
                    const group = String(item?.group || '未分组').trim().toLowerCase();
                    return name === targetName && group === targetGroup && getLiveChannelUrls(item).length > 0;
                });
                const sameNameChannel = liveState.channels.find(item => {
                    const name = String(item?.name || '').trim().toLowerCase();
                    return name === targetName && getLiveChannelUrls(item).length > 0;
                });
                const matchedChannel = sameGroupChannel || sameNameChannel;
                if (!matchedChannel) {
                    continue;
                }
                channel = matchedChannel;
                lineUrls = getLiveChannelUrls(channel);
                liveState.currentChannelId = channel.id;
                if (title) {
                    title.textContent = channel.name;
                }
                if (meta) {
                    meta.textContent = `${channel.group || '未分组'} · 线路 1/${lineUrls.length}`;
                }
                renderLiveChannels();
                console.warn(`直播当前来源线路均不可用，已自动切换到${sourceOption.label}`);
                startLine(0);
                return;
            }
            const text = '直播播放失败，所有线路都不可用';
            setLiveLoading(false);
            setLiveVideoLoading(false);
            setLiveVideoIdle(true);
            if (typeof showToast === 'function') {
                showToast(text, 'error');
            }
            if (meta) {
                meta.textContent = text;
            }
            return;
        }
        const sourceUrl = lineUrls[lineIndex];
        const isHls = /\.m3u8(?:$|\?)/i.test(sourceUrl);
        const playbackUrl = await buildLiveMediaUrl(sourceUrl, isHls);
        if (playToken !== liveState.playToken) {
            return;
        }
        if (meta) {
            meta.textContent = `${channel.group || '未分组'} · 线路 ${lineIndex + 1}/${lineUrls.length}`;
        }
        setLiveLoading(true, `正在加载线路 ${lineIndex + 1}/${lineUrls.length}`);
        setLiveResumeButton(false);
        setLiveVideoIdle(false);
        setLiveVideoLoading(true);
        if (liveState.hls) {
            liveState.hls.destroy();
            liveState.hls = null;
        }
        video.onerror = null;
        video.onwaiting = null;
        video.onstalled = null;
        video.onplaying = null;
        video.oncanplay = null;
        video.onloadeddata = null;
        clearLiveWatchdog();
        clearLiveProgressWatchdog();
        liveState.currentPlaybackUrl = '';
        liveState.resumeFailHandler = null;
        liveState.recovering = false;
        video.pause();
        video.removeAttribute('src');
        video.controls = showNativeControls;
        if (!showNativeControls) {
            video.removeAttribute('controls');
        }
        video.load();

        if (isHls && window.Hls && Hls.isSupported()) {
            let fallbackToNative = false;
            liveState.currentPlaybackUrl = playbackUrl;
            liveState.resumeFailHandler = () => startLine(lineIndex + 1);
            liveState.hls = new Hls({
                lowLatencyMode: false,
                liveSyncDurationCount: 4,
                maxBufferLength: 30,
                maxBufferSize: 30 * 1000 * 1000
            });
            armLiveWatchdog(video, LIVE_FIRST_FRAME_TIMEOUT, () => {
                console.warn(`直播线路 ${lineIndex + 1}/${lineUrls.length} 首帧超时，自动切换下一条线路`);
                startLine(lineIndex + 1);
            });
            bindLiveStallWatchdog(video, () => {
                console.warn(`直播线路 ${lineIndex + 1}/${lineUrls.length} 播放卡住，自动切换下一条线路`);
                startLine(lineIndex + 1);
            });
            bindLiveProgressWatchdog(video, () => {
                console.warn(`直播线路 ${lineIndex + 1}/${lineUrls.length} 画面停止，自动切换下一条线路`);
                startLine(lineIndex + 1);
            });
            liveState.hls.loadSource(playbackUrl);
            liveState.hls.attachMedia(video);
            liveState.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(error => {
                    console.warn(`直播线路 ${lineIndex + 1}/${lineUrls.length} hls.js 播放被拒绝，等待手动恢复`, error);
                    clearLiveWatchdog();
                    setLiveVideoLoading(false);
                    setLiveVideoIdle(true);
                    setLiveResumeButton(true);
                });
            });
            liveState.hls.on(Hls.Events.ERROR, (event, data) => {
                if (!data.fatal && data.details && /BUFFER|STALLED|GAP/i.test(data.details)) {
                    console.warn(`直播线路 ${lineIndex + 1}/${lineUrls.length} 缓冲异常，尝试恢复`, data);
                    setLiveLoading(true, '正在恢复播放');
                    if (!liveState.recovering) {
                        liveState.recovering = true;
                        try {
                            liveState.hls.recoverMediaError();
                        } catch (error) {
                            console.warn('直播恢复失败，切换下一条线路:', error);
                            startLine(lineIndex + 1);
                            return;
                        }
                        setTimeout(() => {
                            liveState.recovering = false;
                            if (playToken === liveState.playToken && video.readyState < 3) {
                                startLine(lineIndex + 1);
                            }
                        }, 3000);
                    }
                    return;
                }
                if (data.fatal) {
                    console.warn('直播播放错误:', data);
                    if (playToken === liveState.playToken) {
                        if ((isTvAppWebView() || isAndroidAppWebView()) && liveState.playMode === 'direct' && !fallbackToNative) {
                            fallbackToNative = true;
                            if (liveState.hls) {
                                liveState.hls.destroy();
                                liveState.hls = null;
                            }
                            console.warn(`直播线路 ${lineIndex + 1}/${lineUrls.length} hls.js 播放失败，回退原生播放器`);
                            playLiveWithNativeVideo(video, playbackUrl, () => {
                                console.warn(`直播线路 ${lineIndex + 1}/${lineUrls.length} 原生播放失败，自动切换下一条线路`);
                                startLine(lineIndex + 1);
                            });
                            return;
                        }
                        console.warn(`直播线路 ${lineIndex + 1}/${lineUrls.length} 播放失败，自动切换下一条线路`);
                        startLine(lineIndex + 1);
                    }
                }
            });
            return;
        }

        playLiveWithNativeVideo(video, playbackUrl, () => {
            console.warn(`直播线路 ${lineIndex + 1}/${lineUrls.length} 播放失败，自动切换下一条线路`);
            startLine(lineIndex + 1);
        });
    };

    startLine(0);
}

function stopLivePlayback() {
    const panel = document.getElementById('livePlayerPanel');
    const video = document.getElementById('liveVideo');
    if (liveState.hls) {
        liveState.hls.destroy();
        liveState.hls = null;
    }
    setLiveLoading(false);
    setLiveVideoLoading(false);
    setLiveVideoIdle(true);
    setLiveResumeButton(false);
    clearLiveWatchdog();
    clearLiveProgressWatchdog();
    liveState.playToken += 1;
    liveState.currentPlaybackUrl = '';
    liveState.resumeFailHandler = null;
    liveState.recovering = false;
    if (video) {
        video.onerror = null;
        video.onwaiting = null;
        video.onstalled = null;
        video.onplaying = null;
        video.oncanplay = null;
        video.onloadeddata = null;
        video.controls = false;
        video.removeAttribute('controls');
        video.pause();
        video.removeAttribute('src');
        video.load();
    }
    if (panel) {
        panel.classList.add('hidden');
    }
    clearTvLiveControlsTimer();
    liveState.currentChannelId = '';
    renderLiveChannels();
}

function focusCurrentLiveChannel() {
    const current = liveState.currentChannelId
        ? document.querySelector(`[data-live-channel-id="${liveState.currentChannelId}"]`)
        : null;
    const fallback = document.querySelector('#liveChannelGrid button');
    const target = current || fallback;
    if (target) {
        target.focus();
    }
}

function handleLiveTvKeydown(event) {
    if (!isTvAppWebView() || document.getElementById('liveArea')?.classList.contains('hidden')) {
        return;
    }
    if (document.body.classList.contains('jmtv-tv-controls-hidden')) {
        event.preventDefault();
        showTvLiveControls(true);
        setTimeout(() => focusCurrentLiveChannel(), 0);
        return;
    }
    showTvLiveControls(true);
    const keyActions = {
        ArrowDown: 1,
        ArrowRight: 1,
        ArrowUp: -1,
        ArrowLeft: -1
    };
    if (Object.prototype.hasOwnProperty.call(keyActions, event.key)) {
        event.preventDefault();
        const items = Array.from(document.querySelectorAll(
            '#liveGroupList button, #liveChannelGrid button'
        )).filter(item => item.offsetParent !== null && !item.disabled);
        if (items.length === 0) return;
        const activeIndex = Math.max(0, items.indexOf(document.activeElement));
        const nextIndex = (activeIndex + keyActions[event.key] + items.length) % items.length;
        items[nextIndex].focus();
        return;
    }
    if (event.key === 'Backspace' || event.key === 'Escape') {
        event.preventDefault();
        focusCurrentLiveChannel();
    }
}

function escapeLiveText(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
    const sourceSelect = document.getElementById('liveSourceSelect');
    if (sourceSelect) {
        sourceSelect.addEventListener('change', () => loadLiveChannels(true));
    }
    if (window.location.pathname === '/live') {
        showLivePage();
    }
    document.addEventListener('keydown', handleLiveTvKeydown);
    document.addEventListener('mousemove', () => showTvLiveControls(true));
    document.addEventListener('click', () => showTvLiveControls(true));
});
