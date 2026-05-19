import { dualAuthCheck } from '../utils/auth/dualAuth.js';

/**
 * SSRF 防护：校验目标 URL 是否安全
 * 阻止访问内部网络、云元数据端点等敏感地址
 */
function isUrlSafe(urlStr) {
    try {
        const url = new URL(urlStr);

        // 仅允许 http/https 协议
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return false;
        }

        const hostname = url.hostname.toLowerCase();

        // 阻止 localhost
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') {
            return false;
        }

        // 阻止私有/保留 IPv4 地址
        const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
        if (ipv4Match) {
            const [, a, b] = ipv4Match.map(Number);
            if (a === 10) return false;                         // 10.0.0.0/8
            if (a === 172 && b >= 16 && b <= 31) return false;  // 172.16.0.0/12
            if (a === 192 && b === 168) return false;           // 192.168.0.0/16
            if (a === 169 && b === 254) return false;           // 169.254.0.0/16 (link-local)
            if (a === 127) return false;                        // 127.0.0.0/8
            if (a === 0) return false;                          // 0.0.0.0/8
        }

        // 阻止 IPv6 直连地址（正常使用应通过域名访问）
        if (hostname.startsWith('[') || hostname.includes(':')) {
            return false;
        }

        // 阻止云服务元数据端点
        if (hostname === 'metadata.google.internal' ||
            hostname === '169.254.169.254' ||
            hostname.endsWith('.internal') ||
            hostname.endsWith('.local')) {
            return false;
        }

        return true;
    } catch (e) {
        return false;
    }
}

export async function onRequest(context) {
    // 获取请求体中URL的内容
    const {
        request,
        env,
        params,
        waitUntil,
        next,
        data
    } = context;

    // 双重鉴权检查
    const url = new URL(request.url);
    const { authorized } = await dualAuthCheck(env, url, request);
    if (!authorized) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const jsonRequest = await request.json();
    const targetUrl = jsonRequest.url;
    if (targetUrl === undefined) {
        return new Response('URL is required', { status: 400 })
    }

    // SSRF 防护：校验目标 URL
    if (!isUrlSafe(targetUrl)) {
        return new Response(JSON.stringify({
            error: 'URL not allowed',
            message: 'Access to internal network addresses, private IPs, and metadata endpoints is blocked.'
        }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const response = await fetch(targetUrl);
    const headers = new Headers(response.headers);
    return new Response(response.body, {
        headers: headers
    })
}