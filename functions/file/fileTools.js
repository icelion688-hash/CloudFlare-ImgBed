/* ======== 文件读取工具函数 ======== */

// 判断请求域名是否在允许的域名列表中
// 检查优先级：Origin 头 > Referer 头
// 当无 Origin 且无 Referer 时（直接访问），允许通过
export function isDomainAllowed(context) {
    const { Referer, securityConfig, url, request } = context;

    const allowedDomains = securityConfig.access.allowedDomains;

    // 未配置域名限制，允许所有访问
    if (!allowedDomains || allowedDomains.trim() === '') {
        return true;
    }

    // 构建域名白名单（含自身域名）
    const domains = allowedDomains.split(',').map(d => d.trim()).filter(Boolean);
    domains.push(url.hostname);

    // 辅助函数：检查 hostname 是否匹配域名列表
    const matchesDomain = (hostname) => {
        return domains.some(domain => {
            const pattern = new RegExp(`(^|\\.)${domain.replace(/\./g, '\\.')}$`);
            return pattern.test(hostname);
        });
    };

    // 优先检查 Origin 头（跨域请求必带，比 Referer 更可靠且不可被页面策略禁止）
    const origin = request?.headers?.get('Origin');
    if (origin) {
        try {
            return matchesDomain(new URL(origin).hostname);
        } catch (e) {
            return false;
        }
    }

    // 检查 Referer 头
    if (Referer) {
        try {
            return matchesDomain(new URL(Referer).hostname);
        } catch (e) {
            return false;
        }
    }

    // 无 Origin 且无 Referer → 直接访问（浏览器地址栏、curl、RSS 阅读器等）
    // 这是合法的文件访问场景，允许通过
    return true;
}

// 判断请求是否来自公开图库页面 (/browse 或 /browse/*)
export function isFromPublicBrowse(Referer, origin) {
    if (!Referer) return false;
    try {
        const refererUrl = new URL(Referer);
        // 检查是否来自同源的 /browse 或 /browse/* 路径
        if (refererUrl.origin === origin) {
            const pathname = refererUrl.pathname;
            if (pathname === '/browse' || pathname.startsWith('/browse/')) {
                return true;
            }
        }
    } catch (e) {
        return false;
    }
    return false;
}

export const FILE_CACHE_CONTROL = {
    PUBLIC: 'public, max-age=2592000',
    PRIVATE: 'private, max-age=86400',
    NO_STORE: 'private, no-store, max-age=0',
};

// 公共响应头设置函数
export function setCommonHeaders(headers, encodedFileName, fileType, cacheControl = FILE_CACHE_CONTROL.PUBLIC) {
    headers.set('Content-Disposition', `inline; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`);
    // CORS 头由 _middleware.js 中的 corsHandler 统一设置（支持 allowedDomains 白名单），
    // 此处不再硬编码 Access-Control-Allow-Origin，避免覆盖中间件的动态策略。
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Vary', 'Range, Accept');

    if (fileType) {
        headers.set('Content-Type', fileType);
    }

    headers.set('Cache-Control', cacheControl || FILE_CACHE_CONTROL.PUBLIC);
}

// 设置Range请求相关头部
export function setRangeHeaders(headers, rangeStart, rangeEnd, totalSize) {
    const contentLength = rangeEnd - rangeStart + 1;
    headers.set('Content-Length', contentLength.toString());
    headers.set('Content-Range', `bytes ${rangeStart}-${rangeEnd}/${totalSize}`);
}

// 处理HEAD请求的公共函数
export function handleHeadRequest(headers, etag = null) {
    const responseHeaders = new Headers();

    // 复制关键头部
    responseHeaders.set('Content-Length', headers.get('Content-Length') || '0');
    responseHeaders.set('Content-Type', headers.get('Content-Type') || 'application/octet-stream');
    responseHeaders.set('Content-Disposition', headers.get('Content-Disposition') || 'inline');
    // CORS 头由中间件设置，此处仅转发已有值
    const acao = headers.get('Access-Control-Allow-Origin');
    if (acao) {
        responseHeaders.set('Access-Control-Allow-Origin', acao);
    }
    responseHeaders.set('Accept-Ranges', headers.get('Accept-Ranges') || 'bytes');
    responseHeaders.set('Cache-Control', headers.get('Cache-Control') || 'public, max-age=2592000');

    if (etag) {
        responseHeaders.set('ETag', etag);
    }

    return new Response(null, {
        status: 200,
        headers: responseHeaders,
    });
}

export async function getFileContent(request, targetUrl, max_retries = 2) {
    let retries = 0;
    while (retries <= max_retries) {
        try {
            const response = await fetch(targetUrl, {
                method: request.method,
                headers: request.headers,
                body: request.body,
            });
            if (response.ok || response.status === 304) {
                return response;
            } else if (response.status === 404) {
                return new Response('Error: Image Not Found', { status: 404 });
            } else {
                retries++;
            }
        } catch (error) {
            retries++;
        }
    }
    return null;
}

export function isTgChannel(imgRecord) {
    return imgRecord.metadata?.Channel === 'Telegram' || imgRecord.metadata?.Channel === 'TelegramNew';
}

// 图片可访问性检查
export async function returnWithCheck(context, imgRecord) {
    const { url, securityConfig } = context;
    const whiteListMode = securityConfig.access.whiteListMode;
    const isAdminPreview = context.fileAccess?.isAdminPreview === true;
    const adminAuthorized = context.fileAccess?.adminAuthResult?.authorized === true;
    const response = new Response('success', { status: 200 });

    if (isAdminPreview && !adminAuthorized) {
        return unauthorizedAdminPreviewResponse();
    }

    const record = imgRecord;
    if (record.metadata === null) {
        context.fileAccess.cacheControl = isAdminPreview ? FILE_CACHE_CONTROL.PRIVATE : FILE_CACHE_CONTROL.PUBLIC;
        return response;
    }

    if (isAdminPreview) {
        context.fileAccess.cacheControl = FILE_CACHE_CONTROL.PRIVATE;
        return response;
    }

    context.fileAccess.cacheControl = FILE_CACHE_CONTROL.PUBLIC;

    if (record.metadata.ListType == "White") {
        return response;
    } else if (record.metadata.ListType == "Block") {
        return await returnBlockImg(url);
    } else if (record.metadata.Label == "adult") {
        return await returnBlockImg(url);
    }

    if (whiteListMode) {
        return await returnWhiteListImg(url);
    }

    return response;
}

function unauthorizedAdminPreviewResponse() {
    return new Response('Admin authentication required', {
        status: 401,
        statusText: 'Unauthorized',
        headers: {
            'Content-Type': 'text/plain;charset=UTF-8',
            'Cache-Control': FILE_CACHE_CONTROL.NO_STORE,
        },
    });
}

export async function return404(url) {
    const Img404 = await fetch(url.origin + "/static/media/404.png");
    if (!Img404.ok) {
        return new Response('Error: Image Not Found',
            {
                status: 404,
                headers: {
                    "Cache-Control": "public, max-age=86400"
                }
            }
        );
    } else {
        return new Response(Img404.body, {
            status: 404,
            headers: {
                "Content-Type": "image/png",
                "Content-Disposition": "inline",
                "Cache-Control": "public, max-age=86400",
            },
        });
    }
}

export async function returnBlockImg(url) {
    const blockImg = await fetch(url.origin + "/static/media/BlockImg.png");
    if (!blockImg.ok) {
        return new Response(null, {
            status: 302,
            headers: {
                "Location": url.origin + "/blockimg",
                "Cache-Control": "public, max-age=86400"
            }
        })
    } else {
        return new Response(blockImg.body, {
            status: 403,
            headers: {
                "Content-Type": "image/png",
                "Content-Disposition": "inline",
                "Cache-Control": "public, max-age=86400",
            },
        });
    }
}

export async function returnWhiteListImg(url) {
    const WhiteListImg = await fetch(url.origin + "/static/media/WhiteListOn.png");
    if (!WhiteListImg.ok) {
        return new Response(null, {
            status: 302,
            headers: {
                "Location": url.origin + "/whiteliston",
                "Cache-Control": "public, max-age=86400"
            }
        })
    } else {
        return new Response(WhiteListImg.body, {
            status: 403,
            headers: {
                "Content-Type": "image/png",
                "Content-Disposition": "inline",
                "Cache-Control": "public, max-age=86400",
            },
        });
    }
}
