import { checkDatabaseConfig } from '../utils/middleware';
import { createCorsHandler } from '../utils/corsHelper.js';

// 动态 CORS 中间件（文件访问接口）
const corsHandler = createCorsHandler({ methods: 'GET, HEAD, OPTIONS' });

export const onRequest = [checkDatabaseConfig, corsHandler];
