/**
 * GET /api/facets
 *
 * 返回当前图库可用的"分面"信息：颜色、主题、氛围等，以及每个分面值在当前
 * 库中对应的图片数量。前端 API 构造器据此渲染下拉/标签选择器。
 *
 * 可选 query：
 *   - dir       限定统计范围到某个目录（与 /random 的 dir 参数语义一致）
 *   - countOnly true 时不返回所有 tag 列表，只返回 facets（更轻量）
 *
 * 返回：
 * {
 *   "facets": {
 *     "color":    { "label": "...", "values": [ { value, label, aliases, count } ] },
 *     "category": { ... },
 *     "mood":     { ... }
 *   },
 *   "directories": ["wallpaper/static/横图", ...],   // 当前允许目录
 *   "orientations": { "landscape": 10271, "portrait": 427, "square": 14 },
 *   "totalFiles": 10726,
 *   "allTags": [ { tag, count } ]                    // countOnly=false 时返回
 * }
 */
import { fetchOthersConfig } from "../utils/sysConfig";
import { readIndex } from "../utils/indexManager";
import { getFacetsConfig } from "../utils/facetsConfig.js";
import { checkPublicApiAuth } from "../utils/publicApiAuth.js";
import { isDirAllowed, SQUARE_THRESHOLD } from "../utils/filterPipeline.js";
import { jsonResponse } from "../utils/responseHelper.js";

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    try {
        // 与 /random 复用同一个开关：随机图功能开启时才暴露 facets
        const othersConfig = await fetchOthersConfig(env);
        if (!othersConfig.randomImageAPI?.enabled) {
            return jsonResponse({ error: 'Random API is disabled' }, 403);
        }

        // 可选认证检查
        const authResponse = await checkPublicApiAuth(context);
        if (authResponse) return authResponse;

        const allowedDirRaw = othersConfig.randomImageAPI.allowedDir || '';

        let dir = (url.searchParams.get('dir') || '').replace(/^\/+/, '').replace(/\/{2,}/g, '/').replace(/\/$/, '');
        // 校验 dir 是否在允许范围内（复用公共函数）
        if (!isDirAllowed(dir, allowedDirRaw)) {
            return jsonResponse({ error: 'Directory not allowed' }, 403);
        }

        const countOnly = url.searchParams.get('countOnly') === 'true';

        // 读取候选索引
        const readResult = await readIndex(context, {
            directory: dir,
            count: -1,
            includeSubdirFiles: true,
            accessStatus: 'normal',
        });
        const files = readResult.files || [];

        // 统计：tag 计数 + 方向计数 + 目录集合
        const tagCounter = new Map();
        const orientationCounter = { landscape: 0, portrait: 0, square: 0, unknown: 0 };
        const dirSet = new Set();

        for (const f of files) {
            const md = f.metadata || {};
            const tags = md.Tags || [];
            for (const t of tags) {
                if (!t) continue;
                tagCounter.set(t, (tagCounter.get(t) || 0) + 1);
            }
            const w = md.Width, h = md.Height;
            if (w && h) {
                const ratio = w / h;
                if (ratio > 1 + SQUARE_THRESHOLD) orientationCounter.landscape++;
                else if (ratio < 1 - SQUARE_THRESHOLD) orientationCounter.portrait++;
                else orientationCounter.square++;
            } else {
                orientationCounter.unknown++;
            }
            const d = md.Directory || '';
            if (d) {
                // 取首级目录到三级目录作为可选项
                const cleaned = d.replace(/\/$/, '');
                if (cleaned) dirSet.add(cleaned);
            }
        }

        // 第二次扫描：为每个分面值挑选一张"样本图"（首张匹配即可）
        const sampleByFacetValue = new Map();
        const facetsConfig = await getFacetsConfig(env);
        // 收集所有需要找样本的分面 tag
        const needSample = new Set();
        for (const facet of Object.values(facetsConfig.facets || {})) {
            for (const v of facet.values || []) {
                if ((tagCounter.get(v.value) || 0) > 0) needSample.add(v.value);
            }
        }
        // 一次遍历填充
        if (needSample.size > 0) {
            for (const f of files) {
                const tags = f.metadata?.Tags || [];
                for (const t of tags) {
                    if (needSample.has(t) && !sampleByFacetValue.has(t)) {
                        sampleByFacetValue.set(t, '/file/' + f.id);
                    }
                }
                if (sampleByFacetValue.size === needSample.size) break;
            }
        }

        // 加载分面配置，并附加每个值的命中数量 + 样本
        const facetsOut = {};
        for (const [key, facet] of Object.entries(facetsConfig.facets || {})) {
            facetsOut[key] = {
                label: facet.label || key,
                description: facet.description || '',
                values: (facet.values || []).map(v => ({
                    value: v.value,
                    label: v.label || v.value,
                    aliases: v.aliases || [],
                    count: tagCounter.get(v.value) || 0,
                    sample: sampleByFacetValue.get(v.value) || null,
                }))
            };
        }

        const responseBody = {
            facets: facetsOut,
            orientations: orientationCounter,
            directories: Array.from(dirSet).sort(),
            totalFiles: files.length,
        };

        if (!countOnly) {
            // 返回所有 tag 的计数，便于构造"自由标签"模式
            const allTags = Array.from(tagCounter.entries())
                .map(([tag, count]) => ({ tag, count }))
                .sort((a, b) => b.count - a.count);
            responseBody.allTags = allTags;
        }

        return jsonResponse(responseBody, 200, {
            'Cache-Control': 'public, max-age=300',
        });
    } catch (err) {
        console.error('Error in /api/facets:', err);
        return jsonResponse({ error: 'Internal server error', message: err.message }, 500);
    }
}
