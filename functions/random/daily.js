/**
 * GET /random/daily
 *
 * 每日固定图。给定相同的 seed/日期和相同的过滤条件，会返回同一张图，
 * 适合"今日壁纸"小组件、"今日推荐"卡片。
 *
 * 查询参数：
 *   tz       时区，默认 UTC。例如 tz=Asia/Shanghai 或 tz=+08:00
 *   date     显式日期（YYYY-MM-DD），优先级高于 tz。不传则按 tz 算今天
 *   过滤参数 同 /random（color/category/mood/tags/dir/orientation/minWidth/...）
 *   type     url / img
 *   form     text / json
 *
 * 响应：
 *   {
 *     date: "2026-05-17",
 *     seed: "daily-2026-05-17",
 *     total: 487,
 *     url: "/file/xxx"
 *   }
 *
 * 缓存：响应带 Cache-Control: public, max-age=<距离次日 0 点的秒数>
 *       让 CDN 自然实现"同日命中缓存、跨日重新计算"
 */
import { fetchOthersConfig } from "../utils/sysConfig";
import { detectDevice, resolveOrientation } from "./adaptive.js";
import {
    parseFilterParams,
    isDirAllowed,
    loadCandidates,
    applyMemoryFilters,
    createSeededRandom,
    sampleN,
    getFacetsConfig,
} from "../utils/filterPipeline.js";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

/**
 * 把 tz 字符串解析成"距离 UTC 的分钟偏移"
 *   "+08:00", "-05:30", "Asia/Shanghai", "UTC"
 * 不支持 IANA 时区名时回退到 UTC。
 */
function tzOffsetMinutes(tz) {
    if (!tz || tz === 'UTC' || tz === 'utc') return 0;
    // 形如 +08:00 / -05:30
    const m = tz.match(/^([+-])(\d{1,2}):?(\d{2})?$/);
    if (m) {
        const sign = m[1] === '-' ? -1 : 1;
        const h = parseInt(m[2], 10) || 0;
        const min = parseInt(m[3] || '0', 10) || 0;
        return sign * (h * 60 + min);
    }
    // 几个常见 IANA 兜底（不依赖 Intl 防止 Workers 环境差异）
    const map = {
        'Asia/Shanghai': 480, 'Asia/Hong_Kong': 480, 'Asia/Taipei': 480,
        'Asia/Tokyo': 540, 'Asia/Seoul': 540,
        'Asia/Singapore': 480, 'Asia/Bangkok': 420,
        'Europe/London': 0, 'Europe/Paris': 60, 'Europe/Berlin': 60,
        'America/New_York': -300, 'America/Los_Angeles': -480, 'America/Chicago': -360,
    };
    if (map[tz] !== undefined) return map[tz];
    // 最后尝试 Intl
    try {
        const d = new Date();
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
        const parts = fmt.formatToParts(d);
        const get = (t) => parseInt(parts.find(p => p.type === t)?.value, 10);
        const utc = Date.UTC(get('year'), get('month') - 1, get('day'),
                             get('hour'), get('minute'), get('second'));
        return Math.round((utc - d.getTime()) / 60000);
    } catch (_) {
        return 0;
    }
}

function currentDateString(tz) {
    const off = tzOffsetMinutes(tz);
    const now = new Date(Date.now() + off * 60 * 1000);
    return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

function secondsUntilNextDay(tz) {
    const off = tzOffsetMinutes(tz);
    const local = new Date(Date.now() + off * 60 * 1000);
    // 计算本地"今日 24:00" 对应的 UTC 时间
    const nextLocal = new Date(Date.UTC(
        local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1
    ));
    const nextUtc = nextLocal.getTime() - off * 60 * 1000;
    const sec = Math.floor((nextUtc - Date.now()) / 1000);
    return Math.max(60, sec); // 至少缓存 1 分钟，避免边界抖动
}

function json(body, status = 200, extra = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders, ...extra }
    });
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'GET') {
        return json({ error: 'Method not allowed' }, 405);
    }

    const othersConfig = await fetchOthersConfig(env);
    if (othersConfig.randomImageAPI?.enabled !== true) {
        return json({ error: 'Random is disabled' }, 403);
    }
    const allowedDirRaw = othersConfig.randomImageAPI.allowedDir || '';

    const tz = url.searchParams.get('tz') || 'UTC';
    let date = url.searchParams.get('date') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        date = currentDateString(tz);
    }

    const facetsConfig = await getFacetsConfig(env);
    const params = parseFilterParams(url.searchParams, facetsConfig);
    if (!isDirAllowed(params.dir, allowedDirRaw)) {
        return json({ error: 'Directory not allowed' }, 403);
    }

    let resolvedOrientation = params.orientation;
    if (params.isAutoMode) {
        resolvedOrientation = resolveOrientation(detectDevice(request));
    }

    const records = await loadCandidates(context, url, params);
    const { filtered, beforeOrientation } = applyMemoryFilters(records, params, resolvedOrientation);
    let list = filtered;
    if (params.isAutoMode && resolvedOrientation && list.length === 0) {
        list = beforeOrientation;
    }

    // seed = "daily-<date>-<filter-fingerprint>"
    // 把过滤条件也纳入 seed，避免不同筛选条件复用同一张图
    const fingerprint = [
        params.dir,
        params.includeTags.slice().sort().join(','),
        params.excludeTags.slice().sort().join(','),
        params.anyTagGroups.map(g => g.slice().sort().join('|')).join(';'),
        resolvedOrientation,
        params.minWidth, params.minHeight, params.maxWidth, params.maxHeight,
        params.fileType.slice().sort().join(','),
    ].join('::');
    const seed = `daily-${date}-${fingerprint}`;

    if (list.length === 0) {
        return json({ date, seed, total: 0, url: null }, 200);
    }

    const rand = createSeededRandom(seed);
    const [picked] = sampleN(list, 1, rand);

    const path = '/file/' + picked.name;
    const respType = url.searchParams.get('type');
    const respForm = url.searchParams.get('form');

    const cacheSec = secondsUntilNextDay(tz);
    const cacheHeader = `public, max-age=${cacheSec}`;

    if (respType === 'img') {
        const r = await fetch(url.origin + path);
        return new Response(r.body, {
            status: r.status,
            headers: {
                'Content-Type': r.headers.get('content-type') || 'image/jpeg',
                'Cache-Control': cacheHeader,
                ...corsHeaders
            }
        });
    }

    const finalUrl = respType === 'url' ? url.origin + path : path;
    if (respForm === 'text') {
        return new Response(finalUrl, {
            status: 200,
            headers: { 'Cache-Control': cacheHeader, ...corsHeaders }
        });
    }
    return json({
        date, seed, total: list.length,
        url: finalUrl,
        meta: {
            width: picked.Width || null,
            height: picked.Height || null,
            tags: picked.Tags || [],
        }
    }, 200, { 'Cache-Control': cacheHeader });
}
