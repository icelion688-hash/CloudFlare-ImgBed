/**
 * 公共响应工具
 *
 * 集中提供 JSON 响应构造、图片代理获取等公共逻辑，
 * 消除各 endpoint 的重复代码。
 */

/**
 * 构造 JSON 响应
 * @param {Object} body - 响应体
 * @param {number} [status=200] - HTTP 状态码
 * @param {Object} [extraHeaders={}] - 附加响应头
 * @returns {Response}
 */
export function jsonResponse(body, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
    });
}

/**
 * 代理获取图片并返回（用于 type=img 模式）
 *
 * 带重试机制，避免 Workers 冷启动导致的间歇性失败。
 *
 * @param {string} imageUrl - 完整的图片 URL
 * @param {Object} [extraHeaders={}] - 附加到响应的头
 * @param {number} [maxRetries=2] - 最大重试次数
 * @returns {Response}
 */
export async function fetchImageWithRetry(imageUrl, extraHeaders = {}, maxRetries = 2) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const r = await fetch(imageUrl);
            if (r.ok) {
                return new Response(r.body, {
                    status: r.status,
                    headers: {
                        'Content-Type': r.headers.get('content-type') || 'image/jpeg',
                        ...extraHeaders,
                    },
                });
            }
            // 4xx 错误不重试
            if (r.status >= 400 && r.status < 500) {
                return jsonResponse(
                    { error: 'Image not found', status: r.status },
                    r.status,
                    extraHeaders
                );
            }
            lastError = new Error(`HTTP ${r.status}`);
        } catch (e) {
            lastError = e;
        }
        // 重试前短暂等待
        if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        }
    }
    return jsonResponse(
        { error: 'Failed to fetch image', detail: lastError?.message },
        502,
        extraHeaders
    );
}

/**
 * 根据请求参数决定响应类型（img / url / json / text）
 * @param {Request} request
 * @param {URLSearchParams} sp
 * @returns {{ respType: string|null, respForm: string|null }}
 */
export function parseResponseMode(request, sp) {
    const explicitType = sp.get('type');
    const acceptsImage = (request.headers.get('Accept') || '').includes('image/');
    const respType = explicitType || (acceptsImage ? 'img' : null);
    const respForm = sp.get('form');
    return { respType, respForm };
}

/**
 * 构建过滤条件指纹（用于 seed 生成）
 * @param {Object} params - parseFilterParams() 的结果
 * @param {string} resolvedOrientation - 已解析的方向
 * @returns {string}
 */
export function buildFilterFingerprint(params, resolvedOrientation) {
    return [
        params.dir,
        params.includeTags.slice().sort().join(','),
        params.excludeTags.slice().sort().join(','),
        params.anyTagGroups.map(g => g.slice().sort().join('|')).join(';'),
        resolvedOrientation,
        params.minWidth, params.minHeight, params.maxWidth, params.maxHeight,
        params.fileType.slice().sort().join(','),
    ].join('::');
}
