import { checkDatabaseConfig } from '../utils/middleware';
import { createCorsHandler } from '../utils/corsHelper.js';

// 动态 CORS 中间件（公共 API 接口）
const corsHandler = createCorsHandler({ methods: 'GET, POST, OPTIONS' });

export const onRequest = [checkDatabaseConfig, corsHandler];