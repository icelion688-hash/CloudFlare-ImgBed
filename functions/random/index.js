import { fetchOthersConfig } from "../utils/sysConfig";
import { detectDevice, resolveOrientation, addClientHintsHeaders } from "./adaptive.js";
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

export async function onRequest(context) {
    const { request, env } = context;
    const requestUrl = new URL(request.url);

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const othersConfig = await fetchOthersConfig(env);
    if (othersConfig.randomImageAPI?.enabled !== true) {
        return new Response(JSON.stringify({ error: "Random is disabled" }), {
            status: 403, headers: corsHeaders
        });
    }
    const allowedDirRaw = othersConfig.randomImageAPI.allowedDir || '';

    const facetsConfig = await getFacetsConfig(env);
    const params = parseFilterParams(requestUrl.searchParams, facetsConfig);

    if (!isDirAllowed(params.dir, allowedDirRaw)) {
        return new Response(JSON.stringify({ error: "Directory not allowed" }), {
            status: 403, headers: corsHeaders
        });
    }

    // 解析方向（含 auto 模式）
    let resolvedOrientation = params.orientation;
    if (params.isAutoMode) {
        const deviceInfo = detectDevice(request);
        resolvedOrientation = resolveOrientation(deviceInfo);
    }

    // 批量参数
    const countParam = parseInt(requestUrl.searchParams.get('count'), 10);
    const batchCount = Number.isFinite(countParam) && countParam > 0
        ? Math.min(countParam, 100) : 1;
    const seed = requestUrl.searchParams.get('seed') || '';

    // 拉候选 + 过滤
    const records = await loadCandidates(context, requestUrl, params);
    const { filtered, beforeOrientation } = applyMemoryFilters(records, params, resolvedOrientation);

    // auto 模式降级：方向过滤后空 → 用方向过滤前的集合
    let finalList = filtered;
    if (params.isAutoMode && resolvedOrientation && finalList.length === 0) {
        finalList = beforeOrientation;
    }

    const responseHeaders = new Headers(corsHeaders);
    if (params.isAutoMode) {
        addClientHintsHeaders(responseHeaders);
    }

    if (finalList.length === 0) {
        const body = batchCount > 1 ? { urls: [], total: 0 } : {};
        return new Response(JSON.stringify(body), { status: 200, headers: responseHeaders });
    }

    const rand = seed ? createSeededRandom(seed) : Math.random;
    const picked = sampleN(finalList, batchCount, rand);

    const randomType = requestUrl.searchParams.get('type');
    const resType = requestUrl.searchParams.get('form');

    // 批量模式
    if (batchCount > 1) {
        const urls = picked.map(rec => {
            const p = '/file/' + rec.name;
            return randomType === 'url' ? requestUrl.origin + p : p;
        });
        if (resType === 'text') {
            return new Response(urls.join('\n'), { status: 200, headers: responseHeaders });
        }
        return new Response(JSON.stringify({ urls, total: finalList.length }), {
            status: 200, headers: responseHeaders
        });
    }

    // 单张模式
    const randomKey = picked[0];
    const randomPath = '/file/' + randomKey.name;
    let randomUrl = randomPath;

    if (randomType === 'url') {
        randomUrl = requestUrl.origin + randomPath;
    }

    if (randomType === 'img') {
        randomUrl = requestUrl.origin + randomPath;
        let contentType = 'image/jpeg';
        const imgHeaders = new Headers(responseHeaders);
        return new Response(await fetch(randomUrl).then(res => {
            contentType = res.headers.get('content-type');
            return res.blob();
        }), {
            headers: (() => {
                imgHeaders.set('Content-Type', contentType || 'image/jpeg');
                return imgHeaders;
            })(),
            status: 200
        });
    }

    if (resType === 'text') {
        return new Response(randomUrl, { status: 200, headers: responseHeaders });
    }
    return new Response(JSON.stringify({ url: randomUrl }), { status: 200, headers: responseHeaders });
}
