export interface PreparedBackgroundImage {
  name: string;
  blob: Blob;
  width: number;
  height: number;
}

const MAX_SOURCE_SIZE = 20 * 1024 * 1024;
const MAX_EDGE_LENGTH = 3200;
const MAX_STORED_SIZE = 4 * 1024 * 1024;
const COMPRESS_QUALITIES = [0.88, 0.82, 0.76, 0.7];

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '').trim() || '自定义背景';
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

async function readImageBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('当前浏览器不支持本地图片处理');
  }
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error('无法识别该图片文件');
  }
}

/** 控制存储体积与解码尺寸，并把不同格式统一为 WebP，避免大图拖慢新标签页。 */
export async function prepareBackgroundImage(file: File): Promise<PreparedBackgroundImage> {
  if (!file.type.startsWith('image/')) throw new Error('仅支持图片文件');
  if (file.size > MAX_SOURCE_SIZE) throw new Error('图片不能超过 20MB');

  const bitmap = await readImageBitmap(file);
  if (bitmap.width < 1 || bitmap.height < 1) throw new Error('图片尺寸无效');
  try {
    const scale = Math.min(1, MAX_EDGE_LENGTH / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('无法处理该图片');
    context.drawImage(bitmap, 0, 0, width, height);

    let result: Blob | null = null;
    for (const quality of COMPRESS_QUALITIES) {
      result = await canvasToBlob(canvas, 'image/webp', quality);
      if (result && result.size <= MAX_STORED_SIZE) break;
    }
    if (!result || result.size === 0) throw new Error('图片保存失败，请换一张图片');
    if (result.size > MAX_STORED_SIZE) throw new Error('图片处理后仍超过 4MB，请换一张图片');

    return {
      name: sanitizeFileName(file.name.replace(/\.[^.]+$/, '')),
      blob: result,
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}
