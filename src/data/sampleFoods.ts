/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Helper to generate realistic visual canvas food samples as data URLs
export interface SampleFoodItem {
  id: string;
  name: string;
  category: string;
  expectedClass: 'Fresh' | 'Aging' | 'Visibly Spoiled';
  description: string;
  dataUrl: string;
}

// Generate high quality canvas rendering for instant testing
function createFoodDataUrl(
  type:
    | 'fresh-apple'
    | 'aging-banana'
    | 'spoiled-tomato'
    | 'fresh-potato'
    | 'spoiled-orange'
    | 'fresh-bell-pepper'
): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Neutral studio background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 400, 400);

  // Soft drop shadow
  ctx.beginPath();
  ctx.ellipse(200, 310, 110, 24, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.fill();

  if (type === 'fresh-apple') {
    // Crisp red apple
    const grad = ctx.createRadialGradient(180, 170, 20, 200, 200, 120);
    grad.addColorStop(0, '#ff4d4d');
    grad.addColorStop(0.5, '#dc2626');
    grad.addColorStop(0.85, '#b91c1c');
    grad.addColorStop(1, '#7f1d1d');

    ctx.beginPath();
    ctx.arc(200, 200, 95, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Stem and leaf
    ctx.beginPath();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#5c3a21';
    ctx.moveTo(200, 110);
    ctx.quadraticCurveTo(205, 75, 215, 60);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(225, 75, 18, 9, Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = '#16a34a';
    ctx.fill();

    // Specular highlight (fresh glossy skin)
    ctx.beginPath();
    ctx.ellipse(165, 150, 18, 30, -Math.PI / 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();
  } else if (type === 'aging-banana') {
    // Aging yellow banana with brown freckles & soft ends
    ctx.save();
    ctx.translate(200, 200);
    ctx.rotate(-Math.PI / 8);

    // Banana curve
    ctx.beginPath();
    ctx.moveTo(-110, -30);
    ctx.quadraticCurveTo(0, 70, 110, -20);
    ctx.quadraticCurveTo(10, 120, -110, -30);
    ctx.fillStyle = '#eab308';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#a16207';
    ctx.stroke();

    // Brown sugar freckles & discoloration (aging signs)
    ctx.fillStyle = '#78350f';
    const spots = [
      [-70, 10, 4], [-40, 35, 6], [-10, 48, 5], [20, 52, 7],
      [60, 35, 5], [85, 10, 6], [-50, 20, 3], [0, 38, 4], [45, 42, 5],
      [-25, 28, 5], [30, 25, 4], [-85, -5, 5]
    ];
    for (const [x, y, r] of spots) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Dark brown tip
    ctx.beginPath();
    ctx.ellipse(108, -18, 8, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#451a03';
    ctx.fill();
    ctx.restore();
  } else if (type === 'spoiled-tomato') {
    // Visibly Spoiled tomato with fungal mold patches and black necrosis
    const grad = ctx.createRadialGradient(180, 180, 30, 200, 200, 100);
    grad.addColorStop(0, '#b91c1c');
    grad.addColorStop(0.6, '#991b1b');
    grad.addColorStop(0.85, '#450a0a');
    grad.addColorStop(1, '#2d0606');

    ctx.beginPath();
    ctx.arc(200, 200, 92, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Necrotic sunken spot
    ctx.beginPath();
    ctx.ellipse(225, 215, 38, 30, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#1c1917';
    ctx.fill();

    // Fuzzy mold mycelium spores (white/greenish/grayish)
    ctx.fillStyle = '#cbd5e1';
    for (let i = 0; i < 45; i++) {
      const rx = 225 + (Math.random() - 0.5) * 50;
      const ry = 215 + (Math.random() - 0.5) * 42;
      const rad = 2 + Math.random() * 3.5;
      ctx.beginPath();
      ctx.arc(rx, ry, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#86efac';
    for (let i = 0; i < 20; i++) {
      const rx = 225 + (Math.random() - 0.5) * 40;
      const ry = 215 + (Math.random() - 0.5) * 32;
      ctx.beginPath();
      ctx.arc(rx, ry, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Withered calyx sepals at crown so tomato anatomy is clearly recognizable
    ctx.fillStyle = '#3f6212';
    const sepals = [-0.65, -0.25, 0.25, 0.65];
    for (const angle of sepals) {
      ctx.save();
      ctx.translate(200, 114);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(200, 114);
    ctx.lineTo(203, 96);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#365314';
    ctx.stroke();

    // Shriveling skin lines around rot
    ctx.strokeStyle = '#450a0a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(200, 200, 85, 0.4, 1.2);
    ctx.stroke();
  } else if (type === 'fresh-potato') {
    // Fresh Russet potato
    const grad = ctx.createRadialGradient(180, 180, 20, 200, 200, 110);
    grad.addColorStop(0, '#d97706');
    grad.addColorStop(0.7, '#b45309');
    grad.addColorStop(1, '#78350f');

    ctx.beginPath();
    ctx.ellipse(200, 200, 105, 75, Math.PI / 12, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Potato eyes (shallow, normal)
    ctx.fillStyle = '#78350f';
    const eyes = [[150, 175], [230, 180], [180, 225], [250, 215], [140, 210]];
    for (const [x, y] of eyes) {
      ctx.beginPath();
      ctx.ellipse(x, y, 6, 3, Math.PI / 6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'spoiled-orange') {
    // Spoilage Citrus: Extensive blue-green Penicillium mold
    const grad = ctx.createRadialGradient(170, 170, 20, 200, 200, 100);
    grad.addColorStop(0, '#ea580c');
    grad.addColorStop(0.55, '#c2410c');
    grad.addColorStop(1, '#7c2d12');

    ctx.beginPath();
    ctx.arc(200, 200, 92, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Citrus calyx button at top so orange anatomy is clearly recognizable
    ctx.beginPath();
    ctx.arc(200, 114, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#3f6212';
    ctx.fill();

    // Penicillium mold bloom (white mycelium halo + greenish-blue spore core + stippling)
    ctx.beginPath();
    ctx.ellipse(175, 182, 45, 40, 0.15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(241, 245, 249, 0.92)';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(175, 182, 32, 28, 0.15, 0, Math.PI * 2);
    ctx.fillStyle = '#0f766e';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(173, 180, 20, 16, -0.1, 0, Math.PI * 2);
    ctx.fillStyle = '#115e59';
    ctx.fill();
  } else if (type === 'fresh-bell-pepper') {
    // Crisp 3-lobed green bell pepper with glossy ribs and curved calyx stem
    const leftGrad = ctx.createRadialGradient(145, 190, 15, 155, 205, 85);
    leftGrad.addColorStop(0, '#22c55e');
    leftGrad.addColorStop(0.65, '#15803d');
    leftGrad.addColorStop(1, '#14532d');

    const rightGrad = ctx.createRadialGradient(240, 190, 15, 245, 205, 85);
    rightGrad.addColorStop(0, '#22c55e');
    rightGrad.addColorStop(0.65, '#15803d');
    rightGrad.addColorStop(1, '#14532d');

    const midGrad = ctx.createRadialGradient(195, 185, 20, 200, 205, 95);
    midGrad.addColorStop(0, '#4ade80');
    midGrad.addColorStop(0.5, '#16a34a');
    midGrad.addColorStop(1, '#14532d');

    // Left and right outer lobes
    ctx.beginPath();
    ctx.roundRect(114, 126, 72, 162, 34);
    ctx.fillStyle = leftGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.roundRect(214, 126, 72, 162, 34);
    ctx.fillStyle = rightGrad;
    ctx.fill();

    // Prominent center lobe with rib crease shadows
    ctx.beginPath();
    ctx.roundRect(156, 120, 88, 174, 38);
    ctx.fillStyle = midGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(20, 83, 45, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(160, 132);
    ctx.quadraticCurveTo(154, 205, 164, 282);
    ctx.moveTo(240, 132);
    ctx.quadraticCurveTo(246, 205, 236, 282);
    ctx.stroke();

    // Thick curved bell-pepper calyx & stem
    ctx.beginPath();
    ctx.ellipse(200, 122, 30, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#14532d';
    ctx.fill();

    ctx.beginPath();
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#166534';
    ctx.moveTo(200, 120);
    ctx.quadraticCurveTo(194, 88, 218, 76);
    ctx.stroke();

    // Healthy specular gloss on lobes
    ctx.beginPath();
    ctx.ellipse(140, 185, 9, 34, -0.06, 0, Math.PI * 2);
    ctx.ellipse(186, 182, 11, 40, -0.04, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';
    ctx.fill();
  }

  return canvas.toDataURL('image/jpeg', 0.92);
}

let cachedSamples: SampleFoodItem[] | null = null;

export function getSampleFoods(): SampleFoodItem[] {
  if (cachedSamples) return cachedSamples;
  cachedSamples = [
    {
      id: 'fresh-apple',
      name: 'Crisp Red Apple',
      category: 'Apple',
      expectedClass: 'Fresh',
      description: 'Firm dermal skin, uniform red pigmentation, high gloss, no signs of mold or shriveling.',
      dataUrl: createFoodDataUrl('fresh-apple'),
    },
    {
      id: 'aging-banana',
      name: 'Senescent Banana',
      category: 'Banana',
      expectedClass: 'Aging',
      description: 'Surface sugar freckles, softening pericarp, localized browning spots indicating maturity.',
      dataUrl: createFoodDataUrl('aging-banana'),
    },
    {
      id: 'spoiled-tomato',
      name: 'Moldy Decaying Tomato',
      category: 'Tomato',
      expectedClass: 'Visibly Spoiled',
      description: 'Extensive black necrosis, fungal mycelium bloom, weeping soft rot, skin degradation.',
      dataUrl: createFoodDataUrl('spoiled-tomato'),
    },
    {
      id: 'fresh-potato',
      name: 'Russet Potato',
      category: 'Potato',
      expectedClass: 'Fresh',
      description: 'Firm tuber skin, natural earthen hue, absence of green solanine or sprout decay.',
      dataUrl: createFoodDataUrl('fresh-potato'),
    },
    {
      id: 'spoiled-orange',
      name: 'Spoiled Citrus Fruit',
      category: 'Orange',
      expectedClass: 'Visibly Spoiled',
      description: 'Fungal Penicillium rot, concentric white & teal mycelium bloom with collapsed rind.',
      dataUrl: createFoodDataUrl('spoiled-orange'),
    },
    {
      id: 'fresh-bell-pepper',
      name: 'Crisp Bell Pepper',
      category: 'Bell Pepper',
      expectedClass: 'Fresh',
      description: 'Vibrant green blocky pericarp, smooth glossy cuticle, free of soft spots or lesions.',
      dataUrl: createFoodDataUrl('fresh-bell-pepper'),
    },
  ];
  return cachedSamples;
}
