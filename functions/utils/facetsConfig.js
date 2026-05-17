/**
 * 分面配置（Facets Configuration）
 *
 * 提供 color / category / mood 等"语义维度"到底层 tag 的映射，
 * 让 API 调用方可以使用更友好的参数（如 ?color=blue&category=anime）
 * 而不必感知底层中文 tag 的精确写法。
 *
 * 配置存储于 KV: img_url，key = "@@facetsConfig"，结构如下：
 * {
 *   "facets": {
 *     "color": {
 *       "label": "主体颜色",
 *       "values": [
 *         { "value": "偏蓝", "label": "蓝色", "aliases": ["blue"] },
 *         ...
 *       ]
 *     },
 *     ...
 *   }
 * }
 *
 * 若 KV 中不存在配置，则使用 DEFAULT_FACETS 作为种子。
 */

const FACETS_KV_KEY = '@@facetsConfig';

/**
 * 默认分面配置 —— 基于实际使用数据预置，开箱即用
 */
export const DEFAULT_FACETS = {
    facets: {
        color: {
            label: '主体颜色',
            description: '图片的整体色调倾向',
            values: [
                { value: '偏蓝',     label: '蓝色调',   aliases: ['blue', 'lan'] },
                { value: '偏红',     label: '红色调',   aliases: ['red', 'hong'] },
                { value: '偏绿',     label: '绿色调',   aliases: ['green', 'lv'] },
                { value: '偏黄',     label: '黄色调',   aliases: ['yellow', 'huang'] },
                { value: '紫_粉',    label: '紫粉色调', aliases: ['purple', 'pink', 'magenta'] },
                { value: '灰_白',    label: '灰白色调', aliases: ['gray', 'grey', 'white'] },
                { value: '暗色',     label: '暗色调',   aliases: ['dark', 'black'] },
                { value: '其他颜色', label: '其他',     aliases: ['other'] }
            ]
        },
        category: {
            label: '主题分类',
            description: '图片的主题内容',
            values: [
                { value: '动漫_二次元', label: '动漫/二次元', aliases: ['anime', 'acg'] },
                { value: '自然_风景',   label: '自然/风景',   aliases: ['nature', 'landscape-theme'] },
                { value: '魅力_迷人',   label: '人物/魅力',   aliases: ['portrait-theme', 'glamour', 'character'] },
                { value: '自制_艺术',   label: '艺术/创作',   aliases: ['art', 'illustration'] },
                { value: '游戏_玩具',   label: '游戏/玩具',   aliases: ['game', 'toy'] },
                { value: '科幻_星云',   label: '科幻/宇宙',   aliases: ['scifi', 'space', 'cosmos'] }
            ]
        },
        mood: {
            label: '氛围风格',
            description: '图片传达的氛围或风格',
            values: [
                { value: '极简主义',   label: '极简',     aliases: ['minimal', 'minimalism'] },
                { value: '古风',       label: '古风',     aliases: ['ancient', 'classical'] },
                { value: '清新',       label: '清新',     aliases: ['fresh'] },
                { value: '安逸_自由',  label: '安逸/自由', aliases: ['peaceful', 'free'] },
                { value: '夜景',       label: '夜景',     aliases: ['night'] },
                { value: '数字艺术',   label: '数字艺术', aliases: ['digital-art'] }
            ]
        }
    }
};

/**
 * 读取分面配置（KV 未配置时返回默认）
 * @param {Object} env - Cloudflare env，需要 env.img_url
 * @returns {Promise<Object>}
 */
export async function getFacetsConfig(env) {
    try {
        if (!env || !env.img_url) {
            return DEFAULT_FACETS;
        }
        const raw = await env.img_url.get(FACETS_KV_KEY);
        if (!raw) {
            return DEFAULT_FACETS;
        }
        const parsed = JSON.parse(raw);
        // 简单校验
        if (parsed && typeof parsed === 'object' && parsed.facets && typeof parsed.facets === 'object') {
            return parsed;
        }
        return DEFAULT_FACETS;
    } catch (err) {
        console.error('Failed to read facets config:', err);
        return DEFAULT_FACETS;
    }
}

/**
 * 写入分面配置
 * @param {Object} env
 * @param {Object} config
 */
export async function saveFacetsConfig(env, config) {
    if (!env || !env.img_url) {
        throw new Error('KV (img_url) not available');
    }
    if (!config || typeof config !== 'object' || !config.facets) {
        throw new Error('Invalid facets config');
    }
    await env.img_url.put(FACETS_KV_KEY, JSON.stringify(config));
}

/**
 * 将一个 facet 值解析为底层 tag 列表
 *
 * 支持：
 *   - 直接传中文 tag 值（如 "偏蓝"）
 *   - 传别名（如 "blue"）
 *   - 传 label（如 "蓝色调"）
 *   - 多值用逗号分隔（如 "blue,red"），返回多个 tag —— 调用方按 OR 处理
 *
 * @param {Object} config - 完整 facets 配置
 * @param {string} facetKey - 例如 "color"
 * @param {string} input - 用户传入的原始值
 * @returns {string[]} 解析后的底层 tag 数组（去重）
 */
export function resolveFacetValue(config, facetKey, input) {
    if (!input || typeof input !== 'string') return [];
    const facet = config?.facets?.[facetKey];
    if (!facet || !Array.isArray(facet.values)) return [];

    const parts = input.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const resolved = new Set();

    for (const p of parts) {
        for (const item of facet.values) {
            const valLower = (item.value || '').toLowerCase();
            const labelLower = (item.label || '').toLowerCase();
            const aliases = (item.aliases || []).map(a => String(a).toLowerCase());
            if (valLower === p || labelLower === p || aliases.includes(p)) {
                resolved.add(item.value);
                break;
            }
        }
    }
    return [...resolved];
}

/**
 * 列出某个 facet 的所有可选值（供前端构造下拉/标签选择器）
 * @param {Object} config
 * @param {string} facetKey
 */
export function listFacetValues(config, facetKey) {
    const facet = config?.facets?.[facetKey];
    if (!facet) return [];
    return (facet.values || []).map(v => ({
        value: v.value,
        label: v.label || v.value,
        aliases: v.aliases || []
    }));
}
