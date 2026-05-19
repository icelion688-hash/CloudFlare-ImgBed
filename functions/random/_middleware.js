import { checkDatabaseConfig } from '../utils/middleware';
import { createCorsHandler } from '../utils/corsHelper.js';
import { checkPublicApiAuth } from '../utils/publicApiAuth.js';

// 动态 CORS 中间件
const corsHandler = createCorsHandler({ methods: 'GET, OPTIONS' });

// 可选认证中间件：当 randomImageAPI.requireAuth 为 true 时要求有效凭证
async function optionalAuth(context) {
    const authResponse = await checkPublicApiAuth(context);
    if (authResponse) return authResponse;
    return context.next();
}

export const onRequest = [checkDatabaseConfig, corsHandler, optionalAuth];
