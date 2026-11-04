export interface PreparedBackgroundImage {
  name: string;
  blob: Blob;
  width: number;
  height: number;
  isAnimated: boolean;
}

const MAX_SOURCE_SIZE = 20 * 1024 * 1024;
const MAX_DYNAMIC_STORED_SIZE = 10 * 1024 * 1024;
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

function readByte(view: DataView, offset: number): number | null {
  return offset >= 0 && offset < view.byteLength ? view.getUint8(offset) : null;
}

function readAscii(view: DataView, offset: number, length: number): string {
  let value = '';
  for (let i = 0; i < length; i++) {
    const byte = readByte(view, offset + i);
    if (byte == null) return value;
    value += String.fromCharCode(byte);
  }
  return value;
}

function skipGifSubBlocks(view: DataView, offset: number): number {
  let cursor = offset;
  while (cursor < view.byteLength) {
    const size = view.getUint8(cursor);
    cursor += 1;
    if (size === 0) return cursor;
    cursor += size;
    if (cursor > view.byteLength) return -1;
  }
  return -1;
}

function isAnimatedGif(view: DataView): boolean {
  if (view.byteLength < 14 || !/^GIF8[79]a$/.test(readAscii(view, 0, 6))) return false;
  const packed = readByte(view, 10);
  if (packed == null) return false;

  let cursor = 13;
  if (packed & 0x80) {
    const colorTableBits = packed & 0x07;
    cursor += 3 * (2 ** (colorTableBits + 1));
  }

  let frameCount = 0;
  while (cursor >= 0 && cursor < view.byteLength) {
    const blockType = view.getUint8(cursor);
    if (blockType === 0x3b) return frameCount > 1;

    if (blockType === 0x21) {
      cursor = skipGifSubBlocks(view, cursor + 2);
      continue;
    }

    if (blockType === 0x2c) {
      frameCount += 1;
      if (frameCount > 1) return true;
      const imagePacked = readByte(view, cursor + 9);
      if (imagePacked == null) return false;
      cursor += 10;
      if (imagePacked & 0x80) {
        const colorTableBits = imagePacked & 0x07;
        cursor += 3 * (2 ** (colorTableBits + 1));
      }
      cursor += 1; // LZW minimum code size
      cursor = skipGifSubBlocks(view, cursor);
      continue;
    }

    return false;
  }

  return false;
}

function isAnimatedWebp(view: DataView): boolean {
  if (view.byteLength < 12 || readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WEBP') return false;
  let cursor = 12;
  while (cursor + 8 <= view.byteLength) {
    const chunkType = readAscii(view, cursor, 4);
    const chunkSize = view.getUint32(cursor + 4, true);
    if (chunkType === 'ANIM' || chunkType === 'ANMF') return true;
    cursor += 8 + chunkSize + (chunkSize % 2);
  }
  return false;
}

function isAnimatedPng(view: DataView): boolean {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (view.byteLength < pngSignature.length) return false;
  for (let i = 0; i < pngSignature.length; i++) {
    if (view.getUint8(i) !== pngSignature[i]) return false;
  }

  let cursor = pngSignature.length;
  while (cursor + 8 <= view.byteLength) {
    const chunkLength = view.getUint32(cursor);
    if (readAscii(view, cursor + 4, 4) === 'acTL') return true;
    cursor += 12 + chunkLength;
  }
  return false;
}

async function detectAnimatedImage(file: File): Promise<boolean> {
  if (file.type === 'image/gif') {
    return isAnimatedGif(new DataView(await file.arrayBuffer()));
  }
  if (file.type === 'image/webp') {
    return isAnimatedWebp(new DataView(await file.arrayBuffer()));
  }
  if (file.type === 'image/png' || file.type === 'image/apng') {
    return isAnimatedPng(new DataView(await file.arrayBuffer()));
  }
  return false;
}

/**
 * 静态图经 Canvas 压缩为 WebP；动态图保留原始帧数据，避免转码时丢失动画。
 */
export async function prepareBackgroundImage(file: File): Promise<PreparedBackgroundImage> {
  if (!file.type.startsWith('image/')) throw new Error('仅支持图片文件');
  if (file.size > MAX_SOURCE_SIZE) throw new Error('图片不能超过 20MB');

  const isAnimated = await detectAnimatedImage(file);
  const bitmap = await readImageBitmap(file);
  if (bitmap.width < 1 || bitmap.height < 1) throw new Error('图片尺寸无效');

  try {
    if (isAnimated) {
      if (Math.max(bitmap.width, bitmap.height) > MAX_EDGE_LENGTH) {
        throw new Error('动态图片最长边不能超过 3200px');
      }
      if (file.size > MAX_DYNAMIC_STORED_SIZE) {
        throw new Error('动态图片不能超过 10MB');
      }
      return {
        name: sanitizeFileName(file.name.replace(/\.[^.]+$/, '')),
        blob: file,
        width: bitmap.width,
        height: bitmap.height,
        isAnimated,
      };
    }

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
      isAnimated: false,
    };
  } finally {
    bitmap.close();
  }
}
