// LabBuddy — Mock Lab handler
// A no-AI, no-database mock flow for the demo:
//   upload syllabus  -> always returns the same curated curriculum
//   pick experiment  -> returns the experiment with refined SVG diagram
//   buy supplies     -> returns multi-vendor pricing (Walmart, Amazon, DoorDash, Target)
//
// Whatever the user uploads (or doesn't upload), the response is consistent.

import { Router, type Request, type Response } from "express";
import multer from "multer";

// ---------- in-memory mock catalog ----------

interface MockSyllabusUnit {
  unitNumber: number;
  title: string;
  topics: string[];
  standards: string[];
  timeframe: string;
  experimentIds: string[];
}

interface MockSyllabus {
  id: string;
  subject: string;
  gradeLevel: string;
  teacher: string;
  school: string;
  term: string;
  units: MockSyllabusUnit[];
  rawSummary: string;
}

interface VendorOffer {
  vendor: "Walmart" | "Amazon" | "DoorDash" | "Target";
  price: number;
  shippingDays: number;
  inStock: boolean;
  freeShipping: boolean;
  rating: number;
  reviews: number;
  url: string;
}

interface MockSupply {
  id: string;
  name: string;
  quantity: string;
  category: "kitchen" | "craft" | "hardware" | "produce" | "stationery";
  icon: string;
  offers: VendorOffer[];
}

interface DiagramAnnotation {
  x: number;
  y: number;
  label: string;
  color?: string;
}

interface MockExperiment {
  id: string;
  title: string;
  emoji: string;
  unit: string;
  category: "chemistry" | "physics" | "biology" | "earth-science";
  difficulty: "easy" | "medium" | "hard";
  duration: number;
  safetyTier: "green" | "yellow" | "red";
  description: string;
  scienceConcept: string;
  ngssStandard: string;
  hypothesis: string;
  procedure: string[];
  diagramSvg: string;
  diagramCaption: string;
  supplies: MockSupply[];
  funFact: string;
}

// ---------- supplies ----------

function offers(base: number, baseUrl: string): VendorOffer[] {
  // Stable per-supply variation around `base`
  return [
    {
      vendor: "Walmart",
      price: round2(base * 0.92),
      shippingDays: 2,
      inStock: true,
      freeShipping: base * 0.92 > 35,
      rating: 4.4,
      reviews: 1287,
      url: `https://www.walmart.com/search?q=${baseUrl}`,
    },
    {
      vendor: "Amazon",
      price: round2(base * 1.05),
      shippingDays: 1,
      inStock: true,
      freeShipping: true,
      rating: 4.6,
      reviews: 4912,
      url: `https://www.amazon.com/s?k=${baseUrl}`,
    },
    {
      vendor: "Target",
      price: round2(base * 0.99),
      shippingDays: 3,
      inStock: true,
      freeShipping: base * 0.99 > 35,
      rating: 4.5,
      reviews: 612,
      url: `https://www.target.com/s?searchTerm=${baseUrl}`,
    },
    {
      vendor: "DoorDash",
      price: round2(base * 1.18),
      shippingDays: 0,
      inStock: true,
      freeShipping: false,
      rating: 4.2,
      reviews: 203,
      url: `https://www.doordash.com/search/store/${baseUrl}/`,
    },
  ];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- diagrams (refined SVGs) ----------
//
// These are hand-tuned SVGs. They use the LabBuddy palette
// (--primary #6C63FF, --accent #4ECDC4, --secondary #FF6B6B) plus a few
// supporting colors. Each diagram is 720x480, has a soft gradient backdrop,
// labeled callouts, and uses inline filters for soft shadows.

const VOLCANO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480" role="img" aria-label="Cross-section of an erupting baking-soda volcano">
  <defs>
    <linearGradient id="vSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F2F0FF"/><stop offset="1" stop-color="#E6F7F5"/>
    </linearGradient>
    <linearGradient id="vMagma" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFD86B"/><stop offset="0.55" stop-color="#FF8A4C"/><stop offset="1" stop-color="#E64A2B"/>
    </linearGradient>
    <linearGradient id="vClay" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9B6B43"/><stop offset="1" stop-color="#5C3D24"/>
    </linearGradient>
    <linearGradient id="vBottle" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F8FAFF" stop-opacity="0.95"/><stop offset="1" stop-color="#D9E0F5" stop-opacity="0.9"/>
    </linearGradient>
    <radialGradient id="vBubble" cx="0.3" cy="0.3" r="0.7">
      <stop offset="0" stop-color="#FFF" stop-opacity="0.95"/><stop offset="1" stop-color="#FFF" stop-opacity="0.05"/>
    </radialGradient>
    <filter id="vShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
      <feOffset dy="4"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.25"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="720" height="480" fill="url(#vSky)"/>
  <!-- ground -->
  <path d="M0 410 Q360 380 720 410 L720 480 L0 480 Z" fill="#D9E8D2"/>
  <!-- volcano clay -->
  <path d="M120 410 Q230 360 290 250 L320 200 L400 200 L430 250 Q490 360 600 410 Z" fill="url(#vClay)" filter="url(#vShadow)"/>
  <!-- crater opening -->
  <ellipse cx="360" cy="200" rx="40" ry="10" fill="#3A2614"/>
  <!-- bottle (cutaway) -->
  <path d="M335 410 L335 220 Q335 205 350 205 L370 205 Q385 205 385 220 L385 410 Z"
        fill="url(#vBottle)" stroke="#9CA8C8" stroke-width="2" stroke-dasharray="3 3"/>
  <!-- liquid layers inside bottle -->
  <rect x="337" y="320" width="46" height="88" fill="#FFE7E5"/>
  <rect x="337" y="280" width="46" height="40" fill="#FFC9C5"/>
  <rect x="337" y="245" width="46" height="35" fill="#F4F4F0"/>
  <!-- erupting magma column -->
  <path d="M340 200 Q360 130 350 80 Q345 60 360 50 Q380 65 372 95 Q380 140 380 200 Z"
        fill="url(#vMagma)" filter="url(#vShadow)"/>
  <!-- foam droplets -->
  <g fill="url(#vMagma)">
    <ellipse cx="300" cy="160" rx="22" ry="14"/>
    <ellipse cx="420" cy="170" rx="26" ry="16"/>
    <ellipse cx="270" cy="220" rx="18" ry="12"/>
    <ellipse cx="450" cy="230" rx="20" ry="13"/>
    <ellipse cx="240" cy="280" rx="14" ry="9"/>
    <ellipse cx="480" cy="290" rx="16" ry="10"/>
  </g>
  <!-- gas bubbles -->
  <g>
    <circle cx="358" cy="100" r="9" fill="url(#vBubble)"/>
    <circle cx="372" cy="78" r="6" fill="url(#vBubble)"/>
    <circle cx="346" cy="65" r="5" fill="url(#vBubble)"/>
    <circle cx="362" cy="48" r="7" fill="url(#vBubble)"/>
  </g>
  <!-- callouts -->
  <g font-family="Nunito, sans-serif" font-weight="700" font-size="14" fill="#2D3436">
    <line x1="385" y1="260" x2="540" y2="240" stroke="#6C63FF" stroke-width="2"/>
    <circle cx="385" cy="260" r="4" fill="#6C63FF"/>
    <rect x="540" y="222" width="170" height="36" rx="8" fill="#FFF" stroke="#6C63FF" stroke-width="1.5"/>
    <text x="550" y="240">Baking soda</text>
    <text x="550" y="254" font-size="11" fill="#636E72">NaHCO₃ (base)</text>

    <line x1="385" y1="330" x2="540" y2="330" stroke="#FF6B6B" stroke-width="2"/>
    <circle cx="385" cy="330" r="4" fill="#FF6B6B"/>
    <rect x="540" y="312" width="170" height="36" rx="8" fill="#FFF" stroke="#FF6B6B" stroke-width="1.5"/>
    <text x="550" y="330">Vinegar</text>
    <text x="550" y="344" font-size="11" fill="#636E72">CH₃COOH (acid)</text>

    <line x1="360" y1="60" x2="200" y2="60" stroke="#4ECDC4" stroke-width="2"/>
    <circle cx="360" cy="60" r="4" fill="#4ECDC4"/>
    <rect x="20" y="42" width="180" height="36" rx="8" fill="#FFF" stroke="#4ECDC4" stroke-width="1.5"/>
    <text x="30" y="60">Carbon dioxide gas</text>
    <text x="30" y="74" font-size="11" fill="#636E72">CO₂ — pushes foam up</text>
  </g>
  <!-- equation strip -->
  <rect x="180" y="436" width="360" height="32" rx="16" fill="#FFF" stroke="#E0E3F0"/>
  <text x="360" y="457" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="13" fill="#2D3436">
    NaHCO₃ + CH₃COOH → CO₂↑ + H₂O + CH₃COONa
  </text>
</svg>`;

const LEMON_BATTERY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480" role="img" aria-label="Lemon battery circuit lighting an LED">
  <defs>
    <linearGradient id="lBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F2F0FF"/><stop offset="1" stop-color="#FFF7E0"/>
    </linearGradient>
    <radialGradient id="lLemon" cx="0.4" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#FFF59B"/><stop offset="0.7" stop-color="#FFD84A"/><stop offset="1" stop-color="#E0AC0C"/>
    </radialGradient>
    <linearGradient id="lZinc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E5EBF2"/><stop offset="1" stop-color="#9AA9BC"/>
    </linearGradient>
    <linearGradient id="lCopper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F5B27A"/><stop offset="1" stop-color="#B5651D"/>
    </linearGradient>
    <radialGradient id="lLED" cx="0.5" cy="0.4" r="0.6">
      <stop offset="0" stop-color="#FFFCE0"/><stop offset="0.5" stop-color="#FFE15A"/><stop offset="1" stop-color="#FF9A2A"/>
    </radialGradient>
    <radialGradient id="lGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#FFE15A" stop-opacity="0.6"/><stop offset="1" stop-color="#FFE15A" stop-opacity="0"/>
    </radialGradient>
    <filter id="lShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dy="3"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.28"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="720" height="480" fill="url(#lBg)"/>
  <!-- table line -->
  <line x1="0" y1="380" x2="720" y2="380" stroke="#E0E3F0" stroke-width="2"/>
  <!-- LED glow -->
  <circle cx="360" cy="120" r="80" fill="url(#lGlow)"/>
  <!-- LED bulb -->
  <g filter="url(#lShadow)">
    <path d="M340 90 Q340 70 360 70 Q380 70 380 90 L380 130 L340 130 Z" fill="url(#lLED)" stroke="#B97A1F" stroke-width="2"/>
    <ellipse cx="360" cy="92" rx="9" ry="4" fill="#FFF" opacity="0.7"/>
    <rect x="346" y="130" width="28" height="6" fill="#9AA9BC"/>
    <line x1="352" y1="136" x2="352" y2="178" stroke="#9AA9BC" stroke-width="3"/>
    <line x1="368" y1="136" x2="368" y2="178" stroke="#9AA9BC" stroke-width="3"/>
  </g>
  <!-- wires -->
  <path d="M352 178 Q280 220 240 290 L240 320" fill="none" stroke="#2D3436" stroke-width="3" stroke-linecap="round"/>
  <path d="M368 178 Q440 220 480 290 L480 320" fill="none" stroke="#FF6B6B" stroke-width="3" stroke-linecap="round"/>
  <!-- alligator clips -->
  <g fill="#2D3436"><rect x="232" y="316" width="16" height="10" rx="2"/></g>
  <g fill="#FF6B6B"><rect x="472" y="316" width="16" height="10" rx="2"/></g>
  <!-- lemon -->
  <g filter="url(#lShadow)">
    <ellipse cx="360" cy="370" rx="180" ry="60" fill="url(#lLemon)" stroke="#C28800" stroke-width="2"/>
    <!-- texture dots -->
    <g fill="#E0AC0C" opacity="0.4">
      <circle cx="240" cy="350" r="2"/><circle cx="270" cy="380" r="2"/><circle cx="300" cy="360" r="2"/>
      <circle cx="340" cy="385" r="2"/><circle cx="380" cy="355" r="2"/><circle cx="420" cy="380" r="2"/>
      <circle cx="450" cy="360" r="2"/><circle cx="480" cy="385" r="2"/>
    </g>
  </g>
  <!-- electrodes embedded in lemon -->
  <g filter="url(#lShadow)">
    <rect x="234" y="320" width="12" height="60" rx="2" fill="url(#lZinc)"/>
    <rect x="474" y="320" width="12" height="60" rx="2" fill="url(#lCopper)"/>
  </g>
  <!-- ion arrows inside -->
  <g stroke="#6C63FF" stroke-width="2" fill="none" marker-end="url(#arrowL)">
    <path d="M260 365 Q310 355 360 360"/>
    <path d="M260 380 Q310 380 360 380"/>
  </g>
  <g stroke="#FF6B6B" stroke-width="2" fill="none" marker-end="url(#arrowR)">
    <path d="M460 365 Q410 355 360 360"/>
  </g>
  <defs>
    <marker id="arrowL" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0 0 L10 5 L0 10 Z" fill="#6C63FF"/>
    </marker>
    <marker id="arrowR" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0 0 L10 5 L0 10 Z" fill="#FF6B6B"/>
    </marker>
  </defs>
  <!-- callouts -->
  <g font-family="Nunito, sans-serif" font-weight="700" font-size="14" fill="#2D3436">
    <rect x="20" y="290" width="180" height="56" rx="10" fill="#FFF" stroke="#6C63FF" stroke-width="1.5"/>
    <text x="32" y="312">Zinc nail (–)</text>
    <text x="32" y="328" font-size="11" fill="#636E72">gives up electrons</text>
    <line x1="200" y1="320" x2="240" y2="320" stroke="#6C63FF" stroke-width="2"/>

    <rect x="520" y="290" width="180" height="56" rx="10" fill="#FFF" stroke="#FF6B6B" stroke-width="1.5"/>
    <text x="532" y="312">Copper coin (+)</text>
    <text x="532" y="328" font-size="11" fill="#636E72">accepts electrons</text>
    <line x1="520" y1="320" x2="486" y2="320" stroke="#FF6B6B" stroke-width="2"/>

    <rect x="500" y="80" width="200" height="56" rx="10" fill="#FFF" stroke="#FFB400" stroke-width="1.5"/>
    <text x="512" y="100">LED lights up!</text>
    <text x="512" y="118" font-size="11" fill="#636E72">~0.9 V from one lemon</text>
    <line x1="500" y1="108" x2="380" y2="108" stroke="#FFB400" stroke-width="2"/>
  </g>
  <!-- equation -->
  <rect x="200" y="438" width="320" height="30" rx="15" fill="#FFF" stroke="#E0E3F0"/>
  <text x="360" y="458" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="12" fill="#2D3436">
    Zn → Zn²⁺ + 2e⁻     2H⁺ + 2e⁻ → H₂
  </text>
</svg>`;

const CLOUD_JAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480" role="img" aria-label="Cloud forming inside a glass jar">
  <defs>
    <linearGradient id="cBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#DFF5FF"/><stop offset="1" stop-color="#F2F0FF"/>
    </linearGradient>
    <linearGradient id="cJar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#E2EAF5" stop-opacity="0.85"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#E2EAF5" stop-opacity="0.85"/>
    </linearGradient>
    <linearGradient id="cWater" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7BCFE0"/><stop offset="1" stop-color="#3D8DA6"/>
    </linearGradient>
    <radialGradient id="cCloud" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cIce" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E0F0FF"/><stop offset="1" stop-color="#9BC5E6"/>
    </linearGradient>
    <filter id="cShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dy="3"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.22"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="720" height="480" fill="url(#cBg)"/>
  <!-- table -->
  <ellipse cx="360" cy="430" rx="220" ry="14" fill="#000" opacity="0.06"/>
  <!-- jar body -->
  <g filter="url(#cShadow)">
    <path d="M250 110 Q250 95 270 95 L450 95 Q470 95 470 110 L470 420 Q470 440 450 440 L270 440 Q250 440 250 420 Z"
          fill="url(#cJar)" stroke="#9AA9BC" stroke-width="2"/>
    <!-- jar rim -->
    <rect x="245" y="92" width="230" height="14" rx="6" fill="#9AA9BC"/>
  </g>
  <!-- ice on plate -->
  <g filter="url(#cShadow)">
    <ellipse cx="360" cy="80" rx="120" ry="8" fill="#9AA9BC"/>
    <g fill="url(#cIce)">
      <polygon points="290,72 308,52 326,72"/>
      <polygon points="332,76 352,46 372,76"/>
      <polygon points="378,72 398,56 418,72"/>
      <polygon points="332,68 350,58 360,72"/>
    </g>
  </g>
  <!-- warm water at bottom -->
  <path d="M260 360 Q360 350 460 360 L460 420 Q460 432 450 432 L270 432 Q260 432 260 420 Z"
        fill="url(#cWater)" opacity="0.8"/>
  <!-- evaporation arrows -->
  <g stroke="#FF6B6B" stroke-width="2" fill="none">
    <path d="M310 350 Q310 290 320 230" stroke-dasharray="4 4"/>
    <path d="M360 350 Q360 280 350 220" stroke-dasharray="4 4"/>
    <path d="M410 350 Q410 290 400 230" stroke-dasharray="4 4"/>
  </g>
  <!-- cloud (condensation zone) -->
  <g>
    <ellipse cx="360" cy="200" rx="80" ry="35" fill="url(#cCloud)"/>
    <ellipse cx="320" cy="190" rx="40" ry="22" fill="url(#cCloud)"/>
    <ellipse cx="400" cy="190" rx="40" ry="22" fill="url(#cCloud)"/>
  </g>
  <!-- droplet condensation on lid -->
  <g fill="#7BCFE0" opacity="0.85">
    <circle cx="290" cy="115" r="3"/><circle cx="310" cy="118" r="2"/>
    <circle cx="340" cy="116" r="3"/><circle cx="370" cy="119" r="2"/>
    <circle cx="400" cy="115" r="3"/><circle cx="430" cy="118" r="2"/>
  </g>
  <!-- steam squiggles -->
  <g stroke="#7BCFE0" stroke-width="2" fill="none" opacity="0.7">
    <path d="M295 340 Q300 330 295 320 Q290 310 295 300"/>
    <path d="M340 340 Q345 330 340 320 Q335 310 340 300"/>
    <path d="M385 340 Q390 330 385 320 Q380 310 385 300"/>
    <path d="M430 340 Q435 330 430 320 Q425 310 430 300"/>
  </g>
  <!-- callouts -->
  <g font-family="Nunito, sans-serif" font-weight="700" font-size="14" fill="#2D3436">
    <rect x="20" y="40" width="180" height="56" rx="10" fill="#FFF" stroke="#4ECDC4" stroke-width="1.5"/>
    <text x="32" y="62">Cold lid + ice</text>
    <text x="32" y="78" font-size="11" fill="#636E72">cools rising vapor</text>
    <line x1="200" y1="68" x2="290" y2="80" stroke="#4ECDC4" stroke-width="2"/>

    <rect x="520" y="170" width="180" height="56" rx="10" fill="#FFF" stroke="#6C63FF" stroke-width="1.5"/>
    <text x="532" y="192">Cloud forms</text>
    <text x="532" y="208" font-size="11" fill="#636E72">vapor → tiny droplets</text>
    <line x1="520" y1="200" x2="440" y2="200" stroke="#6C63FF" stroke-width="2"/>

    <rect x="20" y="370" width="200" height="56" rx="10" fill="#FFF" stroke="#FF6B6B" stroke-width="1.5"/>
    <text x="32" y="392">Warm water evaporates</text>
    <text x="32" y="408" font-size="11" fill="#636E72">heat → water vapor rises</text>
    <line x1="220" y1="395" x2="260" y2="395" stroke="#FF6B6B" stroke-width="2"/>
  </g>
  <!-- equation -->
  <rect x="200" y="446" width="320" height="26" rx="13" fill="#FFF" stroke="#E0E3F0"/>
  <text x="360" y="464" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="12" fill="#2D3436">
    H₂O(l) → H₂O(g) → H₂O(l)   (evaporation → condensation)
  </text>
</svg>`;

const CRYSTAL_GARDEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480" role="img" aria-label="Crystal garden growing on a string">
  <defs>
    <linearGradient id="xBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F2F0FF"/><stop offset="1" stop-color="#E0F7F4"/>
    </linearGradient>
    <linearGradient id="xGlass" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.9"/>
      <stop offset="0.5" stop-color="#E2EAF5" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="xSolution" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#A4DDF5" stop-opacity="0.65"/>
      <stop offset="1" stop-color="#5DA8C9" stop-opacity="0.85"/>
    </linearGradient>
    <linearGradient id="xCrystal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFEAF7"/><stop offset="0.5" stop-color="#FF9CCF"/><stop offset="1" stop-color="#9C5BAE"/>
    </linearGradient>
    <filter id="xShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="4"/><feOffset dy="3"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.25"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="720" height="480" fill="url(#xBg)"/>
  <ellipse cx="360" cy="438" rx="200" ry="10" fill="#000" opacity="0.06"/>
  <!-- pencil on top -->
  <g filter="url(#xShadow)">
    <rect x="220" y="92" width="280" height="10" rx="2" fill="#F1C40F"/>
    <polygon points="220,97 200,97 210,92 210,102" fill="#2D3436"/>
    <rect x="500" y="90" width="22" height="14" fill="#FF6B6B"/>
  </g>
  <!-- string -->
  <line x1="360" y1="102" x2="360" y2="220" stroke="#9AA9BC" stroke-width="2"/>
  <!-- glass jar -->
  <g filter="url(#xShadow)">
    <path d="M240 130 Q240 120 260 120 L460 120 Q480 120 480 130 L490 420 Q490 432 478 432 L242 432 Q230 432 230 420 Z"
          fill="url(#xGlass)" stroke="#9AA9BC" stroke-width="2"/>
  </g>
  <!-- supersaturated solution -->
  <path d="M243 175 Q360 168 477 175 L488 420 Q488 430 478 430 L242 430 Q232 430 232 420 Z"
        fill="url(#xSolution)"/>
  <!-- water surface highlight -->
  <path d="M243 175 Q360 168 477 175" fill="none" stroke="#FFFFFF" stroke-width="1.5" opacity="0.7"/>
  <!-- crystals on string -->
  <g filter="url(#xShadow)">
    <polygon points="350,210 360,200 370,210 366,232 354,232" fill="url(#xCrystal)" stroke="#7C3F8E" stroke-width="1"/>
    <polygon points="340,235 360,222 380,235 376,262 344,262" fill="url(#xCrystal)" stroke="#7C3F8E" stroke-width="1"/>
    <polygon points="330,265 360,250 390,265 384,300 336,300" fill="url(#xCrystal)" stroke="#7C3F8E" stroke-width="1"/>
    <polygon points="322,302 360,285 398,302 392,346 328,346" fill="url(#xCrystal)" stroke="#7C3F8E" stroke-width="1"/>
    <!-- side branches -->
    <polygon points="310,310 322,302 326,328 314,330" fill="url(#xCrystal)" stroke="#7C3F8E" stroke-width="1"/>
    <polygon points="402,308 392,302 396,328 410,326" fill="url(#xCrystal)" stroke="#7C3F8E" stroke-width="1"/>
    <polygon points="290,340 310,325 312,360 295,362" fill="url(#xCrystal)" stroke="#7C3F8E" stroke-width="1"/>
    <polygon points="430,338 410,326 416,362 432,360" fill="url(#xCrystal)" stroke="#7C3F8E" stroke-width="1"/>
  </g>
  <!-- floating ions/molecules -->
  <g font-family="ui-monospace, Menlo, monospace" font-size="10" fill="#6C63FF">
    <text x="270" y="220">Na⁺</text>
    <text x="430" y="240">Cl⁻</text>
    <text x="300" y="380">Na⁺</text>
    <text x="420" y="395">Cl⁻</text>
    <text x="260" y="320">Na⁺</text>
    <text x="450" y="350">Cl⁻</text>
  </g>
  <!-- callouts -->
  <g font-family="Nunito, sans-serif" font-weight="700" font-size="14" fill="#2D3436">
    <rect x="20" y="60" width="180" height="56" rx="10" fill="#FFF" stroke="#6C63FF" stroke-width="1.5"/>
    <text x="32" y="82">Pencil & string</text>
    <text x="32" y="98" font-size="11" fill="#636E72">gives crystals a place to grow</text>
    <line x1="200" y1="86" x2="350" y2="100" stroke="#6C63FF" stroke-width="2"/>

    <rect x="520" y="240" width="180" height="56" rx="10" fill="#FFF" stroke="#9C5BAE" stroke-width="1.5"/>
    <text x="532" y="262">Crystal growth</text>
    <text x="532" y="278" font-size="11" fill="#636E72">ions stack in a pattern</text>
    <line x1="520" y1="270" x2="400" y2="270" stroke="#9C5BAE" stroke-width="2"/>

    <rect x="20" y="380" width="190" height="56" rx="10" fill="#FFF" stroke="#4ECDC4" stroke-width="1.5"/>
    <text x="32" y="402">Supersaturated solution</text>
    <text x="32" y="418" font-size="11" fill="#636E72">more salt than water can hold</text>
    <line x1="210" y1="406" x2="240" y2="380" stroke="#4ECDC4" stroke-width="2"/>
  </g>
  <rect x="190" y="446" width="340" height="26" rx="13" fill="#FFF" stroke="#E0E3F0"/>
  <text x="360" y="464" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="12" fill="#2D3436">
    Na⁺(aq) + Cl⁻(aq) → NaCl(s)   (crystallization)
  </text>
</svg>`;

const PLANT_GROWTH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480" role="img" aria-label="Plant growth in different light conditions">
  <defs>
    <linearGradient id="pBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF7CE"/><stop offset="1" stop-color="#E0F7F4"/>
    </linearGradient>
    <linearGradient id="pSoil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8B5A3B"/><stop offset="1" stop-color="#4A2E1A"/>
    </linearGradient>
    <linearGradient id="pPot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E78A57"/><stop offset="1" stop-color="#B5642F"/>
    </linearGradient>
    <linearGradient id="pStem" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#A8E063"/><stop offset="1" stop-color="#56AB2F"/>
    </linearGradient>
    <linearGradient id="pStemDark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#C8C098"/><stop offset="1" stop-color="#7A7556"/>
    </linearGradient>
    <radialGradient id="pSun" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#FFE15A"/><stop offset="0.7" stop-color="#FFB400" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#FFB400" stop-opacity="0"/>
    </radialGradient>
    <filter id="pShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="4"/><feOffset dy="3"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.25"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="720" height="480" fill="url(#pBg)"/>
  <!-- divider -->
  <line x1="360" y1="40" x2="360" y2="440" stroke="#E0E3F0" stroke-width="2" stroke-dasharray="6 6"/>
  <text x="180" y="32" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="800" font-size="16" fill="#FFB400">Sunlight ☀️</text>
  <text x="540" y="32" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="800" font-size="16" fill="#636E72">Darkness 🌑</text>
  <!-- sun on left -->
  <circle cx="100" cy="80" r="40" fill="url(#pSun)"/>
  <circle cx="100" cy="80" r="22" fill="#FFE15A"/>
  <!-- sunbeams -->
  <g stroke="#FFB400" stroke-width="2" stroke-linecap="round">
    <line x1="100" y1="20" x2="100" y2="40"/>
    <line x1="40" y1="80" x2="60" y2="80"/>
    <line x1="55" y1="35" x2="70" y2="50"/>
    <line x1="145" y1="35" x2="130" y2="50"/>
    <line x1="160" y1="80" x2="140" y2="80"/>
    <line x1="55" y1="125" x2="70" y2="110"/>
  </g>
  <!-- ground -->
  <rect x="0" y="380" width="720" height="60" fill="#D9E8D2"/>
  <!-- pot left (healthy) -->
  <g filter="url(#pShadow)">
    <path d="M120 380 L240 380 L225 440 L135 440 Z" fill="url(#pPot)"/>
    <ellipse cx="180" cy="380" rx="60" ry="8" fill="#7A4F2A"/>
    <ellipse cx="180" cy="382" rx="56" ry="6" fill="url(#pSoil)"/>
  </g>
  <!-- healthy plant -->
  <path d="M180 382 Q180 320 175 260 Q170 200 180 140" stroke="url(#pStem)" stroke-width="6" fill="none" stroke-linecap="round"/>
  <!-- leaves -->
  <g fill="url(#pStem)" filter="url(#pShadow)">
    <ellipse cx="155" cy="320" rx="28" ry="14" transform="rotate(-30 155 320)"/>
    <ellipse cx="205" cy="280" rx="32" ry="16" transform="rotate(30 205 280)"/>
    <ellipse cx="150" cy="240" rx="30" ry="14" transform="rotate(-25 150 240)"/>
    <ellipse cx="210" cy="200" rx="34" ry="16" transform="rotate(25 210 200)"/>
    <ellipse cx="155" cy="160" rx="28" ry="13" transform="rotate(-20 155 160)"/>
  </g>
  <!-- flower -->
  <g filter="url(#pShadow)">
    <circle cx="180" cy="130" r="16" fill="#FFE15A"/>
    <g fill="#FF6B6B">
      <circle cx="180" cy="110" r="10"/>
      <circle cx="200" cy="125" r="10"/>
      <circle cx="195" cy="148" r="10"/>
      <circle cx="165" cy="148" r="10"/>
      <circle cx="160" cy="125" r="10"/>
    </g>
    <circle cx="180" cy="130" r="8" fill="#FFB400"/>
  </g>
  <!-- pot right (sad) -->
  <g filter="url(#pShadow)">
    <path d="M480 380 L600 380 L585 440 L495 440 Z" fill="url(#pPot)" opacity="0.7"/>
    <ellipse cx="540" cy="380" rx="60" ry="8" fill="#7A4F2A"/>
    <ellipse cx="540" cy="382" rx="56" ry="6" fill="url(#pSoil)"/>
  </g>
  <!-- sad plant -->
  <path d="M540 382 Q545 350 540 320 Q535 290 545 260" stroke="url(#pStemDark)" stroke-width="5" fill="none" stroke-linecap="round"/>
  <g fill="url(#pStemDark)" opacity="0.85">
    <ellipse cx="525" cy="345" rx="18" ry="8" transform="rotate(-50 525 345)"/>
    <ellipse cx="555" cy="305" rx="20" ry="9" transform="rotate(60 555 305)"/>
    <ellipse cx="530" cy="270" rx="18" ry="8" transform="rotate(-45 530 270)"/>
  </g>
  <!-- callouts -->
  <g font-family="Nunito, sans-serif" font-weight="700" font-size="14" fill="#2D3436">
    <rect x="240" y="180" width="100" height="50" rx="10" fill="#FFF" stroke="#56AB2F" stroke-width="1.5"/>
    <text x="290" y="202" text-anchor="middle">Tall, green</text>
    <text x="290" y="220" font-size="11" fill="#636E72" text-anchor="middle">photosynthesis ✓</text>

    <rect x="380" y="180" width="100" height="50" rx="10" fill="#FFF" stroke="#7A7556" stroke-width="1.5"/>
    <text x="430" y="202" text-anchor="middle">Pale, droopy</text>
    <text x="430" y="220" font-size="11" fill="#636E72" text-anchor="middle">no chlorophyll</text>
  </g>
  <rect x="180" y="446" width="360" height="26" rx="13" fill="#FFF" stroke="#E0E3F0"/>
  <text x="360" y="464" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="12" fill="#2D3436">
    6 CO₂ + 6 H₂O + light → C₆H₁₂O₆ + 6 O₂
  </text>
</svg>`;

// ---------- experiments ----------

const EXPERIMENTS: MockExperiment[] = [
  {
    id: "erupting-volcano",
    title: "Erupting Volcano",
    emoji: "🌋",
    unit: "Unit 1: Matter & Chemical Reactions",
    category: "chemistry",
    difficulty: "easy",
    duration: 25,
    safetyTier: "green",
    description:
      "Build a tabletop volcano and trigger a foamy eruption by mixing baking soda and vinegar. Investigate how an acid-base reaction releases gas, and how variables (temperature, ratio) change the eruption.",
    scienceConcept:
      "An acid-base reaction between sodium bicarbonate and acetic acid releases CO₂, water, and sodium acetate. The pressure of the released CO₂ pushes the soapy liquid up and out — analogous to gas pressure in a real volcano.",
    ngssStandard: "MS-PS1-2 — Analyze data to determine if a chemical reaction has occurred.",
    hypothesis: "If we increase the amount of vinegar, then the eruption will be larger because more reactant produces more CO₂ gas.",
    procedure: [
      "Place an empty 12 oz plastic bottle on a baking tray and shape modeling clay around it to form a volcano cone — leave the opening clear.",
      "Pour 3 tablespoons of baking soda into the bottle.",
      "Add 1 tablespoon of dish soap and 6 drops of red food coloring.",
      "In a measuring cup, prepare ½ cup of white vinegar.",
      "Quickly pour the vinegar into the bottle and step back to observe.",
      "Record the height of the eruption and how long it lasts.",
      "Repeat with double the vinegar — record again and compare.",
    ],
    diagramSvg: VOLCANO_SVG,
    diagramCaption: "Cross-section showing the bottle inside the clay cone, layered reactants, and the CO₂ gas pushing the foam up and out of the crater.",
    funFact: "The same kind of pressurized-gas behavior is what makes champagne pop and what shapes real volcanic eruptions — except real magma is melted rock at 700°C+.",
    supplies: [
      {
        id: "baking-soda",
        name: "Baking soda (Arm & Hammer, 16 oz)",
        quantity: "1 box",
        category: "kitchen",
        icon: "🥄",
        offers: offers(2.49, "baking-soda-arm-hammer-16oz"),
      },
      {
        id: "white-vinegar",
        name: "Distilled white vinegar (32 oz)",
        quantity: "1 bottle",
        category: "kitchen",
        icon: "🧴",
        offers: offers(2.99, "distilled-white-vinegar-32oz"),
      },
      {
        id: "dish-soap",
        name: "Dawn dish soap (7 oz)",
        quantity: "1 bottle",
        category: "kitchen",
        icon: "🧼",
        offers: offers(3.49, "dawn-dish-soap-7oz"),
      },
      {
        id: "food-coloring",
        name: "McCormick food color (4 ct)",
        quantity: "1 pack",
        category: "kitchen",
        icon: "🎨",
        offers: offers(4.99, "mccormick-food-coloring-4-pack"),
      },
      {
        id: "modeling-clay",
        name: "Crayola modeling clay (1 lb)",
        quantity: "1 pack",
        category: "craft",
        icon: "🧱",
        offers: offers(6.99, "crayola-modeling-clay-1lb"),
      },
      {
        id: "plastic-bottle",
        name: "12 oz empty plastic bottle",
        quantity: "1",
        category: "kitchen",
        icon: "🍶",
        offers: offers(1.49, "empty-12oz-plastic-bottle"),
      },
    ],
  },
  {
    id: "lemon-battery",
    title: "Lemon Battery",
    emoji: "🍋",
    unit: "Unit 3: Energy & Electricity",
    category: "physics",
    difficulty: "medium",
    duration: 30,
    safetyTier: "green",
    description:
      "Turn a lemon into a tiny battery powerful enough to light an LED. Insert a zinc nail and a copper coin into the lemon, connect them with wires, and measure the current that flows.",
    scienceConcept:
      "Two different metals (zinc and copper) sitting in an acidic electrolyte (lemon juice) form an electrochemical cell. Zinc atoms lose electrons and become Zn²⁺ ions; those electrons flow through the external wire to the copper, where hydrogen ions (H⁺) accept them to form H₂ gas.",
    ngssStandard: "MS-PS3-3 — Apply scientific principles to design a device that converts one form of energy to another.",
    hypothesis: "If we connect three lemons in series, then the LED will glow brighter because the voltages add together.",
    procedure: [
      "Roll a lemon firmly on the counter to break interior cells and release juice.",
      "Insert a zinc-coated nail about 1 inch deep into one side of the lemon.",
      "Insert a copper coin (or copper wire) about 1 inch deep into the opposite side, not touching the nail.",
      "Clip an alligator wire to the zinc nail and the other end to the negative leg of an LED.",
      "Clip a second alligator wire to the copper and the other end to the positive leg of the LED.",
      "Observe the LED — it should glow faintly. Use a multimeter to read the voltage (~0.9V).",
      "Connect three lemons in series (zinc-to-copper) and re-test brightness.",
    ],
    diagramSvg: LEMON_BATTERY_SVG,
    diagramCaption: "Lemon battery circuit. The zinc nail (anode) gives up electrons that travel through the wire and LED, returning to the copper electrode (cathode) where hydrogen ions complete the circuit.",
    funFact: "Alessandro Volta's first battery in 1800 used the same principle — two metals separated by a salty conductor. The 'volt' is named after him.",
    supplies: [
      {
        id: "lemons",
        name: "Lemons (4 ct, fresh)",
        quantity: "4 lemons",
        category: "produce",
        icon: "🍋",
        offers: offers(3.99, "lemons-4-pack-fresh"),
      },
      {
        id: "zinc-nails",
        name: "Galvanized zinc nails (2 in, pack of 10)",
        quantity: "1 pack",
        category: "hardware",
        icon: "🔩",
        offers: offers(4.49, "galvanized-zinc-nails-2in"),
      },
      {
        id: "copper-coins",
        name: "Copper-plated coins (10 ct)",
        quantity: "1 pack",
        category: "hardware",
        icon: "🪙",
        offers: offers(5.99, "copper-coins-10-pack"),
      },
      {
        id: "alligator-clips",
        name: "Alligator clip leads (10 pack, mixed colors)",
        quantity: "1 pack",
        category: "hardware",
        icon: "🔌",
        offers: offers(8.99, "alligator-clip-leads-10-pack"),
      },
      {
        id: "led-bulb",
        name: "Low-voltage LED (5mm, red, 25 ct)",
        quantity: "1 pack",
        category: "hardware",
        icon: "💡",
        offers: offers(6.49, "5mm-led-25-pack"),
      },
      {
        id: "multimeter",
        name: "Digital multimeter (entry-level)",
        quantity: "1",
        category: "hardware",
        icon: "📟",
        offers: offers(14.99, "entry-level-digital-multimeter"),
      },
    ],
  },
  {
    id: "cloud-in-a-jar",
    title: "Cloud in a Jar",
    emoji: "☁️",
    unit: "Unit 5: Earth's Systems & Weather",
    category: "earth-science",
    difficulty: "easy",
    duration: 15,
    safetyTier: "yellow",
    description:
      "Make a real cloud appear inside a glass jar in under a minute. Warm water + cold air + a particle to condense onto = the same recipe as clouds in the sky.",
    scienceConcept:
      "Warm water evaporates into vapor. When that vapor rises and meets cold air at the lid, it cools below the dew point and condenses onto microscopic smoke particles, forming the visible droplets we call a cloud.",
    ngssStandard: "MS-ESS2-4 — Develop a model to describe the cycling of water through Earth's systems.",
    hypothesis: "If we add a smoke particle (condensation nucleus), then a cloud will form inside the jar because water vapor needs a surface to condense onto.",
    procedure: [
      "Pour ⅓ cup of hot (not boiling) water into a clean glass jar.",
      "Place a metal lid (upside down) on top of the jar and add 6-8 ice cubes onto the lid.",
      "Wait 20 seconds for the air inside to warm up while the lid stays cold.",
      "Lift the lid quickly, light a match, blow it out, and drop the smoking match into the jar.",
      "Replace the lid + ice immediately. Watch a cloud form inside the jar within seconds.",
      "Remove the lid — the cloud floats out into the room.",
    ],
    diagramSvg: CLOUD_JAR_SVG,
    diagramCaption: "Inside the jar: warm vapor rises from the water, hits the cold lid, and condenses into droplets around smoke nuclei to form a visible cloud.",
    funFact: "Without dust, smoke, or sea-salt particles in the air, clouds wouldn't form even at 100% humidity. Water vapor needs something to condense onto.",
    supplies: [
      {
        id: "mason-jar",
        name: "Ball Mason jar with lid (16 oz)",
        quantity: "1",
        category: "kitchen",
        icon: "🫙",
        offers: offers(4.99, "ball-mason-jar-16oz-with-lid"),
      },
      {
        id: "matches",
        name: "Wooden safety matches (250 ct)",
        quantity: "1 box",
        category: "kitchen",
        icon: "🔥",
        offers: offers(2.99, "wooden-safety-matches-250"),
      },
      {
        id: "ice-cubes",
        name: "Reddy ice cubes (5 lb)",
        quantity: "1 bag",
        category: "kitchen",
        icon: "🧊",
        offers: offers(2.49, "ice-cubes-5lb-bag"),
      },
      {
        id: "thermometer",
        name: "Kitchen thermometer (digital)",
        quantity: "1",
        category: "kitchen",
        icon: "🌡️",
        offers: offers(9.99, "digital-kitchen-thermometer"),
      },
    ],
  },
  {
    id: "crystal-garden",
    title: "Crystal Garden",
    emoji: "💎",
    unit: "Unit 2: States of Matter & Solutions",
    category: "chemistry",
    difficulty: "medium",
    duration: 60,
    safetyTier: "yellow",
    description:
      "Grow a sparkling crystal forest on a string over several days by dissolving more salt or borax than water can normally hold, and letting the crystals form as the water evaporates.",
    scienceConcept:
      "A supersaturated solution holds more dissolved solute than is normally possible at room temperature. As the water evaporates, the solute can no longer stay dissolved and bonds back together in an orderly crystal lattice.",
    ngssStandard: "MS-PS1-4 — Develop a model that predicts changes in particle motion when matter changes state.",
    hypothesis: "If we let the supersaturated solution sit undisturbed for 3 days, then large crystals will grow on the string because as water evaporates, the dissolved ions rejoin into a solid lattice.",
    procedure: [
      "Boil 1 cup of water and pour it into a clean glass jar.",
      "Slowly stir in salt (or borax) one tablespoon at a time until no more dissolves — you've reached saturation.",
      "Tie a piece of cotton string to the middle of a pencil. Trim the string so it hangs into the solution without touching the bottom.",
      "Rest the pencil across the top of the jar so the string dangles in the solution.",
      "Place the jar somewhere undisturbed at room temperature.",
      "Check daily. After 24 hours you'll see tiny crystals; after 3-5 days you'll have a crystal cluster.",
      "Carefully lift the string out and let the crystals dry.",
    ],
    diagramSvg: CRYSTAL_GARDEN_SVG,
    diagramCaption: "Crystal garden setup. As water evaporates, dissolved Na⁺ and Cl⁻ ions join into a solid lattice along the string, forming a branching crystal cluster.",
    funFact: "Snowflakes form by the same process — water vapor in the air freezes onto a tiny dust particle and grows into a hexagonal lattice as more vapor sticks.",
    supplies: [
      {
        id: "borax",
        name: "20 Mule Team Borax (4 lb)",
        quantity: "1 box",
        category: "kitchen",
        icon: "📦",
        offers: offers(7.99, "20-mule-team-borax-4lb"),
      },
      {
        id: "glass-jar",
        name: "Tall glass jar (12 oz)",
        quantity: "1",
        category: "kitchen",
        icon: "🫙",
        offers: offers(3.49, "tall-glass-jar-12oz"),
      },
      {
        id: "cotton-string",
        name: "100% cotton kitchen string (200 ft)",
        quantity: "1 spool",
        category: "kitchen",
        icon: "🧶",
        offers: offers(4.49, "cotton-kitchen-string-200ft"),
      },
      {
        id: "pencils",
        name: "Ticonderoga #2 pencils (12 ct)",
        quantity: "1 pack",
        category: "stationery",
        icon: "✏️",
        offers: offers(3.99, "ticonderoga-pencils-12-pack"),
      },
      {
        id: "magnifier",
        name: "Carson handheld magnifier (5x)",
        quantity: "1",
        category: "stationery",
        icon: "🔍",
        offers: offers(8.99, "carson-handheld-magnifier-5x"),
      },
    ],
  },
  {
    id: "plant-growth-sunlight",
    title: "Plant Growth & Sunlight",
    emoji: "🌱",
    unit: "Unit 4: Living Things & Photosynthesis",
    category: "biology",
    difficulty: "easy",
    duration: 1440,
    safetyTier: "green",
    description:
      "Grow two identical bean seedlings — one in sunlight, one in a dark closet — and measure how light affects growth, color, and leaf size over 7-10 days.",
    scienceConcept:
      "Plants need light to drive photosynthesis: chlorophyll absorbs light energy and uses it to combine CO₂ and water into glucose and oxygen. Without light, plants can't produce chlorophyll and can't make their own food.",
    ngssStandard: "MS-LS1-6 — Construct a scientific explanation based on evidence for the role of photosynthesis.",
    hypothesis: "If a plant is kept in the dark, then it will grow tall and pale because it stretches toward any light and cannot make chlorophyll.",
    procedure: [
      "Soak 4 dry bean seeds in water overnight to soften the shell.",
      "Fill 2 small pots with potting soil and plant 2 seeds in each, ½ inch deep.",
      "Water both pots until soil is moist but not soaked.",
      "Place Pot A on a sunny windowsill. Place Pot B in a dark closet.",
      "Water both pots equally every other day.",
      "Each day, photograph both pots and measure stem height in cm.",
      "After 7-10 days, compare: height, leaf color, leaf size, sturdiness.",
    ],
    diagramSvg: PLANT_GROWTH_SVG,
    diagramCaption: "Side-by-side comparison: the sunlit plant grows green and sturdy with broad leaves; the plant in darkness grows tall and pale (etiolated) reaching for any light.",
    funFact: "The pale-and-stretched look of a dark-grown plant is called 'etiolation' — it's the plant's last-ditch effort to find sunlight before it runs out of stored energy.",
    supplies: [
      {
        id: "bean-seeds",
        name: "Lima bean seeds (organic, 50 ct)",
        quantity: "1 packet",
        category: "produce",
        icon: "🫘",
        offers: offers(3.49, "lima-bean-seeds-organic"),
      },
      {
        id: "potting-soil",
        name: "Miracle-Gro potting mix (8 qt)",
        quantity: "1 bag",
        category: "hardware",
        icon: "🪴",
        offers: offers(6.99, "miracle-gro-potting-mix-8qt"),
      },
      {
        id: "small-pots",
        name: "Small terracotta pots (4 in, 6 ct)",
        quantity: "1 set",
        category: "hardware",
        icon: "🏺",
        offers: offers(11.99, "small-terracotta-pots-4in-6pack"),
      },
      {
        id: "ruler",
        name: "Plastic ruler (12 inch)",
        quantity: "1",
        category: "stationery",
        icon: "📏",
        offers: offers(1.99, "plastic-ruler-12-inch"),
      },
      {
        id: "spray-bottle",
        name: "Spray bottle (16 oz)",
        quantity: "1",
        category: "hardware",
        icon: "🧴",
        offers: offers(3.49, "spray-bottle-16oz"),
      },
    ],
  },
];

// ---------- the canonical mock syllabus ----------

const MOCK_SYLLABUS: MockSyllabus = {
  id: "syl-mock-001",
  subject: "Integrated Physical & Life Science",
  gradeLevel: "6th Grade",
  teacher: "Ms. Marisol Chen",
  school: "Riverside Middle School",
  term: "Spring Semester 2026",
  rawSummary:
    "A hands-on, inquiry-driven introduction to physical and life science. Across five units, students will investigate matter and chemical reactions, states of matter, energy and electricity, photosynthesis and living systems, and Earth's weather and water systems. Every unit anchors abstract concepts in a take-home experiment students design, run, and reflect on in their lab notebook.",
  units: [
    {
      unitNumber: 1,
      title: "Matter & Chemical Reactions",
      topics: ["Atoms & molecules", "Acids & bases", "Conservation of mass", "Reaction rates"],
      standards: ["MS-PS1-1", "MS-PS1-2", "MS-PS1-5"],
      timeframe: "Weeks 1-3",
      experimentIds: ["erupting-volcano"],
    },
    {
      unitNumber: 2,
      title: "States of Matter & Solutions",
      topics: ["Solids, liquids, gases", "Dissolving & solubility", "Crystallization", "Mixtures vs. compounds"],
      standards: ["MS-PS1-4", "MS-PS1-3"],
      timeframe: "Weeks 4-6",
      experimentIds: ["crystal-garden"],
    },
    {
      unitNumber: 3,
      title: "Energy & Electricity",
      topics: ["Forms of energy", "Electric circuits", "Conservation of energy", "Energy transformations"],
      standards: ["MS-PS3-1", "MS-PS3-3", "MS-PS3-5"],
      timeframe: "Weeks 7-10",
      experimentIds: ["lemon-battery"],
    },
    {
      unitNumber: 4,
      title: "Living Things & Photosynthesis",
      topics: ["Cells & organelles", "Photosynthesis", "Cellular respiration", "Ecosystems"],
      standards: ["MS-LS1-6", "MS-LS1-7", "MS-LS2-3"],
      timeframe: "Weeks 11-13",
      experimentIds: ["plant-growth-sunlight"],
    },
    {
      unitNumber: 5,
      title: "Earth's Systems & Weather",
      topics: ["Water cycle", "Cloud formation", "Atmosphere", "Weather patterns"],
      standards: ["MS-ESS2-4", "MS-ESS2-5", "MS-ESS2-6"],
      timeframe: "Weeks 14-16",
      experimentIds: ["cloud-in-a-jar"],
    },
  ],
};

// ---------- multer (accepts ANY file, ignores it) ----------

const MOCK_UPLOAD_DIR = "/tmp/labbuddy-mock-uploads";
import fs from "node:fs";
if (!fs.existsSync(MOCK_UPLOAD_DIR)) {
  fs.mkdirSync(MOCK_UPLOAD_DIR, { recursive: true });
}
const mockUpload = multer({
  dest: MOCK_UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ---------- router ----------

export const mockLabRouter = Router();

// POST /api/mock-lab/upload
// Accepts ANY file (or no file at all) and returns the canonical mock syllabus.
mockLabRouter.post("/upload", mockUpload.any(), (req: Request, res: Response) => {
  // Echo back the filename if one was given, but always return the same syllabus.
  const uploaded = Array.isArray(req.files) ? req.files[0] : null;
  const echoFilename = uploaded?.originalname ?? req.body?.filename ?? "syllabus.pdf";

  // Clean up temp file
  if (uploaded?.path) {
    try { fs.unlinkSync(uploaded.path); } catch { /* ignore */ }
  }

  // Simulate a brief AI parsing delay so the UI can show its progress state
  setTimeout(() => {
    res.json({
      ok: true,
      filename: echoFilename,
      parsedAt: new Date().toISOString(),
      syllabus: MOCK_SYLLABUS,
      experimentSummaries: EXPERIMENTS.map((e) => ({
        id: e.id,
        title: e.title,
        emoji: e.emoji,
        unit: e.unit,
        category: e.category,
        difficulty: e.difficulty,
        duration: e.duration,
        safetyTier: e.safetyTier,
        description: e.description,
      })),
    });
  }, 700);
});

// GET /api/mock-lab/syllabus  — same payload, no upload needed
mockLabRouter.get("/syllabus", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    syllabus: MOCK_SYLLABUS,
    experimentSummaries: EXPERIMENTS.map((e) => ({
      id: e.id,
      title: e.title,
      emoji: e.emoji,
      unit: e.unit,
      category: e.category,
      difficulty: e.difficulty,
      duration: e.duration,
      safetyTier: e.safetyTier,
      description: e.description,
    })),
  });
});

// GET /api/mock-lab/experiments/:id
mockLabRouter.get("/experiments/:id", (req: Request, res: Response) => {
  const exp = EXPERIMENTS.find((e) => e.id === req.params.id);
  if (!exp) {
    res.status(404).json({ ok: false, error: "Experiment not found." });
    return;
  }
  res.json({ ok: true, experiment: exp });
});

// GET /api/mock-lab/cart-summary?ids=a,b,c&vendor=Walmart
// Optional helper that returns a per-vendor total for selected supplies.
mockLabRouter.get("/cart-summary", (req: Request, res: Response) => {
  const ids = String(req.query.ids ?? "").split(",").filter(Boolean);
  const vendor = String(req.query.vendor ?? "Walmart") as VendorOffer["vendor"];
  const allSupplies = EXPERIMENTS.flatMap((e) => e.supplies);
  const matched = allSupplies.filter((s) => ids.includes(s.id));

  let total = 0;
  for (const s of matched) {
    const offer = s.offers.find((o) => o.vendor === vendor);
    if (offer) total += offer.price;
  }
  res.json({
    ok: true,
    vendor,
    items: matched.length,
    subtotal: round2(total),
    estimatedTax: round2(total * 0.0825),
    estimatedShipping: vendor === "DoorDash" ? 4.99 : total > 35 ? 0 : 5.99,
    grandTotal: round2(total + total * 0.0825 + (vendor === "DoorDash" ? 4.99 : total > 35 ? 0 : 5.99)),
  });
});
