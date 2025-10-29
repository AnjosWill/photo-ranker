/**
 * quad-worker.js - VERSÃO SIMPLIFICADA
 * Web Worker para análise assíncrona de imagens 2×2
 * 
 * ⭐ INSIGHT PRINCIPAL: Composições 2×2 têm quadrantes SIMILARES (4 selfies da mesma pessoa)
 * ❌ Fotos únicas têm quadrantes DIFERENTES (cabeça ≠ ombro ≠ fundo)
 * 
 * Detecção baseada APENAS em:
 * 1. Aspect ratio razoável (não muito alongado)
 * 2. Similaridade MODERADA entre quadrantes (0.50-0.82)
 */

self.onmessage = async function (e) {
  const { imageData, id, width, height } = e.data;

  try {
    // 1. Verificar aspect ratio
    const aspectRatio = width / height;
    
    // Aceitar imagens quadradas ou próximas (0.70-1.40)
    const isReasonableRatio = aspectRatio >= 0.70 && aspectRatio <= 1.40;

    if (!isReasonableRatio) {
      self.postMessage({
        id,
        isQuad: false,
        confidence: 0,
        reason: 'aspect-ratio-extremo',
        analysis: { aspectRatio: aspectRatio.toFixed(2) }
      });
      return;
    }

    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);

    // 2. ⭐ ANÁLISE PRINCIPAL: Similaridade entre quadrantes
    const quadrantData = analyzeQuadrantSimilarity(imageData, width, height, centerX, centerY);
    
    const { 
      avgSimilarity, 
      minSimilarity, 
      maxSimilarity,
      pairSimilarities,
      quadrantStats 
    } = quadrantData;

    // 3. ⭐ DECISÃO CORRETA (baseada em dados reais):
    // - Foto 2×2 (4 selfies similares): Similaridade MUITO ALTA (90-100%)
    // - Foto única (partes diferentes): Similaridade MÉDIA-ALTA (70-90%)
    // - Composição aleatória: Similaridade BAIXA (<70%)
    
    const isVeryHighSimilarity = avgSimilarity >= 0.90; // 90%+
    const isConsistent = minSimilarity >= 0.85; // Todos os pares > 85%
    
    const confidence = avgSimilarity * 100;
    const isQuad = isVeryHighSimilarity && isConsistent;

    // 4. Sugerir regiões de corte
    const suggestedRegions = [
      { x: 0, y: 0, w: centerX, h: centerY, quadrant: 'top-left' },
      { x: centerX, y: 0, w: width - centerX, h: centerY, quadrant: 'top-right' },
      { x: 0, y: centerY, w: centerX, h: height - centerY, quadrant: 'bottom-left' },
      { x: centerX, y: centerY, w: width - centerX, h: height - centerY, quadrant: 'bottom-right' }
    ];

    self.postMessage({
      id,
      isQuad,
      confidence: Math.round(confidence),
      suggestedRegions,
      analysis: {
        aspectRatio: aspectRatio.toFixed(2),
        avgSimilarity: avgSimilarity.toFixed(3),
        minSimilarity: minSimilarity.toFixed(3),
        maxSimilarity: maxSimilarity.toFixed(3),
        isVeryHighSimilarity,
        isConsistent
      }
    });

  } catch (error) {
    self.postMessage({
      id,
      isQuad: false,
      error: error.message
    });
  }
};

/**
 * ⭐ FUNÇÃO PRINCIPAL: Analisa SIMILARIDADE entre os 4 quadrantes
 * 
 * INSIGHT CORRETO (baseado em dados reais):
 * - Foto 2×2 (4 selfies): Similaridade MUITO ALTA (95-100%)
 *   → Mesma pessoa, mesma iluminação, pequenas variações
 *   → RGB quase idênticos: (111,96,87) vs (110,97,87)
 * 
 * - Foto única: Similaridade MÉDIA-ALTA (70-95%)
 *   → Partes diferentes mas da mesma imagem contínua
 *   → RGB varia: (120,112,102) vs (155,148,134) vs (112,97,88)
 * 
 * - Composição aleatória: Similaridade BAIXA (<70%)
 *   → Partes completamente diferentes
 */
function analyzeQuadrantSimilarity(imageData, width, height, centerX, centerY) {
  // Definir os 4 quadrantes
  const quadrants = [
    { name: 'TL', x: 0, y: 0, w: centerX, h: centerY },
    { name: 'TR', x: centerX, y: 0, w: width - centerX, h: centerY },
    { name: 'BL', x: 0, y: centerY, w: centerX, h: height - centerY },
    { name: 'BR', x: centerX, y: centerY, w: width - centerX, h: height - centerY }
  ];

  // Calcular estatísticas de cada quadrante
  const quadrantStats = quadrants.map(q => analyzeQuadrantStats(imageData, q, width));

  // Calcular similaridades entre todos os pares de quadrantes
  const pairNames = ['TL-TR', 'TL-BL', 'TL-BR', 'TR-BL', 'TR-BR', 'BL-BR'];
  const pairSimilarities = [];
  let pairIndex = 0;
  
  for (let i = 0; i < quadrantStats.length; i++) {
    for (let j = i + 1; j < quadrantStats.length; j++) {
      const similarity = calculateStatsSimilarity(quadrantStats[i], quadrantStats[j]);
      pairSimilarities.push({
        pair: pairNames[pairIndex],
        similarity: similarity
      });
      pairIndex++;
    }
  }

  // Calcular métricas agregadas
  const similarities = pairSimilarities.map(p => p.similarity);
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const minSimilarity = Math.min(...similarities);
  const maxSimilarity = Math.max(...similarities);

  return {
    avgSimilarity,
    minSimilarity,
    maxSimilarity,
    pairSimilarities,
    quadrantStats
  };
}

/**
 * Calcula estatísticas de cor e luminosidade de um quadrante
 */
function analyzeQuadrantStats(imageData, quadrant, width) {
  const { x, y, w, h } = quadrant;
  const samples = [];
  
  // Amostragem: ~50-60 pontos por quadrante
  const step = Math.max(3, Math.floor(Math.min(w, h) / 25));

  for (let py = y; py < y + h; py += step) {
    for (let px = x; px < x + w; px += step) {
      const idx = (py * width + px) * 4;
      if (idx >= 0 && idx < imageData.length - 3) {
        const r = imageData[idx];
        const g = imageData[idx + 1];
        const b = imageData[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        samples.push({ r, g, b, lum });
      }
    }
  }

  if (samples.length === 0) {
    return { avgR: 0, avgG: 0, avgB: 0, avgLum: 0, stdDev: 0 };
  }

  // Calcular médias de cor
  const avgR = samples.reduce((sum, s) => sum + s.r, 0) / samples.length;
  const avgG = samples.reduce((sum, s) => sum + s.g, 0) / samples.length;
  const avgB = samples.reduce((sum, s) => sum + s.b, 0) / samples.length;
  const avgLum = samples.reduce((sum, s) => sum + s.lum, 0) / samples.length;

  // Calcular desvio padrão (textura/variação interna)
  const variance = samples.reduce((sum, s) => sum + Math.pow(s.lum - avgLum, 2), 0) / samples.length;
  const stdDev = Math.sqrt(variance);

  return { avgR, avgG, avgB, avgLum, stdDev };
}

/**
 * Calcula similaridade entre dois quadrantes (0-1)
 * 0 = totalmente diferentes, 1 = idênticos
 */
function calculateStatsSimilarity(stats1, stats2) {
  // 1. Diferença de cor (distância euclidiana normalizada no espaço RGB)
  const colorDiff = Math.sqrt(
    Math.pow((stats1.avgR - stats2.avgR) / 255, 2) +
    Math.pow((stats1.avgG - stats2.avgG) / 255, 2) +
    Math.pow((stats1.avgB - stats2.avgB) / 255, 2)
  );

  // 2. Diferença de luminosidade normalizada
  const lumDiff = Math.abs(stats1.avgLum - stats2.avgLum) / 255;

  // 3. Diferença de textura/variação interna normalizada
  const textureDiff = Math.abs(stats1.stdDev - stats2.stdDev) / 128;

  // Converter diferenças em similaridades (inverso)
  const colorSim = 1 - Math.min(colorDiff, 1);
  const lumSim = 1 - Math.min(lumDiff, 1);
  const textureSim = 1 - Math.min(textureDiff, 1);

  // Pesos: Cor 60%, Luminosidade 25%, Textura 15%
  return (colorSim * 0.60) + (lumSim * 0.25) + (textureSim * 0.15);
}

