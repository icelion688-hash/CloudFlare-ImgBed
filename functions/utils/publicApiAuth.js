/**
 * 公开 API 可选认证
 *
 * 当 othersConfig.randomImageAPI.requireAuth 为 true 时，
 * 要求 /random/, /api/query, /api/facets 等公开接口提供有效凭证。
 * 支持 API Token（需 read 权限）、admin session、user session。
 */
import { fetchOthersConfig } from './sysConfig.js';
import { authenticate, AUTH_SCOPE } from './auth/authCore.js';

/**
 * 检查公开 API 是否需要认证
 * @param {Object} context - Pages Functions context
 * @param {Object} [corsHeaders={}] - 附加到 401 响应的 CORS 头
 * @returns {Response|null} 需要拦截时返回 401 Response，否则返回 null（放行）
 */
export async function checkPublicApiAuth(context, corsHeaders = {}) {
    const { env, request } = context;
    const othersConfig = await fetchOthersConfig(env);

    if (!othersConfig.randomImageAPI?.requireAuth) {
        return null; // 未启用认证要求，放行
    }

    const url = new URL(request.url);
    const result = await authenticate({
        env,
        request,
        url,
        requiredPermission: 'read',
        authScope: AUTH_SCOPE.EITHER,
    });

    if (!result.authorized) {
        return new Response(JSON.stringify({
            error: 'Authentication required',
            message: 'This API requires a valid API Token with "read" permission, or an active session.',
        }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    }

    return null; // 认证通过，放行
}
