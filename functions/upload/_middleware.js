import { errorHandling, telemetryData, checkDatabaseConfig } from '../utils/middleware';
import { createCorsHandler } from '../utils/corsHelper.js';

// 动态 CORS 中间件（根据 allowedDomains 配置自动决定 Origin 策略）
const corsHandler = createCorsHandler({
    methods: 'GET, POST, OPTIONS',
    headers: 'Content-Type, Authorization, authCode',
});

export const onRequest = [checkDatabaseConfig, corsHandler, errorHandling, telemetryData];
