/**
 * GET  /api/manage/facets   - 读取当前的分面配置
 * POST /api/manage/facets   - 覆盖式更新分面配置（body 为完整 JSON）
 *
 * 鉴权由 /api/manage 的 _middleware.js 统一处理。
 *
 * POST body 格式：
 * {
 *   "facets": {
 *     "<facetKey>": {
 *       "label": "...",
 *       "description": "...",
 *       "values": [
 *         { "value": "<底层 tag>", "label": "<显示名>", "aliases": ["alias1","alias2"] }
 *       ]
 *     }
 *   }
 * }
 */
import { getFacetsConfig, saveFacetsConfig, DEFAULT_FACETS } from "../../utils/facetsConfig.js";

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function validateFacetsConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return 'config must be an object';
    if (!cfg.facets || typeof cfg.facets !== 'object') return 'config.facets is required';

    for (const [key, facet] of Object.entries(cfg.facets)) {
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
            return `invalid facet key: "${key}" (must match /^[a-zA-Z][a-zA-Z0-9_]*$/)`;
        }
        if (!facet || typeof facet !== 'object') {
            return `facet "${key}" must be an object`;
        }
        if (!Array.isArray(facet.values)) {
            return `facet "${key}".values must be an array`;
        }
        for (const v of facet.values) {
            if (!v || typeof v !== 'object') return `facet "${key}" has invalid value entry`;
            if (typeof v.value !== 'string' || !v.value.trim()) {
                return `facet "${key}" has a value entry with empty .value`;
            }
            if (v.aliases !== undefined && !Array.isArray(v.aliases)) {
                return `facet "${key}".values[].aliases must be an array if provided`;
            }
        }
    }
    return null;
}

export async function onRequest(context) {
    const { request, env } = context;
    const method = request.method.toUpperCase();

    if (method === 'GET') {
        const cfg = await getFacetsConfig(env);
        return jsonResponse({ config: cfg, isDefault: cfg === DEFAULT_FACETS });
    }

    if (method === 'POST' || method === 'PUT') {
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return jsonResponse({ error: 'Invalid JSON body' }, 400);
        }

        // 支持两种：{ config: {...} } 或直接 {...}
        const cfg = body.config && typeof body.config === 'object' ? body.config : body;

        const err = validateFacetsConfig(cfg);
        if (err) {
            return jsonResponse({ error: err }, 400);
        }

        try {
            await saveFacetsConfig(env, cfg);
            return jsonResponse({ success: true });
        } catch (e) {
            return jsonResponse({ error: e.message || 'Save failed' }, 500);
        }
    }

    if (method === 'DELETE') {
        // 重置为默认（直接删除 KV key）
        try {
            if (env && env.img_url) {
                await env.img_url.delete('@@facetsConfig');
            }
            return jsonResponse({ success: true, reset: true });
        } catch (e) {
            return jsonResponse({ error: e.message }, 500);
        }
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
}
