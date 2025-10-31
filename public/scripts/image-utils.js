function uuid() {
  return crypto.randomUUID();
}

/**
 * filesToThumbs(files, { onProgress })
 * onProgress({ current, total, fileName, filePercent, totalPercent })
 */
export async function filesToThumbs(files, opts = {}) {
  const { onProgress } = opts;
  const out = [];
  const unsupported = [];
  const total = files.length;
  const BATCH = 20;

  let doneFiles = 0;

  for (let i = 0; i < files.length; i += BATCH) {
    const slice = files.slice(i, i + BATCH);
    const chunk = await Promise.all(
      slice.map(async (f, idx) => {
        const index = i + idx + 1;

        // 1) checa suporte
        const can = await canDecode(f).catch(() => false);
        if (!can) {
          unsupported.push({ name: f.name, type: f.type || "desconhecido" });
          const totalPercent = Math.round((doneFiles / total) * 100);
          onProgress?.({ current: index, total, totalPercent });
          return null;
        }

        try {
          const res = await fileToThumb(f, (p) => {
            const totalPercent = Math.round(
              ((doneFiles + p / 100) / total) * 100
            );
            onProgress?.({
              current: index,
              total,
              fileName: f.name,
              filePercent: Math.round(p),
              totalPercent,
            });
          });
          doneFiles++;
          onProgress?.({
            current: index,
            total,
            fileName: f.name,
            filePercent: 100,
            totalPercent: Math.round((doneFiles / total) * 100),
          });
          return res;
        } catch {
          unsupported.push({ name: f.name, type: f.type || "desconhecido" });
          return null;
        }
      })
    );
    out.push(...chunk.filter(Boolean));
    await new Promise((r) => requestAnimationFrame(r));
  }
  if (unsupported.length) out._unsupported = unsupported;
  return out;
}

async function canDecode(file) {
  const url = URL.createObjectURL(file);
  try {
    await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(true);
      img.onerror = () => rej(new Error("UNSUPPORTED"));
      img.src = url;
    });
    return true;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fileToThumb(file, progressCb) {
  // ler como DataURL com progresso (aprox. 0–70%)
  const dataUrl = await fileToDataURL(file, (p) =>
    progressCb?.(Math.min(70, p * 0.7))
  );
  // carregar imagem (≈85%)
  await loadImage(dataUrl).then(() => progressCb?.(85));
  // gerar thumb (≈95%)
  const { thumb, w, h } = await makeThumb(dataUrl, 640);
  progressCb?.(95);
  // encode webp (rápido, vamos a 100%)
  progressCb?.(100);
  return { 
    id: uuid(), 
    thumb, 
    w, 
    h, 
    rating: 0,  // Sprint 3: Todas as fotos começam sem avaliação
    uploadedAt: Date.now(),
    parentId: null 
  };
}

function fileToDataURL(file, onprogress) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = (e.loaded / e.total) * 100;
      onprogress?.(pct);
    };
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

async function makeThumb(dataUrl, targetW = 640) {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, targetW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  if ("createImageBitmap" in window) {
    const blob = await (await fetch(dataUrl)).blob();
    const bmp = await createImageBitmap(blob);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
  } else {
    const imgel = await loadImage(dataUrl);
    ctx.drawImage(imgel, 0, 0, w, h);
  }
  const thumb = canvas.toDataURL("image/webp", 0.9);
  return { thumb, w: img.width, h: img.height };
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
