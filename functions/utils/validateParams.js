/**
 * 图片参数白名单校验
 *
 * 将任意宽度/模糊值/格式约束到离散档位，
 * 最大化 CDN 缓存命中率，防止参数变形绕过缓存。
 */

// 允许的宽度档位（40 用于 LQIP）
const ALLOWED_WIDTHS = [40, 400, 640, 768, 1024, 1280, 1920, 2560, 3840];

// 允许的格式
const ALLOWED_FORMATS = ['webp', 'avif', 'jpg', 'jpeg', 'png', 'auto'];

/**
 * 将请求宽度向上取到最近的离散档位
 * @param {string|number} raw - 原始宽度值
 * @returns {number|null} 离散档位宽度，无效时返回 null
 */
export function snapWidth(raw) {
    const n = parseInt(raw, 10);
    if (!n || n < 1 || n > 4096) return null;
    // 向上取最近档位
    return ALLOWED_WIDTHS.find(w => w >= n) || ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
}

/**
 * 将模糊值约束为 5 的倍数，减少缓存碎片
 * @param {string|number} raw - 原始模糊值
 * @returns {number} 标准化后的模糊值，无效时返回 0
 */
export function snapBlur(raw) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 0) return 0;
    if (n > 250) return 250; // cf.image blur 上限 250
    // 约束为 5 的倍数
    return Math.round(n / 5) * 5;
}

/**
 * 校验格式参数
 * @param {string} raw - 原始格式值
 * @returns {string} 有效格式，无效时返回 'auto'
 */
export function snapFormat(raw) {
    if (!raw) return 'auto';
    const lower = raw.toLowerCase();
    return ALLOWED_FORMATS.includes(lower) ? lower : 'auto';
}

/**
 * 校验质量参数
 * @param {string|number} raw - 原始质量值
 * @returns {number} 有效质量值 (1-100)，无效时返回默认值 80
 */
export function snapQuality(raw) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1) return 80;
    if (n > 100) return 100;
    return n;
}

/**
 * 校验高度参数
 * @param {string|number} raw - 原始高度值
 * @returns {number|null} 有效高度值，无效时返回 null
 */
export function snapHeight(raw) {
    const n = parseInt(raw, 10);
    if (!n || n < 1 || n > 4096) return null;
    return n;
}
