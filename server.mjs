import path from 'path';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  port: process.env.PORT || 8080,
  password: process.env.PASSWORD || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  timeout: parseInt(process.env.REQUEST_TIMEOUT || '5000'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '2'),
  cacheMaxAge: process.env.CACHE_MAX_AGE || '1d',
  userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  sourceSyncEnabled: process.env.SOURCE_SYNC_ENABLED !== 'false',
  sourceSyncTtl: parseInt(process.env.SOURCE_SYNC_TTL || String(6 * 60 * 60 * 1000)),
  sourceSyncLimit: parseInt(process.env.SOURCE_SYNC_LIMIT || '120'),
  sourceSyncBatchSize: parseInt(process.env.SOURCE_SYNC_BATCH_SIZE || '4'),
  sourceSyncRequestTimeout: parseInt(process.env.SOURCE_SYNC_REQUEST_TIMEOUT || '30000'),
  liveIptvBaseUrl: (process.env.IPTV_API_BASE_URL || process.env.LIVE_IPTV_BASE_URL || '').replace(/\/+$/g, ''),
  livePlaylistPath: process.env.LIVE_IPTV_PATH || '/txt',
  liveCacheTtl: parseInt(process.env.LIVE_CACHE_TTL || String(5 * 60 * 1000)),
  liveRequestTimeout: parseInt(process.env.LIVE_REQUEST_TIMEOUT || '30000'),
  liveMonitorSources: process.env.LIVE_MONITOR_SOURCES || 'txt,ipv4_txt',
  liveMonitorCacheTtl: parseInt(process.env.LIVE_MONITOR_CACHE_TTL || String(10 * 60 * 1000)),
  liveMonitorTimeout: parseInt(process.env.LIVE_MONITOR_TIMEOUT || '8000'),
  livePlayMode: String(process.env.LIVE_PLAY_MODE || 'direct').toLowerCase() === 'proxy' ? 'proxy' : 'direct',
  assetVersion: process.env.ASSET_VERSION || String(Date.now()),
  debug: process.env.DEBUG === 'true'
};

const log = (...args) => {
  if (config.debug) {
    console.log('[DEBUG]', ...args);
  }
};

const app = express();
let yszzqSourceCache = {
  updatedAt: 0,
  list: [],
  sites: {}
};
let telegraSourceCache = {
  updatedAt: 0,
  list: [],
  sites: {}
};
let liveChannelCache = {
  cacheKey: '',
  updatedAt: 0,
  channels: [],
  groups: []
};
let liveMonitorCache = {
  cacheKey: '',
  updatedAt: 0,
  data: null
};

app.use(cors({
  origin: config.corsOrigin,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

function sha256Hash(input) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256');
    hash.update(input);
    resolve(hash.digest('hex'));
  });
}

async function renderPage(filePath, password) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (password !== '') {
    const sha256 = await sha256Hash(password);
    content = content.replace('{{PASSWORD}}', sha256);
  } else {
    content = content.replace('{{PASSWORD}}', '');
  }
  content = content.replace(/\b(src|href)="((?:js|css|libs|image)\/[^"]+)"/g, (match, attr, url) => {
    if (url.includes('jmtv_asset=')) {
      return `${attr}="${url.replace(/([?&])jmtv_asset=[^&"]*/g, `$1jmtv_asset=${config.assetVersion}`)}"`;
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${attr}="${url}${separator}jmtv_asset=${config.assetVersion}"`;
  });
  return content;
}

app.get(['/', '/index.html', '/player.html'], async (req, res) => {
  try {
    let filePath;
    switch (req.path) {
      case '/player.html':
        filePath = path.join(__dirname, 'player.html');
        break;
      default: // '/' 和 '/index.html'
        filePath = path.join(__dirname, 'index.html');
        break;
    }
    
    const content = await renderPage(filePath, config.password);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(content);
  } catch (error) {
    console.error('页面渲染错误:', error);
    res.status(500).send('读取静态页面失败');
  }
});

app.get('/s=:keyword', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'index.html');
    const content = await renderPage(filePath, config.password);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(content);
  } catch (error) {
    console.error('搜索页面渲染错误:', error);
    res.status(500).send('读取静态页面失败');
  }
});

app.get('/live', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'index.html');
    const content = await renderPage(filePath, config.password);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(content);
  } catch (error) {
    console.error('直播页面渲染错误:', error);
    res.status(500).send('读取静态页面失败');
  }
});

async function syncYszzqSources(force = false) {
  const now = Date.now();
  if (!force && yszzqSourceCache.updatedAt && now - yszzqSourceCache.updatedAt < config.sourceSyncTtl) {
    return {
      cached: true,
      updatedAt: yszzqSourceCache.updatedAt,
      list: yszzqSourceCache.list,
      sites: yszzqSourceCache.sites
    };
  }

  const listUrl = 'https://www.yszzq.com/ziyuan/webplugin/';
  const detailUrl = 'https://www.yszzq.com/e/extend/webplugin/index.php';
  const commonHeaders = {
    'User-Agent': config.userAgent,
    'Referer': listUrl,
    'Origin': 'https://www.yszzq.com'
  };
  const listResponse = await axios.get(listUrl, {
    responseType: 'arraybuffer',
    timeout: config.sourceSyncRequestTimeout,
    headers: commonHeaders
  });
  const html = Buffer.from(listResponse.data).toString('utf8');
  const sourceMatches = [...html.matchAll(/<h3><a[^>]+\/ziyuan\/web\/(\d+)\.html[^>]*>([^<]+)<\/a><\/h3>[\s\S]{0,1200}?onclick=cms\(\1,'qt','sp'\)/g)];
  const sourceItems = [];
  const sourceSeen = new Set();
  for (const match of sourceMatches) {
    const id = match[1];
    if (sourceSeen.has(id)) {
      continue;
    }
    sourceSeen.add(id);
    sourceItems.push({
      id,
      name: match[2].trim()
    });
    if (sourceItems.length >= config.sourceSyncLimit) {
      break;
    }
  }

  const list = [];
  const sites = {};
  const apiSeen = new Set();
  for (let index = 0; index < sourceItems.length; index += config.sourceSyncBatchSize) {
    const batch = sourceItems.slice(index, index + config.sourceSyncBatchSize);
    const results = await Promise.allSettled(batch.map(item => axios.post(detailUrl, new URLSearchParams({
      ids: item.id,
      fl: 'qt',
      lx: 'sp'
    }).toString(), {
      timeout: config.sourceSyncRequestTimeout,
      headers: {
        ...commonHeaders,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/plain, */*'
      }
    })));

    for (let resultIndex = 0; resultIndex < results.length; resultIndex++) {
      const result = results[resultIndex];
      const source = batch[resultIndex];
      if (result.status !== 'fulfilled') {
        continue;
      }
      const payload = typeof result.value.data === 'string' ? JSON.parse(result.value.data) : result.value.data;
      const pluginHtml = payload && payload.data ? String(payload.data) : '';
      const valueMatches = [...pluginHtml.matchAll(/<(?:input|option)[^>]+value="([^"]+)"/gi)];
      const candidates = [];

      valueMatches.forEach(valueMatch => {
        const rawValue = valueMatch[1]
          .replaceAll('&amp;', '&')
          .replaceAll('\\/', '/');
        if (/xml|xmlsea|provide\/art/i.test(rawValue)) {
          return;
        }

        const urlMatches = rawValue.match(/https?:\/\/[^\s,'"<>]+?(?:api\.php\/provide\/vod|provide\/vod)[^\s,'"<>]*/gi) || [];
        urlMatches.forEach(rawUrl => {
          const api = rawUrl
            .split('?')[0]
            .replace('/provide//vod/', '/provide/vod/')
            .replace(/\/at\/(?:json|josn)\/?$/i, '')
            .replace(/\/+$/g, '');
          if (!/^https?:\/\//i.test(api)) {
            return;
          }
          candidates.push({
            api,
            score: /\/from\/|m3u8/i.test(api) ? 10 : 0
          });
        });
      });

      candidates.sort((left, right) => left.score - right.score);
      let selected = null;
      for (const candidate of candidates) {
        if (apiSeen.has(candidate.api)) {
          continue;
        }
        try {
          const jsonResponse = await axios.get(`${candidate.api}?ac=videolist&pg=1`, {
            timeout: config.sourceSyncRequestTimeout,
            responseType: 'json',
            headers: {
              'User-Agent': config.userAgent,
              'Accept': 'application/json, text/plain, */*'
            },
            transformResponse: [(data) => JSON.parse(data)]
          });
          if (jsonResponse.data && typeof jsonResponse.data === 'object' && Array.isArray(jsonResponse.data.list)) {
            selected = candidate;
            break;
          }
        } catch {
          // 采集地址响应不是 JSON 或不可用时跳过，继续测试同资源站其它候选地址。
        }
      }
      if (!selected) {
        continue;
      }

      apiSeen.add(selected.api);
      const hash = crypto.createHash('md5').update(`${source.id}:${selected.api}`).digest('hex').slice(0, 8);
      const key = `yszzq_${source.id}_${hash}`;
      const item = {
        key,
        id: source.id,
        name: source.name,
        api: selected.api,
        source: 'yszzq',
        syncedAt: now
      };
      list.push(item);
      sites[key] = {
        api: selected.api,
        name: source.name
      };
    }
  }

  yszzqSourceCache = {
    updatedAt: now,
    list,
    sites
  };
  return {
    cached: false,
    updatedAt: now,
    list,
    sites
  };
}

async function syncTelegraSources(force = false) {
  const now = Date.now();
  if (!force && telegraSourceCache.updatedAt && now - telegraSourceCache.updatedAt < config.sourceSyncTtl) {
    return {
      cached: true,
      updatedAt: telegraSourceCache.updatedAt,
      list: telegraSourceCache.list,
      sites: telegraSourceCache.sites
    };
  }

  const sourceUrl = 'https://telegra.ph/APIs-08-12';
  const response = await axios.get(sourceUrl, {
    timeout: config.sourceSyncRequestTimeout,
    headers: {
      'User-Agent': config.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  const html = String(response.data || '');
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
  const sourceMatches = [...text.matchAll(/([A-Za-z0-9_]+)\s*:\s*\{[\s\S]*?api\s*:\s*['"]([^'"]+)['"][\s\S]*?name\s*:\s*['"]([^'"]+)['"]([\s\S]*?)\}/g)];
  const list = [];
  const sites = {};
  const apiSeen = new Set();

  sourceMatches.forEach(match => {
    const sourceKey = match[1];
    const api = match[2].split('?')[0].replace(/\/+$/g, '');
    const name = match[3].trim();
    const tail = match[4] || '';
    if (!/^https?:\/\//i.test(api) || !/provide\/vod/i.test(api) || apiSeen.has(api)) {
      return;
    }

    apiSeen.add(api);
    const key = `telegra_${sourceKey}`;
    const item = {
      key,
      id: sourceKey,
      name,
      api,
      detail: (tail.match(/detail\s*:\s*['"]([^'"]+)['"]/) || [])[1] || '',
      source: 'telegra',
      syncedAt: now
    };
    list.push(item);
    sites[key] = {
      api,
      name
    };
    if (item.detail) {
      sites[key].detail = item.detail;
    }
  });

  telegraSourceCache = {
    updatedAt: now,
    list,
    sites
  };
  return {
    cached: false,
    updatedAt: now,
    list,
    sites
  };
}

app.get(['/api/sources/external', '/api/sources/yszzq'], async (req, res) => {
  if (!config.sourceSyncEnabled) {
    return res.json({
      code: 403,
      msg: '资源站同步已关闭',
      list: [],
      sites: {}
    });
  }

  try {
    const force = req.query.force === '1' || req.query.force === 'true';
    const syncResults = await Promise.allSettled([
      syncYszzqSources(force),
      syncTelegraSources(force)
    ]);
    const list = [];
    const sites = {};
    const apiSeen = new Set();
    const sources = {};

    syncResults.forEach((result, index) => {
      const sourceName = index === 0 ? 'yszzq' : 'telegra';
      if (result.status !== 'fulfilled') {
        sources[sourceName] = {
          ok: false,
          error: result.reason?.message || String(result.reason)
        };
        return;
      }

      sources[sourceName] = {
        ok: true,
        cached: result.value.cached,
        total: result.value.list.length,
        updatedAt: result.value.updatedAt
      };
      result.value.list.forEach(item => {
        const normalizedUrl = item.api.replace(/\/+$/g, '');
        if (apiSeen.has(normalizedUrl)) {
          return;
        }
        apiSeen.add(normalizedUrl);
        list.push(item);
        sites[item.key] = result.value.sites[item.key];
      });
    });
    res.json({
      code: 200,
      msg: 'success',
      cached: syncResults.every(result => result.status === 'fulfilled' && result.value.cached),
      updatedAt: Date.now(),
      total: list.length,
      sources,
      list,
      sites
    });
  } catch (error) {
    console.error('同步 yszzq 资源站失败:', error.message);
    res.status(502).json({
      code: 502,
      msg: `同步资源站失败: ${error.message}`,
      cached: Boolean(yszzqSourceCache.updatedAt || telegraSourceCache.updatedAt),
      updatedAt: Math.max(yszzqSourceCache.updatedAt, telegraSourceCache.updatedAt),
      list: [...yszzqSourceCache.list, ...telegraSourceCache.list],
      sites: {
        ...yszzqSourceCache.sites,
        ...telegraSourceCache.sites
      }
    });
  }
});

const liveSourcePaths = {
  txt: '/txt',
  m3u: '/m3u',
  ipv4_txt: '/ipv4/txt',
  ipv6_txt: '/ipv6/txt',
  hls_txt: '/hls/txt',
  hls_m3u: '/hls/m3u'
};

function getLiveChannelUniqueKey(group, name) {
  return `${String(group || '未分组').trim().toLowerCase()}|${String(name || '').trim().toLowerCase()}`;
}

function parseLivePlaylist(content, fileType) {
  const channels = [];
  const groups = new Set();
  const channelIndex = new Map();
  const text = String(content || '').replace(/^\uFEFF/, '');

  if (fileType === 'm3u') {
    const lines = text.split(/\r?\n/);
    let pending = null;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      if (line.startsWith('#EXTINF')) {
        const name = (line.split(',').pop() || '').trim();
        const group = (line.match(/group-title="([^"]+)"/i) || [])[1] || '未分组';
        const logo = (line.match(/tvg-logo="([^"]+)"/i) || [])[1] || '';
        pending = { name, group, logo };
        continue;
      }
      if (line.startsWith('#')) {
        continue;
      }
      const url = line.split('$')[0].trim();
      if (pending && /^https?:\/\//i.test(url)) {
        const channelName = pending.name || `频道${channels.length + 1}`;
        const key = getLiveChannelUniqueKey(pending.group, channelName);
        const existing = channelIndex.get(key);
        if (existing) {
          if (!existing.urls.includes(url)) {
            existing.urls.push(url);
          }
        } else {
          groups.add(pending.group);
          const channel = {
            id: crypto.createHash('md5').update(key).digest('hex').slice(0, 12),
            name: channelName,
            group: pending.group,
            logo: pending.logo,
            url,
            urls: [url]
          };
          channels.push(channel);
          channelIndex.set(key, channel);
        }
      }
      pending = null;
    }
  } else {
    let currentGroup = '未分组';
    text.split(/\r?\n/).forEach(rawLine => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        return;
      }
      const parts = line.split(/[,，]/);
      if (parts.length >= 2 && parts[1].trim() === '#genre#') {
        currentGroup = parts[0].trim() || '未分组';
        groups.add(currentGroup);
        return;
      }
      const separatorIndex = line.search(/[,，]/);
      if (separatorIndex <= 0) {
        return;
      }
      const channelName = line.slice(0, separatorIndex).trim();
      const url = line.slice(separatorIndex + 1).split('$')[0].trim();
      if (!channelName || !/^https?:\/\//i.test(url)) {
        return;
      }
      const key = getLiveChannelUniqueKey(currentGroup, channelName);
      const existing = channelIndex.get(key);
      if (existing) {
        if (!existing.urls.includes(url)) {
          existing.urls.push(url);
        }
        return;
      }
      const channel = {
        id: crypto.createHash('md5').update(key).digest('hex').slice(0, 12),
        name: channelName,
        group: currentGroup,
        logo: '',
        url,
        urls: [url]
      };
      groups.add(currentGroup);
      channels.push(channel);
      channelIndex.set(key, channel);
    });
  }

  return {
    channels,
    groups: Array.from(groups).filter(Boolean)
  };
}

function rewriteLiveM3u8(content, baseUrl, authHash) {
  const authQuery = authHash ? `auth=${encodeURIComponent(authHash)}` : '';
  return String(content || '').split(/\r?\n/).map(rawLine => {
    const line = rawLine.trim();
    if (!line) {
      return rawLine;
    }
    if (line.startsWith('#')) {
      return rawLine.replace(/URI="([^"]+)"/g, (match, uri) => {
        try {
          const target = new URL(uri, baseUrl).toString();
          return `URI="/api/live/media?url=${encodeURIComponent(target)}${authQuery ? `&${authQuery}` : ''}"`;
        } catch {
          return match;
        }
      });
    }
    try {
      const target = new URL(line, baseUrl).toString();
      const playlistFlag = /\.m3u8(?:$|\?)/i.test(target) ? '&playlist=1' : '';
      return `/api/live/media?url=${encodeURIComponent(target)}${authQuery ? `&${authQuery}` : ''}${playlistFlag}`;
    } catch {
      return rawLine;
    }
  }).join('\n');
}

app.get('/api/live/channels', async (req, res) => {
  if (!config.liveIptvBaseUrl) {
    return res.status(400).json({
      code: 400,
      msg: '未配置 IPTV_API_BASE_URL',
      playMode: config.livePlayMode,
      channels: [],
      groups: []
    });
  }

  const source = String(req.query.source || '').trim();
  const playlistPath = liveSourcePaths[source] || config.livePlaylistPath || '/txt';
  const fileType = playlistPath.includes('m3u') ? 'm3u' : 'txt';
  const playlistUrl = `${config.liveIptvBaseUrl}${playlistPath.startsWith('/') ? playlistPath : `/${playlistPath}`}`;
  const cacheKey = `${playlistUrl}|${fileType}`;
  const force = req.query.force === '1' || req.query.force === 'true';
  const now = Date.now();

  if (!force && liveChannelCache.cacheKey === cacheKey && now - liveChannelCache.updatedAt < config.liveCacheTtl) {
    return res.json({
      code: 200,
      msg: 'success',
      cached: true,
      updatedAt: liveChannelCache.updatedAt,
      playMode: config.livePlayMode,
      total: liveChannelCache.channels.length,
      groups: liveChannelCache.groups,
      channels: liveChannelCache.channels
    });
  }

  try {
    const response = await axios.get(playlistUrl, {
      timeout: config.liveRequestTimeout,
      responseType: 'text',
      headers: {
        'User-Agent': config.userAgent,
        'Accept': fileType === 'm3u' ? 'audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain,*/*' : 'text/plain,*/*'
      }
    });
    const parsed = parseLivePlaylist(response.data, fileType);
    liveChannelCache = {
      cacheKey,
      updatedAt: now,
      channels: parsed.channels,
      groups: parsed.groups
    };
    res.json({
      code: 200,
      msg: 'success',
      cached: false,
      updatedAt: now,
      playMode: config.livePlayMode,
      total: parsed.channels.length,
      groups: parsed.groups,
      channels: parsed.channels
    });
  } catch (error) {
    console.error('获取直播频道失败:', error.message);
    res.status(502).json({
      code: 502,
      msg: `获取直播频道失败: ${error.message}`,
      cached: Boolean(liveChannelCache.updatedAt),
      updatedAt: liveChannelCache.updatedAt,
      playMode: config.livePlayMode,
      total: liveChannelCache.channels.length,
      groups: liveChannelCache.groups,
      channels: liveChannelCache.channels
    });
  }
});

app.get('/api/live/monitor', async (req, res) => {
  if (!config.liveIptvBaseUrl) {
    return res.status(400).json({
      code: 400,
      msg: '未配置 IPTV_API_BASE_URL',
      healthy: false,
      sources: []
    });
  }

  const force = req.query.force === '1' || req.query.force === 'true';
  const sourceText = String(req.query.sources || config.liveMonitorSources || '').trim();
  const sourceKeys = sourceText
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 6);
  const selectedSources = sourceKeys.length > 0 ? sourceKeys : ['txt'];
  const cacheKey = selectedSources.join(',');
  const now = Date.now();

  if (!force && liveMonitorCache.cacheKey === cacheKey && liveMonitorCache.data && now - liveMonitorCache.updatedAt < config.liveMonitorCacheTtl) {
    const cachedData = {
      ...liveMonitorCache.data,
      cached: true,
      updatedAt: liveMonitorCache.updatedAt
    };
    return res.status(cachedData.healthy ? 200 : 503).json(cachedData);
  }

  const results = [];
  for (const source of selectedSources) {
    const playlistPath = liveSourcePaths[source] || (source.startsWith('/') ? source : '');
    if (!playlistPath) {
      results.push({
        source,
        ok: false,
        status: 0,
        responseMs: 0,
        total: 0,
        groups: 0,
        error: '未知直播源'
      });
      continue;
    }

    const fileType = playlistPath.includes('m3u') ? 'm3u' : 'txt';
    const playlistUrl = `${config.liveIptvBaseUrl}${playlistPath}`;
    const startedAt = Date.now();
    try {
      const response = await axios.get(playlistUrl, {
        timeout: config.liveMonitorTimeout,
        responseType: 'text',
        headers: {
          'User-Agent': config.userAgent,
          'Accept': fileType === 'm3u' ? 'audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain,*/*' : 'text/plain,*/*'
        }
      });
      const parsed = parseLivePlaylist(response.data, fileType);
      results.push({
        source,
        path: playlistPath,
        ok: response.status >= 200 && response.status < 300 && parsed.channels.length > 0,
        status: response.status,
        responseMs: Date.now() - startedAt,
        total: parsed.channels.length,
        groups: parsed.groups.length
      });
    } catch (error) {
      results.push({
        source,
        path: playlistPath,
        ok: false,
        status: error.response?.status || 0,
        responseMs: Date.now() - startedAt,
        total: 0,
        groups: 0,
        error: error.message
      });
    }
  }

  const healthy = results.some(item => item.ok);
  const data = {
    code: healthy ? 200 : 503,
    msg: healthy ? 'success' : '直播源监测失败',
    cached: false,
    updatedAt: now,
    healthy,
    timeout: config.liveMonitorTimeout,
    cacheTtl: config.liveMonitorCacheTtl,
    sources: results
  };
  liveMonitorCache = {
    cacheKey,
    updatedAt: now,
    data
  };
  res.status(healthy ? 200 : 503).json(data);
});

app.get('/api/live/media', async (req, res) => {
  if (!validateProxyAuth(req)) {
    return res.status(401).json({
      success: false,
      error: '直播代理访问未授权'
    });
  }

  const targetUrl = String(req.query.url || '');
  let isConfiguredLiveHost = false;
  try {
    isConfiguredLiveHost = Boolean(config.liveIptvBaseUrl) &&
      new URL(targetUrl).host === new URL(config.liveIptvBaseUrl).host;
  } catch {
    isConfiguredLiveHost = false;
  }
  if (!isValidUrl(targetUrl) && !isConfiguredLiveHost) {
    return res.status(400).send('无效的直播地址');
  }

  const isPlaylist = req.query.playlist === '1' || /\.m3u8(?:$|\?)/i.test(targetUrl);
  try {
    if (isPlaylist) {
      const response = await axios.get(targetUrl, {
        timeout: config.liveRequestTimeout,
        responseType: 'text',
        headers: {
          'User-Agent': config.userAgent,
          'Accept': 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*',
          'Referer': new URL(targetUrl).origin
        }
      });
      const rewritten = rewriteLiveM3u8(response.data, targetUrl, req.query.auth);
      res.type('application/vnd.apple.mpegurl').send(rewritten);
      return;
    }

    const response = await axios({
      method: 'get',
      url: targetUrl,
      responseType: 'stream',
      timeout: config.liveRequestTimeout,
      headers: {
        'User-Agent': config.userAgent,
        'Accept': req.headers.accept || '*/*',
        'Accept-Language': req.headers['accept-language'] || 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': new URL(targetUrl).origin,
        ...(req.headers.range ? { Range: req.headers.range } : {})
      }
    });
    const headers = { ...response.headers };
    ['content-security-policy', 'set-cookie', 'x-frame-options'].forEach(header => delete headers[header]);
    res.status(response.status);
    res.set(headers);
    response.data.pipe(res);
  } catch (error) {
    console.error('直播媒体代理失败:', error.message);
    res.status(error.response?.status || 502).send(`直播媒体代理失败: ${error.message}`);
  }
});

function isValidUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const allowedProtocols = ['http:', 'https:'];
    
    // 从环境变量获取阻止的主机名列表
    const blockedHostnames = (process.env.BLOCKED_HOSTS || 'localhost,127.0.0.1,0.0.0.0,::1').split(',');
    
    // 从环境变量获取阻止的 IP 前缀
    const blockedPrefixes = (process.env.BLOCKED_IP_PREFIXES || '192.168.,10.,172.').split(',');
    
    if (!allowedProtocols.includes(parsed.protocol)) return false;
    if (blockedHostnames.includes(parsed.hostname)) return false;
    
    for (const prefix of blockedPrefixes) {
      if (parsed.hostname.startsWith(prefix)) return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// 验证代理请求的鉴权
function validateProxyAuth(req) {
  const authHash = req.query.auth;
  const timestamp = req.query.t;
  
  // 获取服务器端密码哈希
  const serverPassword = config.password;
  if (!serverPassword) {
    console.error('服务器未设置 PASSWORD 环境变量，代理访问被拒绝');
    return false;
  }
  
  // 使用 crypto 模块计算 SHA-256 哈希
  const serverPasswordHash = crypto.createHash('sha256').update(serverPassword).digest('hex');
  
  if (!authHash || authHash !== serverPasswordHash) {
    console.warn('代理请求鉴权失败：密码哈希不匹配');
    console.warn(`期望: ${serverPasswordHash}, 收到: ${authHash}`);
    return false;
  }
  
  // 验证时间戳（10分钟有效期）
  if (timestamp) {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10分钟
    if (now - parseInt(timestamp) > maxAge) {
      console.warn('代理请求鉴权失败：时间戳过期');
      return false;
    }
  }
  
  return true;
}

async function handleProxyRequest(req, res) {
  try {
    // 验证鉴权
    if (!validateProxyAuth(req)) {
      return res.status(401).json({
        success: false,
        error: '代理访问未授权：请检查密码配置或鉴权参数'
      });
    }

    const encodedUrl = req.query.url || req.params.encodedUrl || req.params[0];
    if (!encodedUrl) {
      return res.status(400).send('缺少代理 URL');
    }
    const targetUrl = decodeURIComponent(encodedUrl);

    // 安全验证
    if (!isValidUrl(targetUrl)) {
      return res.status(400).send('无效的 URL');
    }

    log(`代理请求: ${targetUrl}`);

    // 添加请求超时和重试逻辑
    const maxRetries = config.maxRetries;
    let retries = 0;
    
    const makeRequest = async () => {
      try {
        return await axios({
          method: 'get',
          url: targetUrl,
          responseType: 'stream',
          timeout: config.timeout,
          headers: {
            'User-Agent': config.userAgent,
            'Accept': req.headers.accept || 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': req.headers['accept-language'] || 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': req.headers.referer || new URL(targetUrl).origin
          }
        });
      } catch (error) {
        if (retries < maxRetries) {
          retries++;
          log(`重试请求 (${retries}/${maxRetries}): ${targetUrl}`);
          return makeRequest();
        }
        throw error;
      }
    };

    const response = await makeRequest();

    // 转发响应头（过滤敏感头）
    const headers = { ...response.headers };
    const sensitiveHeaders = (
      process.env.FILTERED_HEADERS || 
      'content-security-policy,cookie,set-cookie,x-frame-options,access-control-allow-origin'
    ).split(',');
    
    sensitiveHeaders.forEach(header => delete headers[header]);
    res.set(headers);

    // 管道传输响应流
    response.data.pipe(res);
  } catch (error) {
    console.error('代理请求错误:', error.message);
    if (error.response) {
      res.status(error.response.status || 500);
      error.response.data.pipe(res);
    } else {
      res.status(500).send(`请求失败: ${error.message}`);
    }
  }
}

app.get('/proxy', handleProxyRequest);
app.get(/^\/proxy\/(.+)$/, handleProxyRequest);

app.use(express.static(path.join(__dirname), {
  maxAge: config.cacheMaxAge
}));

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).send('服务器内部错误');
});

app.use((req, res) => {
  res.status(404).send('页面未找到');
});

let lastBeijingDailySourceSyncDate = '';

// 启动服务器
app.listen(config.port, () => {
  console.log(`服务器运行在 http://localhost:${config.port}`);
  if (config.password !== '') {
    console.log('用户登录密码已设置');
  } else {
    console.log('警告: 未设置 PASSWORD 环境变量，用户将被要求设置密码');
  }
  if (config.debug) {
    console.log('调试模式已启用');
    console.log('配置:', { ...config, password: config.password ? '******' : '' });
  }
  if (config.sourceSyncEnabled) {
    Promise.allSettled([
      syncYszzqSources(true),
      syncTelegraSources(true)
    ]).then((results) => {
      const successCount = results.filter(result => result.status === 'fulfilled').length;
      console.log(`外部资源站启动同步完成：成功 ${successCount}/2`);
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(`${index === 0 ? 'yszzq' : 'telegra'} 启动同步失败:`, result.reason?.message || result.reason);
        }
      });
    });

    setInterval(() => {
      const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const dateKey = beijingNow.toISOString().slice(0, 10);
      if (
        beijingNow.getUTCHours() === 4 &&
        beijingNow.getUTCMinutes() === 0 &&
        lastBeijingDailySourceSyncDate !== dateKey
      ) {
        lastBeijingDailySourceSyncDate = dateKey;
        Promise.allSettled([
          syncYszzqSources(true),
          syncTelegraSources(true)
        ]).then((results) => {
          const successCount = results.filter(result => result.status === 'fulfilled').length;
          console.log(`外部资源站北京时间 ${dateKey} 04:00 同步完成：成功 ${successCount}/2`);
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              console.warn(`${index === 0 ? 'yszzq' : 'telegra'} 定时同步失败:`, result.reason?.message || result.reason);
            }
          });
        });
      }
    }, 60 * 1000);
  }
});
