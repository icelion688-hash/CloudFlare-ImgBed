/**
 * CORS 跨域响应头工具
 *
 * 根据安全配置中的 allowedDomains 动态生成 Access-Control-Allow-Origin：
 * - allowedDomains 为空 → 返回 *（向后兼容）
 * - allowedDomains 已配置 → 仅允许列表中的域名 + 自身域名
 */
import { fetchSecurityConfig } from './sysConfig.js';

/**
 * 解析请求来源是否在允许列表中
 * @param {Request} request - 请求对象
 * @param {string} allowedDomains - 逗号分隔的域名列表
 * @param {string} selfHostname - 自身域名（始终允许）
 * @returns {string|null} 允许的 Origin（'*' 或具体 origin），不允许时返回 null
 */
export function resolveAllowedOrigin(request, allowedDomains, selfHostname) {
    // 未配置域名限制 → 允许所有（向后兼容）
    if (!allowedDomains || allowedDomains.trim() === '') {
        return '*';
    }

    const requestOrigin = request.headers.get('Origin');

    // 无 Origin 头（非跨域请求：浏览器直接访问、curl 等）→ 不需要 CORS 头
    if (!requestOrigin) {
        return null;
    }

    // 构建域名白名单（含自身域名）
    const domains = allowedDomains.split(',').map(d => d.trim()).filter(Boolean);
    domains.push(selfHostname);

    try {
        const originHostname = new URL(requestOrigin).hostname;
        const isAllowed = domains.some(domain => {
            const pattern = new RegExp(`(^|\\.)${domain.replace(/\./g, '\\.')}$`);
            return pattern.test(originHostname);
        });
        return isAllowed ? requestOrigin : null;
    } catch (e) {
        return null;
    }
}

/**
 * 构建 CORS 响应头对象
 * @param {Request} request
 * @param {string} allowedDomains - 逗号分隔的域名列表
 * @param {string} selfHostname - 自身域名
 * @param {Object} [options]
 * @param {string} [options.methods] - 允许的 HTTP 方法
 * @param {string} [options.headers] - 允许的请求头
 * @returns {Object} CORS 响应头对象
 */
export function buildCorsHeaders(request, allowedDomains, selfHostname, options = {}) {
    const headers = {
        'Access-Control-Allow-Methods': options.methods || 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': options.headers || 'Content-Type, Authorization, authCode',
        'Access-Control-Max-Age': '86400',
    };

    const origin = resolveAllowedOrigin(request, allowedDomains, selfHostname);
    if (origin) {
        headers['Access-Control-Allow-Origin'] = origin;
        // 动态 Origin 时添加 Vary 以确保 CDN 缓存正确
        if (origin !== '*') {
            headers['Vary'] = 'Origin';
        }
    }

    return headers;
}

/**
 * 将 CORS 头添加到已有响应
 * @param {Response} response - 原始响应
 * @param {Object} corsHeaders - buildCorsHeaders() 返回的头对象
 * @returns {Response} 新响应
 */
export function withCors(response, corsHeaders) {
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
        newHeaders.set(key, value);
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

/**
 * 创建 CORS 中间件（Pages Functions 中间件链使用）
 *
 * 功能：
 * 1. 拦截 OPTIONS 预检请求，返回动态 CORS 头
 * 2. 为正常请求的响应自动添加 CORS 头
 * 3. 读取 securityConfig.access.allowedDomains 决定 Origin 策略
 *
 * @param {Object} [options]
 * @param {string} [options.methods] - 允许的 HTTP 方法
 * @param {string} [options.headers] - 允许的请求头
 */
export function createCorsHandler(options = {}) {
    return async function corsHandler(context) {
        const { request, env } = context;
        const url = new URL(request.url);

        // 读取安全配置（优先复用已缓存的，避免重复读取数据库）
        if (!context.data.securityConfig) {
            try {
                context.data.securityConfig = await fetchSecurityConfig(env);
            } catch (e) {
                // 配置读取失败时使用宽松模式，确保服务不中断
                context.data.securityConfig = { access: { allowedDomains: '' } };
            }
        }

        const allowedDomains = context.data.securityConfig.access.allowedDomains;
        const corsHeaders = buildCorsHeaders(request, allowedDomains, url.hostname, options);

        // OPTIONS 预检请求
        if (request.method === 'OPTIONS') {
            return corsHeaders['Access-Control-Allow-Origin']
                ? new Response(null, { status: 204, headers: corsHeaders })
                : new Response(null, { status: 403 });
        }

        // 正常请求：处理后添加 CORS 头到响应
        try {
            const response = await context.next();
            return withCors(response, corsHeaders);
        } catch (err) {
            // 确保异常情况下也返回 CORS 头（便于前端读取错误信息）
            return new Response(`Server Error: ${err.message}`, {
                status: 500,
                headers: corsHeaders,
            });
        }
    };
}
