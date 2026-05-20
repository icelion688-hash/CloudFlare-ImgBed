/**
 * GET /random/interval
 *
 * 定时刷新图。与 daily 类似，但支持自定义刷新间隔（秒）。
 * 在同一时间段内、相同过滤条件下返回同一张图。
 *
 * 查询参数：
 *   interval  刷新间隔秒数（必填，60~604800）。预设：3600/21600/43200/86400/604800
 *   过滤参数  同 /random（color/category/mood/tags/dir/orientation/minWidth/...）
 *   尺寸参数  size/w/h/q/f
 *   type      url / img
 *   form      text / json
 *
 * 响应：
 *   {
 *     interval: 3600,
 *     periodIndex: 12345,
 *     nextChangeIn: 1234,
 *     seed: "interval-12345-...",
 *     total: 100,
 *     url: "/file/xxx.jpg"
 *   }
 *
 * 缓存：Cache-Control: public, max-age=<剩余秒数>
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
    parseImageSizeParams,
    appendSizeParams,
} from "../utils/filterPipeline.js";
import {
    jsonResponse,
    fetchImageWithRetry,
    parseResponseMode,
    buildFilterFingerprint,
} from "../utils/responseHelper.js";

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const othersConfig = await fetchOthersConfig(env);
    if (othersConfig.randomImageAPI?.enabled !== true) {
        return jsonResponse({ error: 'Random is disabled' }, 403);
    }
    const allowedDirRaw = othersConfig.randomImageAPI.allowedDir || '';

    // 解析 interval 参数
    const intervalRaw = parseInt(url.searchParams.get('interval'), 10);
    const interval = (Number.isFinite(intervalRaw) && intervalRaw >= 60 && intervalRaw <= 604800)
        ? intervalRaw
        : null;

    if (interval === null) {
        return jsonResponse({
            error: 'Invalid or missing "interval" parameter. Must be an integer between 60 and 604800 (7 days).'
        }, 400);
    }

    const facetsConfig = await getFacetsConfig(env);
    const params = parseFilterParams(url.searchParams, facetsConfig);
    const sizeParams = parseImageSizeParams(url.searchParams);

    if (!isDirAllowed(params.dir, allowedDirRaw)) {
        return jsonResponse({ error: 'Directory not allowed' }, 403);
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

    // 计算当前时间段编号
    const nowSec = Math.floor(Date.now() / 1000);
    const periodIndex = Math.floor(nowSec / interval);

    // 计算距下一时间段的剩余秒数
    const nextChangeIn = interval - (nowSec % interval);

    // 生成 seed：包含 interval、periodIndex 和过滤条件指纹
    const fingerprint = buildFilterFingerprint(params, resolvedOrientation);
    const seed = `interval-${periodIndex}-${fingerprint}`;

    if (list.length === 0) {
        return jsonResponse({ interval, periodIndex, nextChangeIn, seed, total: 0, url: null }, 200);
    }

    const rand = createSeededRandom(seed);
    const [picked] = sampleN(list, 1, rand);

    const path = appendSizeParams('/file/' + picked.name, sizeParams);
    const { respType, respForm } = parseResponseMode(request, url.searchParams);

    const cacheSec = Math.max(60, nextChangeIn); // 至少缓存 1 分钟，避免边界抖动
    const cacheHeader = `public, max-age=${cacheSec}`;
    // Vary: Accept 确保 CDN 对 JSON 响应和图片响应分别缓存
    const varyHeader = { 'Vary': 'Accept' };

    if (respType === 'img') {
        return fetchImageWithRetry(url.origin + path, { 'Cache-Control': cacheHeader });
    }

    const finalUrl = respType === 'url' ? url.origin + path : path;
    if (respForm === 'text') {
        return new Response(finalUrl, {
            status: 200,
            headers: { 'Cache-Control': cacheHeader, ...varyHeader }
        });
    }
    return jsonResponse({
        interval,
        periodIndex,
        nextChangeIn,
        seed,
        total: list.length,
        url: finalUrl,
        meta: {
            width: picked.Width || null,
            height: picked.Height || null,
            tags: picked.Tags || [],
        }
    }, 200, { 'Cache-Control': cacheHeader, ...varyHeader });
}
