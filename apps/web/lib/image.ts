'use client';

/** 把用户选的图片缩到长边不超过 maxSide，转成 JPEG data URL。户型图不需要相机原尺寸，存原图会把本机资料库撑大。 */
export async function downscaleImage(
  file: Blob,
  maxSide = 1600,
  quality = 0.85,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('读不到这张图片。'));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器不支持图片处理。');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
