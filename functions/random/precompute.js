/**
 * GET /random/precompute
 *
 * 批量预取接口：一次返回 LQIP + HD 两张图的最终 URL，
 * 省去前端的两次 302 重定向跳转。
 *
 * 查询参数：
 *   interval  刷新间隔秒数（必填，60~604800）
 *   type      url → 返回完整 URL（含 scheme+host），否则返回相对路径
 *   过滤参数  同 /random（color/category/mood/tags/dir/orientation/minWidth/...）
 *   hdw       HD 图宽度（默认 1920）
 *   lqipw     LQIP 图宽度（默认 40）
 *   lqipblur  LQIP 模糊强度（默认 20）
 *
 * 响应：
 *   {
 *     lqip: "https://host/file/xxx?w=40&blur=20&q=60&f=auto",
 *     hd:   "https://host/file/xxx?w=1920&f=auto",
 *     meta: { width, height, tags },
 *     ttl: 3600,
 *     nextChangeIn: 1234
 *   }
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
import {
    jsonResponse,
    buildFilterFingerprint,
} from "../utils/responseHelper.js";
import { snapWidth, snapBlur, snapFormat } from "../utils/validateParams.js";

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
            error: 'Invalid or missing "interval" parameter. Must be an integer between 60 and 604800.'
        }, 400);
    }

    const facetsConfig = await getFacetsConfig(env);
    const params = parseFilterParams(url.searchParams, facetsConfig);

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

    // 计算时间段
    const nowSec = Math.floor(Date.now() / 1000);
    const periodIndex = Math.floor(nowSec / interval);
    const nextChangeIn = interval - (nowSec % interval);

    // 生成 seed（与 /random/interval 一致，确保同周期选同一张图）
    const fingerprint = buildFilterFingerprint(params, resolvedOrientation);
    const seed = `interval-${periodIndex}-${fingerprint}`;

    if (list.length === 0) {
        return jsonResponse({
            lqip: null, hd: null, meta: null,
            ttl: interval, nextChangeIn,
        }, 200);
    }

    const rand = createSeededRandom(seed);
    const [picked] = sampleN(list, 1, rand);

    // 解析 HD/LQIP 参数（带白名单校验）
    const hdWidth = snapWidth(url.searchParams.get('hdw') || '1920') || 1920;
    const lqipWidth = snapWidth(url.searchParams.get('lqipw') || '40') || 40;
    const lqipBlur = snapBlur(url.searchParams.get('lqipblur') || '20') || 20;
    // OPT-06: 读取 f 参数并应用到 URL，避免前端 forceFormat 兜底导致缓存碎片
    const format = snapFormat(url.searchParams.get('f') || 'auto');

    const basePath = '/file/' + picked.name;
    const lqipPath = `${basePath}?w=${lqipWidth}&blur=${lqipBlur}&q=60&f=${format}`;
    const hdPath = `${basePath}?w=${hdWidth}&f=${format}`;

    // type=url 时返回完整 URL（前端强烈建议默认行为）
    const useFullUrl = url.searchParams.get('type') === 'url';
    const prefix = useFullUrl ? url.origin : '';
    const lqipUrl = prefix + lqipPath;
    const hdUrl = prefix + hdPath;

    const cacheSec = Math.max(60, nextChangeIn);

    // ETag：基于 seed + format 生成弱验证标签，同周期 + 同格式 → 同 ETag
    const etag = `W/"${seed}-${format}"`;

    // 检查 If-None-Match（304 缓存）
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === etag) {
        return new Response(null, {
            status: 304,
            headers: {
                'ETag': etag,
                'Cache-Control': `public, max-age=${cacheSec}, s-maxage=${cacheSec}`,
            },
        });
    }

    // Link preload 提示：让浏览器在解析 JSON 前就开始预取图片
    const hdFullUrl = url.origin + hdPath;
    const lqipFullUrl = url.origin + lqipPath;

    return jsonResponse({
        lqip: lqipUrl,
        hd: hdUrl,
        meta: {
            width: picked.Width || null,
            height: picked.Height || null,
            tags: picked.Tags || [],
        },
        ttl: interval,
        nextChangeIn,
        seed,
    }, 200, {
        'Cache-Control': `public, max-age=${cacheSec}, s-maxage=${cacheSec}`,
        'Vary': 'Accept',
        'ETag': etag,
        'Link': `<${hdFullUrl}>; rel="preload"; as="image"; fetchpriority="high", <${lqipFullUrl}>; rel="preload"; as="image"`,
    });
}
