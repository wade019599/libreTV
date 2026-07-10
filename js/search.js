async function fetchSearchJson(apiUrl) {
    const clientConfig = typeof CLIENT_SEARCH_CONFIG !== 'undefined' ? CLIENT_SEARCH_CONFIG : {};
    const directTimeout = clientConfig.directTimeout || clientConfig.timeout || 3000;
    const proxyTimeout = clientConfig.proxyTimeout || clientConfig.timeout || 10000;
    const targetUrl = new URL(apiUrl, window.location.href);
    const canUseClient = clientConfig.enabled !== false &&
        !(window.location.protocol === 'https:' && targetUrl.protocol === 'http:');

    if (canUseClient) {
        const directController = new AbortController();
        const directTimeoutId = setTimeout(() => directController.abort(), directTimeout);
        try {
            const directResponse = await fetch(apiUrl, {
                mode: 'cors',
                credentials: 'omit',
                headers: {
                    'Accept': 'application/json'
                },
                signal: directController.signal
            });
            clearTimeout(directTimeoutId);
            if (directResponse.ok) {
                return await directResponse.json();
            }
        } catch (error) {
            console.warn('客户机直连搜索失败，准备回退代理:', error);
        } finally {
            clearTimeout(directTimeoutId);
        }
    }

    if (clientConfig.fallbackToProxy === false) {
        return null;
    }

    const proxyController = new AbortController();
    const proxyTimeoutId = setTimeout(() => proxyController.abort(), proxyTimeout);
    try {
        const proxiedUrl = window.ProxyAuth?.addAuthToProxyUrl ?
            await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(apiUrl)) :
            PROXY_URL + encodeURIComponent(apiUrl);
        const proxyResponse = await fetch(proxiedUrl, {
            headers: API_CONFIG.search.headers,
            signal: proxyController.signal
        });
        if (!proxyResponse.ok) {
            return null;
        }
        return await proxyResponse.json();
    } finally {
        clearTimeout(proxyTimeoutId);
    }
}

async function searchByAPIAndKeyWord(apiId, query) {
    try {
        let apiUrl, apiName, apiBaseUrl;

        if (apiId.startsWith('custom_')) {
            const customIndex = apiId.replace('custom_', '');
            const customApi = getCustomApiInfo(customIndex);
            if (!customApi) return [];

            apiBaseUrl = customApi.url;
            apiUrl = apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(query);
            apiName = customApi.name;
        } else {
            if (!API_SITES[apiId]) return [];
            apiBaseUrl = API_SITES[apiId].api;
            apiUrl = apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(query);
            apiName = API_SITES[apiId].name;
        }

        const data = await fetchSearchJson(apiUrl);
        
        if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) {
            return [];
        }
        
        // 处理第一页结果
        const results = data.list
            .filter(item => typeof isSearchResultMatched !== 'function' || isSearchResultMatched(item, query))
            .map(item => ({
            ...item,
            source_name: apiName,
            source_code: apiId,
            api_url: apiId.startsWith('custom_') ? getCustomApiInfo(apiId.replace('custom_', ''))?.url : undefined
        }));
        
        // 获取总页数
        const pageCount = data.pagecount || 1;
        // 确定需要获取的额外页数 (最多获取maxPages页)
        const pagesToFetch = Math.min(pageCount - 1, API_CONFIG.search.maxPages - 1);
        
        // 如果有额外页数，获取更多页的结果
        if (pagesToFetch > 0) {
            const additionalPagePromises = [];
            
            for (let page = 2; page <= pagesToFetch + 1; page++) {
                // 构建分页URL
                const pageUrl = apiBaseUrl + API_CONFIG.search.pagePath
                    .replace('{query}', encodeURIComponent(query))
                    .replace('{page}', page);
                
                // 创建获取额外页的Promise
                const pagePromise = (async () => {
                    try {
                        const pageData = await fetchSearchJson(pageUrl);
                        
                        if (!pageData || !pageData.list || !Array.isArray(pageData.list)) return [];
                        
                        // 处理当前页结果
                        return pageData.list
                            .filter(item => typeof isSearchResultMatched !== 'function' || isSearchResultMatched(item, query))
                            .map(item => ({
                            ...item,
                            source_name: apiName,
                            source_code: apiId,
                            api_url: apiId.startsWith('custom_') ? getCustomApiInfo(apiId.replace('custom_', ''))?.url : undefined
                        }));
                    } catch (error) {
                        console.warn(`API ${apiId} 第${page}页搜索失败:`, error);
                        return [];
                    }
                })();
                
                additionalPagePromises.push(pagePromise);
            }
            
            // 等待所有额外页的结果
            const additionalResults = await Promise.all(additionalPagePromises);
            
            // 合并所有页的结果
            additionalResults.forEach(pageResults => {
                if (pageResults.length > 0) {
                    results.push(...pageResults);
                }
            });
        }
        
        return results;
    } catch (error) {
        console.warn(`API ${apiId} 搜索失败:`, error);
        return [];
    }
}
