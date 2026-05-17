/**
 * GET /random/similar
 *
 * 根据某张图的 tag 集合，找出 tag 重叠度最高的其他图。
 *
 * 查询参数：
 *   id            (必填) 目标图 id（路径形式，如 wallpaper/static/横图/xxx.png）
 *                 也支持完整 /file/xxx 路径形式
 *   count         返回数量，默认 12，最大 100
 *   minScore      Jaccard 相似度阈值（0–1），默认 0.05
 *   excludeSelf   是否排除目标本身（默认 true）
 *   sameOrientation 仅返回相同方向的图（默认 false）
 *   weightFacet   是否优先考虑分面（color/category/mood）匹配（默认 true）
 *   type          url / img（同 /random）
 *   form          text / json
 *
 * 响应：
 * {
 *   target: { id, tags },
 *   total: 35,
 *   results: [
 *     { url, path, score, tags, width, height }, ...
 *   ]
 * }
 *
 * 实现思路：
 *   1. 用全量索引找目标图，取出它的 Tags
 *   2. 候选集 = 同目录下所有正常图
 *   3. 对每张图算 Jaccard 相似度（tag 集合）
 *   4. 给分面 tag（已配置在 facets 中的 tag）加权，让"颜色+主题"匹配优先
 *   5. 按 score 排序，截 topN
 */
import { fetchOthersConfig } from "../utils/sysConfig";
import { readIndex } from "../utils/indexManager.js";
import { getFacetsConfig, jaccardSimilarity } from "../utils/filterPipeline.js";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

const SQUARE_THRESHOLD = 0.1;

function classifyOrientation(w, h) {
    if (!w || !h) return null;
    const r = w / h;
    if (r > 1 + SQUARE_THRESHOLD) return 'landscape';
    if (r < 1 - SQUARE_THRESHOLD) return 'portrait';
    return 'square';
}

function json(body, status = 200, extra = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders, ...extra }
    });
}

/**
 * 收集所有在 facets 配置中的 tag 值（这些 tag 在相似度计算中加权）
 */
function collectFacetTags(facetsConfig) {
    const out = new Set();
    for (const facet of Object.values(facetsConfig.facets || {})) {
        for (const v of facet.values || []) {
            out.add((v.value || '').toLowerCase());
        }
    }
    return out;
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

    let id = (url.searchParams.get('id') || '').trim();
    if (!id) {
        return json({ error: 'Parameter "id" is required' }, 400);
    }
    // 兼容 /file/xxx 写法
    id = id.replace(/^\/+/, '').replace(/^file\//, '');

    const count = Math.min(100, Math.max(1, parseInt(url.searchParams.get('count'), 10) || 12));
    const minScore = parseFloat(url.searchParams.get('minScore'));
    const threshold = Number.isFinite(minScore) ? Math.max(0, Math.min(1, minScore)) : 0.05;
    const excludeSelf = url.searchParams.get('excludeSelf') !== 'false';
    const sameOrient = url.searchParams.get('sameOrientation') === 'true';
    const weightFacet = url.searchParams.get('weightFacet') !== 'false';

    // 读取全量索引（accessStatus=normal）
    const idx = await readIndex(context, {
        directory: '',
        count: -1,
        includeSubdirFiles: true,
        accessStatus: 'normal',
    });
    const files = idx.files || [];

    // 找到目标图
    const target = files.find(f => f.id === id);
    if (!target) {
        return json({ error: 'Target image not found or not accessible' }, 404);
    }
    const targetTags = (target.metadata?.Tags || []).map(t => t.toLowerCase());
    if (targetTags.length === 0) {
        return json({
            target: { id: target.id, tags: [] },
            total: 0,
            results: [],
            warning: 'Target image has no tags; similarity is undefined.'
        });
    }
    const targetSet = new Set(targetTags);
    const targetOrient = classifyOrientation(target.metadata?.Width, target.metadata?.Height);

    // 分面 tag 集合（加权用）
    const facetsConfig = await getFacetsConfig(env);
    const facetTagSet = weightFacet ? collectFacetTags(facetsConfig) : new Set();

    // 计算相似度
    const scored = [];
    for (const f of files) {
        if (excludeSelf && f.id === id) continue;
        const tags = f.metadata?.Tags || [];
        if (tags.length === 0) continue;
        if (sameOrient && classifyOrientation(f.metadata?.Width, f.metadata?.Height) !== targetOrient) continue;

        let score = jaccardSimilarity(targetSet, tags);
        if (score < threshold) continue;

        // 分面加权：每命中一个目标的分面 tag，加成 0.05
        if (weightFacet && facetTagSet.size > 0) {
            let bonus = 0;
            for (const t of tags) {
                const lt = t.toLowerCase();
                if (facetTagSet.has(lt) && targetSet.has(lt)) {
                    bonus += 0.05;
                }
            }
            score = Math.min(1, score + bonus);
        }

        scored.push({
            id: f.id,
            score: Math.round(score * 1000) / 1000,
            tags: f.metadata?.Tags || [],
            width: f.metadata?.Width || null,
            height: f.metadata?.Height || null,
        });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, count);

    // 单图直返
    const respType = url.searchParams.get('type');
    const respForm = url.searchParams.get('form');
    if (count === 1 && top.length > 0) {
        const path = '/file/' + top[0].id;
        if (respType === 'img') {
            const r = await fetch(url.origin + path);
            return new Response(r.body, {
                status: r.status,
                headers: { 'Content-Type': r.headers.get('content-type') || 'image/jpeg', ...corsHeaders }
            });
        }
        const finalUrl = respType === 'url' ? url.origin + path : path;
        if (respForm === 'text') {
            return new Response(finalUrl, { status: 200, headers: corsHeaders });
        }
    }

    return json({
        target: { id: target.id, tags: target.metadata?.Tags || [] },
        total: scored.length,
        results: top.map(r => ({
            id: r.id,
            url: url.origin + '/file/' + r.id,
            path: '/file/' + r.id,
            score: r.score,
            tags: r.tags,
            width: r.width,
            height: r.height,
        }))
    }, 200, { 'Cache-Control': 'public, max-age=300' });
}
