/**
 * GET /api/query
 *
 * 结构化查询接口。与 /random 共享同一套过滤参数语义，但：
 *   - 不做随机抽样
 *   - 支持分页（offset, limit）
 *   - 支持排序（sort=time|size|width|height|name, order=asc|desc）
 *   - 返回每张图的元数据（尺寸、tag、文件大小、时间戳）
 *
 * 适用场景：前端画廊、批量下载、构造器的"网格预览"
 *
 * 查询参数：
 *   过滤类：和 /random 一致（color/category/mood/tags/anyTags/excludeTags/
 *           orientation/content/dir/minWidth/minHeight/maxWidth/maxHeight）
 *   分页：  offset (默认0)、limit (默认24, 最大100)
 *   排序：  sort (time|size|width|height|name|random)
 *           order (asc|desc, 默认 desc)
 *           seed  (sort=random 时用于可重现)
 *   返回：  fields=urls (只返 URL 列表) 或 full (默认, 含元数据)
 *
 * 响应：
 * {
 *   total: 487,
 *   offset: 0,
 *   limit: 24,
 *   files: [
 *     { url, path, width, height, ratio, size, tags, timestamp }, ...
 *   ]
 * }
 */
import { fetchOthersConfig } from "../utils/sysConfig";
import { detectDevice, resolveOrientation } from "../random/adaptive.js";
import {
    parseFilterParams,
    isDirAllowed,
    loadCandidates,
    applyMemoryFilters,
    createSeededRandom,
    sampleN,
    sortRecords,
    getFacetsConfig,
    parseImageSizeParams,
    appendSizeParams,
} from "../utils/filterPipeline.js";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

function json(body, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders, ...extraHeaders }
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
        return json({ error: 'Random API is disabled' }, 403);
    }
    const allowedDirRaw = othersConfig.randomImageAPI.allowedDir || '';

    const facetsConfig = await getFacetsConfig(env);
    const params = parseFilterParams(url.searchParams, facetsConfig);
    // 解析图片尺寸缩放参数
    const sizeParams = parseImageSizeParams(url.searchParams);

    if (!isDirAllowed(params.dir, allowedDirRaw)) {
        return json({ error: 'Directory not allowed' }, 403);
    }

    // 解析方向
    let resolvedOrientation = params.orientation;
    if (params.isAutoMode) {
        const deviceInfo = detectDevice(request);
        resolvedOrientation = resolveOrientation(deviceInfo);
    }

    // 分页 + 排序
    const offset = Math.max(0, parseInt(url.searchParams.get('offset'), 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 24));
    const sort = (url.searchParams.get('sort') || 'time').toLowerCase();
    const order = (url.searchParams.get('order') || 'desc').toLowerCase();
    const seed = url.searchParams.get('seed') || '';
    const fields = (url.searchParams.get('fields') || 'full').toLowerCase();
    const wantFull = fields !== 'urls';

    // 候选
    const records = await loadCandidates(context, url, params);
    const { filtered, beforeOrientation } = applyMemoryFilters(records, params, resolvedOrientation);
    let list = filtered;
    if (params.isAutoMode && resolvedOrientation && list.length === 0) {
        list = beforeOrientation;
    }

    const total = list.length;

    // 排序
    if (sort === 'random') {
        const rand = seed ? createSeededRandom(seed) : Math.random;
        // 完全打乱后分页
        list = sampleN(list, list.length, rand);
    } else {
        list = sortRecords(list, sort, order);
    }

    // 分页
    const page = list.slice(offset, offset + limit);

    if (!wantFull) {
        const urls = page.map(r => url.origin + appendSizeParams('/file/' + r.name, sizeParams));
        return json({ total, offset, limit, urls });
    }

    const files = page.map(r => {
        const path = appendSizeParams('/file/' + r.name, sizeParams);
        const ratio = (r.Width && r.Height) ? Math.round((r.Width / r.Height) * 1000) / 1000 : null;
        return {
            id: r.name,
            url: url.origin + path,
            path,
            width: r.Width || null,
            height: r.Height || null,
            ratio,
            size: r.FileSize || null,
            sizeBytes: r.FileSizeBytes || null,
            tags: r.Tags || [],
            directory: r.Directory || null,
            timestamp: r.TimeStamp || null,
            fileType: r.FileType || null,
        };
    });

    return json({ total, offset, limit, sort, order, files }, 200, {
        'Cache-Control': 'public, max-age=60'
    });
}
