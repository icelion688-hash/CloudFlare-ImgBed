/**
 * 公共过滤管道
 *
 * 把 /random, /api/query, /random/similar, /random/daily 的过滤语义集中起来。
 * 任何 endpoint 只需：
 *   1) 把 URLSearchParams 传给 parseFilterParams()
 *   2) 用返回的 params 调 loadCandidates()
 *   3) 用 applyMemoryFilters() 做内存级过滤
 * 三个 endpoint 行为就一致了。
 */
import { readIndex } from "./indexManager.js";
import { resolveFacetValue, getFacetsConfig } from "./facetsConfig.js";
import { snapWidth, snapBlur, snapFormat, snapQuality, snapHeight } from "./validateParams.js";

export const SQUARE_THRESHOLD = 0.1;

/**
 * 从 URLSearchParams 解析所有过滤参数（不含分页/排序）。
 * @param {URLSearchParams} sp
 * @param {Object} facetsConfig - getFacetsConfig() 的结果
 */
export function parseFilterParams(sp, facetsConfig) {
    const parseList = (raw) => {
        if (!raw) return [];
        return [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))];
    };

    // 文件类型：保持原版默认 image
    let fileType = sp.get('content');
    fileType = fileType == null ? ['image'] : fileType.split(',');

    // 方向
    const orientationParam = sp.get('orientation') || '';
    const VALID = ['landscape', 'portrait', 'square'];
    let orientation = '';
    let isAutoMode = false;
    if (VALID.includes(orientationParam)) {
        orientation = orientationParam;
    } else if (orientationParam === 'auto') {
        isAutoMode = true; // 调用方自己用 adaptive 模块决议
    }

    // 目录（去首尾斜杠，处理多斜杠）
    const dir = (sp.get('dir') || '')
        .replace(/^\/+/, '').replace(/\/{2,}/g, '/').replace(/\/$/, '');

    // 标签
    const includeTags = parseList(sp.get('tags'));
    const anyTagsParam = parseList(sp.get('anyTags'));
    const excludeTags = parseList(sp.get('excludeTags'));

    // 分面 → 解析为底层 tag
    const facetTags = [];
    const facetAnyTags = [];
    for (const facetKey of Object.keys(facetsConfig.facets || {})) {
        const facetVal = sp.get(facetKey);
        if (!facetVal) continue;
        const resolved = resolveFacetValue(facetsConfig, facetKey, facetVal);
        if (resolved.length === 1) facetTags.push(resolved[0]);
        else if (resolved.length > 1) facetAnyTags.push(resolved);
    }
    const finalIncludeTags = [...includeTags, ...facetTags];
    const finalAnyTagGroups = [];
    if (anyTagsParam.length > 0) finalAnyTagGroups.push(anyTagsParam);
    facetAnyTags.forEach(g => finalAnyTagGroups.push(g));

    // 尺寸
    const minWidth = parseInt(sp.get('minWidth'), 10) || 0;
    const minHeight = parseInt(sp.get('minHeight'), 10) || 0;
    const maxWidth = parseInt(sp.get('maxWidth'), 10) || 0;
    const maxHeight = parseInt(sp.get('maxHeight'), 10) || 0;

    return {
        fileType,
        orientation,
        isAutoMode,
        dir,
        includeTags: finalIncludeTags,
        anyTagGroups: finalAnyTagGroups,
        excludeTags,
        minWidth, minHeight, maxWidth, maxHeight,
    };
}

/**
 * 校验目录是否在允许列表中
 */
export function isDirAllowed(dir, allowedDirRaw) {
    const allowedDirList = (allowedDirRaw || '').split(',').map(item =>
        item.trim().replace(/^\/+/, '').replace(/\/{2,}/g, '/').replace(/\/$/, '')
    );
    for (const allowed of allowedDirList) {
        if (allowed === '' || dir === allowed || dir.startsWith(allowed + '/')) {
            return true;
        }
    }
    return false;
}

/**
 * 读取候选列表（按 dir + includeTags + excludeTags 维度缓存）。
 * 其他轻量过滤(content/orientation/尺寸/anyTags)留到内存阶段。
 */
export async function loadCandidates(context, originUrl, params) {
    const cache = caches.default;
    const tagKey = [
        params.includeTags.slice().sort().join('|'),
        params.excludeTags.slice().sort().join('|'),
    ].join('!');
    const cacheUrl = `${originUrl.origin}/api/randomFileList?dir=${encodeURIComponent(params.dir)}&t=${encodeURIComponent(tagKey)}`;

    const cacheRes = await cache.match(cacheUrl);
    if (cacheRes) {
        return JSON.parse(await cacheRes.text());
    }

    const readResult = await readIndex(context, {
        directory: params.dir,
        count: -1,
        includeSubdirFiles: true,
        accessStatus: 'normal',
        includeTags: params.includeTags,
        excludeTags: params.excludeTags,
    });

    const allRecords = (readResult.files || []).map(item => ({
        name: item.id,
        FileType: item.metadata?.FileType,
        FileSize: item.metadata?.FileSize,
        FileSizeBytes: item.metadata?.FileSizeBytes,
        Width: item.metadata?.Width,
        Height: item.metadata?.Height,
        Tags: item.metadata?.Tags || [],
        Directory: item.metadata?.Directory,
        TimeStamp: item.metadata?.TimeStamp,
    }));

    await cache.put(cacheUrl, new Response(JSON.stringify(allRecords), {
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=86400",
        }
    }));

    return allRecords;
}

/**
 * 内存级过滤：fileType + anyTagGroups + 尺寸 + orientation
 * @param {Array} records
 * @param {Object} params - parseFilterParams() 的结果
 * @param {string} [resolvedOrientation] - 已解析后的方向；为空则不过滤
 * @returns {{ filtered:Array, beforeOrientation:Array }}
 */
export function applyMemoryFilters(records, params, resolvedOrientation = '') {
    let out = records;

    // 1) 文件类型
    out = out.filter(r => params.fileType.some(t => r.FileType?.includes(t)));

    // 2) anyTags 分组之间 AND，组内 OR
    if (params.anyTagGroups.length > 0) {
        out = out.filter(r => {
            const tagsLower = (r.Tags || []).map(t => t.toLowerCase());
            return params.anyTagGroups.every(group =>
                group.some(needed => tagsLower.includes(needed.toLowerCase()))
            );
        });
    }

    // 3) 尺寸
    if (params.minWidth || params.minHeight || params.maxWidth || params.maxHeight) {
        out = out.filter(r => {
            if (!r.Width || !r.Height) return false;
            if (params.minWidth && r.Width < params.minWidth) return false;
            if (params.minHeight && r.Height < params.minHeight) return false;
            if (params.maxWidth && r.Width > params.maxWidth) return false;
            if (params.maxHeight && r.Height > params.maxHeight) return false;
            return true;
        });
    }

    const beforeOrientation = out;

    // 4) 方向
    if (resolvedOrientation) {
        out = out.filter(r => {
            if (!r.Width || !r.Height) return false;
            const ratio = r.Width / r.Height;
            switch (resolvedOrientation) {
                case 'landscape': return ratio > 1 + SQUARE_THRESHOLD;
                case 'portrait':  return ratio < 1 - SQUARE_THRESHOLD;
                case 'square':    return ratio >= 1 - SQUARE_THRESHOLD && ratio <= 1 + SQUARE_THRESHOLD;
                default: return true;
            }
        });
    }

    return { filtered: out, beforeOrientation };
}

/**
 * 基于 seed 字符串的 mulberry32 RNG
 */
export function createSeededRandom(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * 部分 Fisher-Yates 抽样
 */
export function sampleN(arr, n, rand = Math.random) {
    if (n >= arr.length) {
        const copy = arr.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }
    const copy = arr.slice();
    const result = [];
    for (let i = 0; i < n; i++) {
        const j = i + Math.floor(rand() * (copy.length - i));
        [copy[i], copy[j]] = [copy[j], copy[i]];
        result.push(copy[i]);
    }
    return result;
}

/**
 * 排序工具
 */
export function sortRecords(arr, sortKey, sortOrder = 'desc') {
    if (!sortKey) return arr;
    const dir = sortOrder === 'asc' ? 1 : -1;
    const cmp = (a, b) => {
        let va, vb;
        switch (sortKey) {
            case 'time':
                va = a.TimeStamp || 0; vb = b.TimeStamp || 0; break;
            case 'size':
                va = a.FileSizeBytes || 0; vb = b.FileSizeBytes || 0; break;
            case 'width':
                va = a.Width || 0; vb = b.Width || 0; break;
            case 'height':
                va = a.Height || 0; vb = b.Height || 0; break;
            case 'name':
                va = a.name || ''; vb = b.name || '';
                return va.localeCompare(vb) * dir;
            default:
                return 0;
        }
        return (va - vb) * dir;
    };
    return arr.slice().sort(cmp);
}

/**
 * Jaccard 相似度（按 tag 集合）
 */
export function jaccardSimilarity(setA, arrB) {
    if (!setA || setA.size === 0 || !arrB || arrB.length === 0) return 0;
    let intersect = 0;
    const setB = new Set();
    for (const t of arrB) {
        const lt = t.toLowerCase();
        setB.add(lt);
        if (setA.has(lt)) intersect++;
    }
    const union = setA.size + setB.size - intersect;
    return union === 0 ? 0 : intersect / union;
}

// 尺寸预设映射
const SIZE_PRESETS = {
    thumb:    { w: 400,  q: 60 },
    small:    { w: 640,  q: 75 },
    medium:   { w: 1024, q: 80 },
    large:    { w: 1920, q: 85 },
};

/**
 * 从请求参数中解析图片尺寸参数
 * @param {URLSearchParams} sp
 * @returns {Object|null} 尺寸参数对象，无参数时返回 null
 */
export function parseImageSizeParams(sp) {
    const size = sp.get('size');
    const w = sp.get('w');
    const h = sp.get('h');
    const q = sp.get('q');
    const f = sp.get('f');

    const blur = sp.get('blur');

    // 如果没有任何尺寸参数，返回 null
    if (!size && !w && !h && !q && !f && !blur) return null;
    if (size === 'original') return null;

    const preset = SIZE_PRESETS[size] || {};
    return {
        w: snapWidth(w) || preset.w || null,
        h: snapHeight(h) || null,
        q: snapQuality(q || preset.q) || null,
        f: snapFormat(f) || null,
        blur: snapBlur(blur) || null,
    };
}

/**
 * 将尺寸参数附加到图片路径上
 * @param {string} path - 图片路径
 * @param {Object|null} sizeParams - parseImageSizeParams() 的返回值
 * @returns {string} 附加参数后的路径
 */
export function appendSizeParams(path, sizeParams) {
    if (!sizeParams) return path;
    const parts = [];
    if (sizeParams.w) parts.push('w=' + sizeParams.w);
    if (sizeParams.h) parts.push('h=' + sizeParams.h);
    if (sizeParams.q) parts.push('q=' + sizeParams.q);
    if (sizeParams.f) parts.push('f=' + sizeParams.f);
    if (sizeParams.blur) parts.push('blur=' + sizeParams.blur);
    if (parts.length === 0) return path;
    const sep = path.includes('?') ? '&' : '?';
    return path + sep + parts.join('&');
}

export { getFacetsConfig };
