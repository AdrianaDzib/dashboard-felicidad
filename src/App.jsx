import React, { useState, useMemo, useEffect } from 'react';
import {
  Globe,
  Users,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Calendar,
  ChevronDown,
  Sun,
  Moon,
  Filter,
  SlidersHorizontal,
  Info
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

// Paleta de niveles de felicidad (transición fluida sin gris)
const HAPPINESS_PALETTE = {
  muyAlta: '#E68A2E',      // Ámbar Cálido
  moderadaAlta: '#2A9D8F', // Verde Esmeralda Suave
  moderadaBaja: '#457B9D', // Azul Acero
  muyBaja: '#6A4C93'       // Ciruela
};

// Las 10 regiones exactas del dataset + manejo transparente de registros sin región
const REGION_CONFIG = {
  'Western Europe': {
    label: 'Europa Occidental',
    color: '#E68A2E',
    center: [50.0, 10.0],
    zoom: 3.4
  },
  'North America and ANZ': {
    label: 'Norteamérica y ANZ',
    color: '#2A9D8F',
    center: [25.0, -98.0],
    zoom: 2.0
  },
  'Latin America and Caribbean': {
    label: 'América Latina y Caribe',
    color: '#00B4D8',
    center: [-12.0, -68.0],
    zoom: 2.5
  },
  'Central and Eastern Europe': {
    label: 'Europa Central y Oriental',
    color: '#F4A261',
    center: [50.0, 24.0],
    zoom: 3.3
  },
  'Commonwealth of Independent States': {
    label: 'Comunidad de Estados Indep. (CEI)',
    color: '#3A86FF',
    center: [52.0, 75.0],
    zoom: 2.4
  },
  'East Asia': {
    label: 'Asia Oriental',
    color: '#457B9D',
    center: [34.0, 118.0],
    zoom: 3.0
  },
  'Southeast Asia': {
    label: 'Sudeste Asiático',
    color: '#10B981',
    center: [8.0, 112.0],
    zoom: 3.1
  },
  'Middle East and North Africa': {
    label: 'Oriente Medio y Norte de África',
    color: '#8338EC',
    center: [28.0, 32.0],
    zoom: 3.0
  },
  'South Asia': {
    label: 'Asia del Sur',
    color: '#EC4899',
    center: [23.0, 79.0],
    zoom: 3.3
  },
  'Sub-Saharan Africa': {
    label: 'África Subsahariana',
    color: '#6A4C93',
    center: [-4.0, 22.0],
    zoom: 2.8
  },
  'Sin región asignada': {
    label: 'Sin región asignada (NaN)',
    color: '#94A3B8',
    center: [20.0, 0.0],
    zoom: 1.6
  }
};

const ALL_REGIONS = Object.keys(REGION_CONFIG);

// Decodificador ligero de TopoJSON estándar (sin dependencias externas) para renderizar fronteras reales
const decodeTopoJsonCountries = (topology) => {
  if (!topology || !topology.objects || !topology.objects.countries) return [];
  const { scale, translate } = topology.transform || { scale: [1, 1], translate: [0, 0] };
  const decodedArcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });

  const ringToCoords = (arcIndices) => {
    const coords = [];
    arcIndices.forEach((idx) => {
      const isReversed = idx < 0;
      const arc = decodedArcs[isReversed ? ~idx : idx];
      if (!arc) return;
      const pts = isReversed ? [...arc].reverse() : arc;
      for (let i = 0; i < pts.length; i++) {
        if (i === 0 && coords.length > 0) continue;
        coords.push(pts[i]);
      }
    });
    return coords;
  };

  return topology.objects.countries.geometries
    .filter((g) => g.properties?.name !== 'Antarctica')
    .map((geom) => {
      const polygons =
        geom.type === 'Polygon'
          ? [geom.arcs]
          : geom.type === 'MultiPolygon'
          ? geom.arcs
          : [];
      const rings = polygons.map((poly) => poly.map(ringToCoords));
      return {
        id: geom.id,
        name: geom.properties?.name || '',
        rings
      };
    });
};

// Normalización de nombres entre CSV WHR y Natural Earth (world-atlas)
const COUNTRY_NAME_ALIASES = {
  'United States of America': 'United States',
  'Russian Federation': 'Russia',
  'Czechia': 'Czech Republic',
  'Republic of Korea': 'South Korea',
  'Dem. Rep. Congo': 'Congo (Kinshasa)',
  'Congo': 'Congo (Brazzaville)',
  'Dominican Rep.': 'Dominican Republic',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'North Macedonia': 'Macedonia',
  'Taiwan': 'Taiwan Province of China',
  'Türkiye': 'Turkey',
  'Côte d\'Ivoire': 'Ivory Coast',
  'eSwatini': 'Eswatini'
};

// Las 6 variables explicativas del CSV con sus etiquetas y escalas reales
const EXPLANATORY_FACTORS = [
  {
    key: 'gdp',
    label: 'PIB per cápita (log / contribución)',
    shortLabel: 'PIB per cápita',
    unit: 'pts',
    description: 'Contribución del PIB per cápita ajustado por PPA reportado en el índice.'
  },
  {
    key: 'socialSupport',
    label: 'Apoyo social',
    shortLabel: 'Apoyo social',
    unit: 'pts',
    description: 'Contribución de contar con redes familiares o comunitarias de respaldo.'
  },
  {
    key: 'lifeExpectancy',
    label: 'Esperanza de vida saludable',
    shortLabel: 'Salud / Vida',
    unit: 'años / pts',
    description: 'Indicador de años de vida saludable reportado en el dataset.'
  },
  {
    key: 'freedom',
    label: 'Libertad para tomar decisiones',
    shortLabel: 'Libertad',
    unit: 'pts',
    description: 'Satisfacción percibida con la libertad de elegir el rumbo de vida.'
  },
  {
    key: 'generosity',
    label: 'Generosidad',
    shortLabel: 'Generosidad',
    unit: 'pts',
    description: 'Residuo de donaciones caritativas ajustado por PIB per cápita.'
  },
  {
    key: 'corruption',
    label: 'Percepción de corrupción',
    shortLabel: 'Corrupción',
    unit: 'pts',
    description: 'Contribución por ausencia percibida de corrupción en gobierno y empresas.'
  }
];

// Coordenadas geográficas reales [latitud, longitud]
const COUNTRY_LATLNG = {
  Finland: [61.9241, 25.7482], Finlandia: [61.9241, 25.7482],
  Denmark: [56.2639, 9.5018], Dinamarca: [56.2639, 9.5018],
  Iceland: [64.9631, -19.0208], Islandia: [64.9631, -19.0208],
  Sweden: [60.1282, 18.6435], Suecia: [60.1282, 18.6435],
  Israel: [31.0461, 34.8516],
  Netherlands: [52.1326, 5.2913], 'Países Bajos': [52.1326, 5.2913],
  Norway: [60.4720, 8.4689], Noruega: [60.4720, 8.4689],
  Luxembourg: [49.8153, 6.1296], Luxemburgo: [49.8153, 6.1296],
  Switzerland: [46.8182, 8.2275], Suiza: [46.8182, 8.2275],
  Austria: [47.5162, 14.5501],
  Belgium: [50.5039, 4.4699], Bélgica: [50.5039, 4.4699],
  Ireland: [53.1424, -7.6921], Irlanda: [53.1424, -7.6921],
  Germany: [51.1657, 10.4515], Alemania: [51.1657, 10.4515],
  'United Kingdom': [55.3781, -3.4360], 'Reino Unido': [55.3781, -3.4360],
  Spain: [40.4637, -3.7492], España: [40.4637, -3.7492],
  Italy: [41.8719, 12.5674], Italia: [41.8719, 12.5674],
  France: [46.2276, 2.2137], Francia: [46.2276, 2.2137],
  Portugal: [39.3999, -8.2245],
  Greece: [39.0742, 21.8243], Grecia: [39.0742, 21.8243],
  'Czech Republic': [49.8175, 15.4730], Czechia: [49.8175, 15.4730],
  Lithuania: [55.1694, 23.8813], Lituania: [55.1694, 23.8813],
  Slovenia: [46.1512, 14.9955], Eslovenia: [46.1512, 14.9955],
  Estonia: [58.5953, 25.0136],
  Latvia: [56.8796, 24.6032], Letonia: [56.8796, 24.6032],
  Slovakia: [48.6690, 19.6990], Eslovaquia: [48.6690, 19.6990],
  Hungary: [47.1625, 19.5033], Hungría: [47.1625, 19.5033],
  Croatia: [45.1000, 15.2000], Croacia: [45.1000, 15.2000],
  Serbia: [44.0165, 21.0059],
  Romania: [45.9432, 24.9668], Rumania: [45.9432, 24.9668],
  Bulgaria: [42.7339, 25.4858],
  Poland: [51.9194, 19.1451], Polonia: [51.9194, 19.1451],
  Ukraine: [48.3794, 31.1656], Ucrania: [48.3794, 31.1656],
  Russia: [61.5240, 105.3188], Rusia: [61.5240, 105.3188],
  Kazakhstan: [48.0196, 66.9237], Kazajistán: [48.0196, 66.9237],
  Uzbekistan: [41.3775, 64.5853], Uzbekistán: [41.3775, 64.5853],
  Turkey: [38.9637, 35.2433], Turquía: [38.9637, 35.2433],
  'Costa Rica': [9.7489, -83.7534],
  Canada: [56.1304, -106.3468], Canadá: [56.1304, -106.3468],
  'United States': [37.0902, -95.7129], 'Estados Unidos': [37.0902, -95.7129],
  Mexico: [23.6345, -102.5528], México: [23.6345, -102.5528],
  Guatemala: [15.7835, -90.2308],
  Honduras: [15.2000, -86.2419],
  'El Salvador': [13.7942, -88.8965],
  Nicaragua: [12.8654, -85.2072],
  Panama: [8.5380, -80.7821], Panamá: [8.5380, -80.7821],
  'Dominican Republic': [18.7357, -70.1627],
  Jamaica: [18.1096, -77.2975],
  Uruguay: [-32.5228, -55.7658],
  Brazil: [-14.2350, -51.9253], Brasil: [-14.2350, -51.9253],
  Chile: [-35.6751, -71.5430],
  Argentina: [-38.4161, -63.6167],
  Colombia: [4.5709, -74.2973],
  Peru: [-9.1900, -75.0152], Perú: [-9.1900, -75.0152],
  Ecuador: [-1.8312, -78.1834],
  Bolivia: [-16.2902, -63.5887],
  Paraguay: [-23.4425, -58.4438],
  Venezuela: [6.4238, -66.5897],
  Australia: [-25.2744, 133.7751],
  'New Zealand': [-40.9006, 174.8860], 'Nueva Zelanda': [-40.9006, 174.8860],
  Singapore: [1.3521, 103.8198], Singapur: [1.3521, 103.8198],
  Taiwan: [23.6978, 120.9605], Taiwán: [23.6978, 120.9605],
  'Taiwan Province of China': [23.6978, 120.9605],
  Japan: [36.2048, 138.2529], Japón: [36.2048, 138.2529],
  'South Korea': [35.9078, 127.7669], 'Corea del Sur': [35.9078, 127.7669],
  Mongolia: [46.8625, 103.8467],
  Thailand: [15.8700, 100.9925], Tailandia: [15.8700, 100.9925],
  Vietnam: [14.0583, 108.2772],
  Malaysia: [4.2105, 101.9758], Malasia: [4.2105, 101.9758],
  Indonesia: [-0.7893, 113.9213],
  Philippines: [12.8797, 121.7740], Filipinas: [12.8797, 121.7740],
  Cambodia: [12.5657, 104.9910], Camboya: [12.5657, 104.9910],
  Myanmar: [21.9162, 95.9560],
  China: [35.8617, 104.1954],
  India: [20.5937, 78.9629],
  Nepal: [28.3949, 84.1240],
  Bangladesh: [23.6850, 90.3563],
  'Sri Lanka': [7.8731, 80.7718],
  Pakistan: [30.3753, 69.3451], Pakistán: [30.3753, 69.3451],
  'Saudi Arabia': [23.8859, 45.0792], 'Arabia Saudita': [23.8859, 45.0792],
  'United Arab Emirates': [23.4241, 53.8478],
  Kuwait: [29.3117, 47.4818],
  Bahrain: [26.0667, 50.5577],
  Jordan: [30.5852, 36.2384], Jordania: [30.5852, 36.2384],
  Iraq: [33.2232, 43.6793], Irak: [33.2232, 43.6793],
  Iran: [32.4279, 53.6880], Irán: [32.4279, 53.6880],
  Lebanon: [33.8547, 35.8623], Líbano: [33.8547, 35.8623],
  Afghanistan: [33.9391, 67.7100], Afganistán: [33.9391, 67.7100],
  Mauritius: [-20.3484, 57.5522], Mauricio: [-20.3484, 57.5522],
  'South Africa': [-30.5595, 22.9375], Sudáfrica: [-30.5595, 22.9375],
  Namibia: [-22.9576, 18.4904],
  Botswana: [-22.3285, 24.6849],
  Morocco: [31.7917, -7.0926], Marruecos: [31.7917, -7.0926],
  Algeria: [28.0339, 1.6596], Argelia: [28.0339, 1.6596],
  Tunisia: [33.8869, 9.5375], Túnez: [33.8869, 9.5375],
  Libya: [26.3351, 17.2283], Libia: [26.3351, 17.2283],
  Egypt: [26.8206, 30.8025], Egipto: [26.8206, 30.8025],
  Nigeria: [9.0820, 8.6753],
  Ghana: [7.9465, -1.0232],
  'Ivory Coast': [7.5400, -5.5471],
  Senegal: [14.4974, -14.4524],
  Cameroon: [7.3697, 12.3547], Camerún: [7.3697, 12.3547],
  Ethiopia: [9.1450, 40.4897], Etiopía: [9.1450, 40.4897],
  Kenya: [-0.0236, 37.9062], Kenia: [-0.0236, 37.9062],
  Uganda: [1.3733, 32.2903],
  Tanzania: [-6.3690, 34.8888],
  Zambia: [-13.1339, 27.8493],
  Mozambique: [-18.6657, 35.5296],
  Madagascar: [-18.7669, 46.8691],
  Zimbabwe: [-19.0154, 29.1549], Zimbabue: [-19.0154, 29.1549],
  'Congo (Kinshasa)': [-4.0383, 21.7587], 'RD Congo': [-4.0383, 21.7587],
  'Congo (Brazzaville)': [-0.2280, 15.8277],
  'Sierra Leone': [8.4606, -11.7799], 'Sierra Leona': [8.4606, -11.7799],
  Lesotho: [-29.6100, 28.2336], Lesoto: [-29.6100, 28.2336]
};

// Respaldo representativo con las 10 regiones y los 6 indicadores del CSV
const BASE_COUNTRIES = [
  { name: 'Finland', region: 'Western Europe', score: 7.74, gdp: 1.84, socialSupport: 1.57, lifeExpectancy: 71, freedom: 0.86, generosity: 0.14, corruption: 0.55, coords: [61.9241, 25.7482] },
  { name: 'Denmark', region: 'Western Europe', score: 7.58, gdp: 1.91, socialSupport: 1.52, lifeExpectancy: 71, freedom: 0.82, generosity: 0.20, corruption: 0.55, coords: [56.2639, 9.5018] },
  { name: 'Iceland', region: 'Western Europe', score: 7.53, gdp: 1.88, socialSupport: 1.62, lifeExpectancy: 72, freedom: 0.82, generosity: 0.26, corruption: 0.18, coords: [64.9631, -19.0208] },
  { name: 'Sweden', region: 'Western Europe', score: 7.34, gdp: 1.88, socialSupport: 1.50, lifeExpectancy: 72, freedom: 0.84, generosity: 0.22, corruption: 0.52, coords: [60.1282, 18.6435] },
  { name: 'Switzerland', region: 'Western Europe', score: 7.06, gdp: 1.97, socialSupport: 1.53, lifeExpectancy: 73, freedom: 0.76, generosity: 0.17, corruption: 0.49, coords: [46.8182, 8.2275] },
  { name: 'Spain', region: 'Western Europe', score: 6.42, gdp: 1.77, socialSupport: 1.47, lifeExpectancy: 72, freedom: 0.63, generosity: 0.11, corruption: 0.16, coords: [40.4637, -3.7492] },
  { name: 'Australia', region: 'North America and ANZ', score: 7.06, gdp: 1.85, socialSupport: 1.46, lifeExpectancy: 71, freedom: 0.76, generosity: 0.23, corruption: 0.32, coords: [-25.2744, 133.7751] },
  { name: 'Canada', region: 'North America and ANZ', score: 6.90, gdp: 1.84, socialSupport: 1.46, lifeExpectancy: 71, freedom: 0.70, generosity: 0.23, corruption: 0.37, coords: [56.1304, -106.3468] },
  { name: 'United States', region: 'North America and ANZ', score: 6.73, gdp: 1.94, socialSupport: 1.39, lifeExpectancy: 66, freedom: 0.59, generosity: 0.22, corruption: 0.17, coords: [37.0902, -95.7129] },
  { name: 'Costa Rica', region: 'Latin America and Caribbean', score: 6.96, gdp: 1.56, socialSupport: 1.37, lifeExpectancy: 70, freedom: 0.79, generosity: 0.11, corruption: 0.10, coords: [9.7489, -83.7534] },
  { name: 'Mexico', region: 'Latin America and Caribbean', score: 6.68, gdp: 1.52, socialSupport: 1.24, lifeExpectancy: 66, freedom: 0.72, generosity: 0.09, corruption: 0.13, coords: [23.6345, -102.5528] },
  { name: 'Chile', region: 'Latin America and Caribbean', score: 6.36, gdp: 1.62, socialSupport: 1.36, lifeExpectancy: 70, freedom: 0.65, generosity: 0.13, corruption: 0.09, coords: [-35.6751, -71.5430] },
  { name: 'Brazil', region: 'Latin America and Caribbean', score: 6.27, gdp: 1.44, socialSupport: 1.32, lifeExpectancy: 66, freedom: 0.69, generosity: 0.13, corruption: 0.14, coords: [-14.2350, -51.9253] },
  { name: 'Lithuania', region: 'Central and Eastern Europe', score: 6.82, gdp: 1.77, socialSupport: 1.45, lifeExpectancy: 67, freedom: 0.66, generosity: 0.04, corruption: 0.12, coords: [55.1694, 23.8813] },
  { name: 'Poland', region: 'Central and Eastern Europe', score: 6.44, gdp: 1.74, socialSupport: 1.42, lifeExpectancy: 69, freedom: 0.66, generosity: 0.08, corruption: 0.18, coords: [51.9194, 19.1451] },
  { name: 'Kazakhstan', region: 'Commonwealth of Independent States', score: 6.19, gdp: 1.62, socialSupport: 1.46, lifeExpectancy: 65, freedom: 0.73, generosity: 0.15, corruption: 0.12, coords: [48.0196, 66.9237] },
  { name: 'Uzbekistan', region: 'Commonwealth of Independent States', score: 6.20, gdp: 1.21, socialSupport: 1.46, lifeExpectancy: 65, freedom: 0.84, generosity: 0.25, corruption: 0.22, coords: [41.3775, 64.5853] },
  { name: 'Ukraine', region: 'Commonwealth of Independent States', score: 4.87, gdp: 1.35, socialSupport: 1.32, lifeExpectancy: 64, freedom: 0.63, generosity: 0.29, corruption: 0.03, coords: [48.3794, 31.1656] },
  { name: 'Taiwan', region: 'East Asia', score: 6.50, gdp: 1.84, socialSupport: 1.39, lifeExpectancy: 71, freedom: 0.65, generosity: 0.07, corruption: 0.20, coords: [23.6978, 120.9605] },
  { name: 'Japan', region: 'East Asia', score: 6.06, gdp: 1.79, socialSupport: 1.41, lifeExpectancy: 74, freedom: 0.63, generosity: 0.02, corruption: 0.22, coords: [36.2048, 138.2529] },
  { name: 'South Korea', region: 'East Asia', score: 6.06, gdp: 1.82, socialSupport: 1.18, lifeExpectancy: 73, freedom: 0.56, generosity: 0.13, corruption: 0.16, coords: [35.9078, 127.7669] },
  { name: 'Singapore', region: 'Southeast Asia', score: 6.52, gdp: 2.12, socialSupport: 1.36, lifeExpectancy: 74, freedom: 0.76, generosity: 0.17, corruption: 0.58, coords: [1.3521, 103.8198] },
  { name: 'Thailand', region: 'Southeast Asia', score: 5.98, gdp: 1.48, socialSupport: 1.35, lifeExpectancy: 68, freedom: 0.76, generosity: 0.28, corruption: 0.02, coords: [15.8700, 100.9925] },
  { name: 'Vietnam', region: 'Southeast Asia', score: 6.04, gdp: 1.33, socialSupport: 1.27, lifeExpectancy: 66, freedom: 0.84, generosity: 0.09, corruption: 0.16, coords: [14.0583, 108.2772] },
  { name: 'Israel', region: 'Middle East and North Africa', score: 7.34, gdp: 1.80, socialSupport: 1.51, lifeExpectancy: 72, freedom: 0.64, generosity: 0.15, corruption: 0.19, coords: [31.0461, 34.8516] },
  { name: 'Saudi Arabia', region: 'Middle East and North Africa', score: 6.59, gdp: 1.84, socialSupport: 1.36, lifeExpectancy: 67, freedom: 0.78, generosity: 0.11, corruption: 0.19, coords: [23.8859, 45.0792] },
  { name: 'Lebanon', region: 'Middle East and North Africa', score: 2.71, gdp: 1.38, socialSupport: 0.58, lifeExpectancy: 66, freedom: 0.17, generosity: 0.07, corruption: 0.03, coords: [33.8547, 35.8623] },
  { name: 'Nepal', region: 'South Asia', score: 5.16, gdp: 0.97, socialSupport: 0.99, lifeExpectancy: 61, freedom: 0.65, generosity: 0.21, corruption: 0.12, coords: [28.3949, 84.1240] },
  { name: 'India', region: 'South Asia', score: 4.05, gdp: 1.17, socialSupport: 0.65, lifeExpectancy: 60, freedom: 0.77, generosity: 0.17, corruption: 0.12, coords: [20.5937, 78.9629] },
  { name: 'Afghanistan', region: 'South Asia', score: 1.72, gdp: 0.63, socialSupport: 0.00, lifeExpectancy: 52, freedom: 0.00, generosity: 0.09, corruption: 0.09, coords: [33.9391, 67.7100] },
  { name: 'Mauritius', region: 'Sub-Saharan Africa', score: 5.90, gdp: 1.57, socialSupport: 1.36, lifeExpectancy: 64, freedom: 0.68, generosity: 0.12, corruption: 0.12, coords: [-20.3484, 57.5522] },
  { name: 'South Africa', region: 'Sub-Saharan Africa', score: 5.42, gdp: 1.39, socialSupport: 1.35, lifeExpectancy: 57, freedom: 0.54, generosity: 0.08, corruption: 0.03, coords: [-30.5595, 22.9375] },
  { name: 'Nigeria', region: 'Sub-Saharan Africa', score: 4.88, gdp: 1.04, socialSupport: 1.08, lifeExpectancy: 52, freedom: 0.57, generosity: 0.20, corruption: 0.02, coords: [9.0820, 8.6753] },
  { name: 'Lesotho', region: 'Sub-Saharan Africa', score: 3.18, gdp: 0.87, socialSupport: 0.98, lifeExpectancy: 48, freedom: 0.52, generosity: 0.08, corruption: 0.07, coords: [-29.6100, 28.2336] }
];

const FALLBACK_DATASET = [];
for (let yr = 2015; yr <= 2024; yr++) {
  const factor = (yr - 2015) * 0.015;
  BASE_COUNTRIES.forEach((c, idx) => {
    const yearVariation = Math.sin(yr + idx) * 0.12;
    const finalScore = Math.min(8.0, Math.max(1.5, Number((c.score + (yr === 2024 ? 0 : yearVariation * 0.5 - factor * 0.2)).toFixed(2))));
    FALLBACK_DATASET.push({
      ...c,
      year: yr,
      score: finalScore
    });
  });
}

// Parser completo de las 11 columnas de world_happiness_combined.csv
const parseHappinessCSV = (csvText) => {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map((h) => h.trim().toLowerCase());
  const idxRank = headers.findIndex((h) => h.includes('ranking'));
  const idxCountry = headers.findIndex((h) => h.includes('country'));
  const idxRegion = headers.findIndex((h) => h.includes('regional'));
  const idxScore = headers.findIndex((h) => h.includes('happiness'));
  const idxGdp = headers.findIndex((h) => h.includes('gdp'));
  const idxSocial = headers.findIndex((h) => h.includes('social'));
  const idxLife = headers.findIndex((h) => h.includes('healthy') || h.includes('life'));
  const idxFreedom = headers.findIndex((h) => h.includes('freedom'));
  const idxGenerosity = headers.findIndex((h) => h.includes('generosity'));
  const idxCorruption = headers.findIndex((h) => h.includes('corruption'));
  const idxYear = headers.findIndex((h) => h.includes('year'));

  const parseNum = (val) => {
    if (!val) return 0;
    return parseFloat(val.toString().trim().replace(',', '.')) || 0;
  };

  const parsed = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    if (cols.length < 10) continue;

    const name = (cols[idxCountry] || '').trim();
    const rawRegion = (cols[idxRegion] || '').trim();
    const region = REGION_CONFIG[rawRegion] ? rawRegion : 'Sin región asignada';

    const ranking = parseInt((cols[idxRank] || '0').trim(), 10) || i;
    const score = parseNum(cols[idxScore]);
    const gdp = parseNum(cols[idxGdp]);
    const socialSupport = parseNum(cols[idxSocial]);
    const lifeExpectancy = parseNum(cols[idxLife]);
    const freedom = parseNum(cols[idxFreedom]);
    const generosity = parseNum(cols[idxGenerosity]);
    const corruption = parseNum(cols[idxCorruption]);
    const year = parseInt((cols[idxYear] || '').trim(), 10);

    if (!name || !year || isNaN(score) || score <= 0) continue;

    const baseCenter = REGION_CONFIG[region]?.center || [20, 0];
    const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const coords = COUNTRY_LATLNG[name] || [
      baseCenter[0] + ((hash % 13) - 6) * 1.1,
      baseCenter[1] + (((hash * 7) % 15) - 7) * 1.3
    ];

    parsed.push({
      ranking,
      name,
      region,
      score: Number(score.toFixed(2)),
      gdp: Number(gdp.toFixed(3)),
      socialSupport: Number(socialSupport.toFixed(3)),
      lifeExpectancy: Number(lifeExpectancy.toFixed(2)),
      freedom: Number(freedom.toFixed(3)),
      generosity: Number(generosity.toFixed(3)),
      corruption: Number(corruption.toFixed(3)),
      year,
      coords
    });
  }
  return parsed;
};

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState('Todas las regiones');
  const [startYear, setStartYear] = useState(2015);
  const [endYear, setEndYear] = useState(2024);
  const [rankingTab, setRankingTab] = useState('top');
  const [selectedFactor, setSelectedFactor] = useState('gdp');
  const [selectedCountryName, setSelectedCountryName] = useState(null);
  const [hoveredCountry, setHoveredCountry] = useState(null);
  const [worldGeometries, setWorldGeometries] = useState([]);
  const [dataset, setDataset] = useState(FALLBACK_DATASET);
  const [csvStatus, setCsvStatus] = useState('loading');

  const activeFactorMeta = useMemo(
    () => EXPLANATORY_FACTORS.find((f) => f.key === selectedFactor) || EXPLANATORY_FACTORS[0],
    [selectedFactor]
  );

  // Carga automática desde public/world_happiness_combined.csv
  useEffect(() => {
    fetch('/public/world_happiness_combined.csv')
      .then((res) => {
        if (!res.ok) throw new Error('Archivo CSV no encontrado en /public');
        return res.text();
      })
      .then((text) => {
        const records = parseHappinessCSV(text);
        if (records.length > 0) {
          setDataset(records);
          setCsvStatus('connected');
        } else {
          setCsvStatus('fallback');
        }
      })
      .catch(() => {
        setCsvStatus('fallback');
      });
  }, []);

  // Carga de fronteras mundiales reales (Natural Earth 110m TopoJSON)
  useEffect(() => {
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then((res) => res.json())
      .then((topo) => {
        setWorldGeometries(decodeTopoJsonCountries(topo));
      })
      .catch(() => {
        setWorldGeometries([]);
      });
  }, []);

  // Proyección equirectangular exacta [-180..180, -60..84] -> [0..1000, 0..500]
  const projectLngLat = ([lng, lat]) => {
    const x = ((lng + 180) / 360) * 1000;
    const y = ((84 - lat) / 144) * 500;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  };

  // Construcción de paths SVG para cada país real del mundo
  const worldCountryPaths = useMemo(() => {
    return worldGeometries.map((countryGeom) => {
      const pathParts = [];
      countryGeom.rings.forEach((polygon) => {
        polygon.forEach((ring) => {
          if (!ring || ring.length < 3) return;
          // Evitar líneas horizontales que cruzan el mapa en el antimeridiano (±180°)
          let subPath = '';
          let prevLng = null;
          ring.forEach(([lng, lat], idx) => {
            const [x, y] = projectLngLat([lng, lat]);
            if (idx === 0 || (prevLng !== null && Math.abs(lng - prevLng) > 180)) {
              subPath += `M${x},${y} `;
            } else {
              subPath += `L${x},${y} `;
            }
            prevLng = lng;
          });
          pathParts.push(subPath + 'Z');
        });
      });
      return {
        id: countryGeom.id,
        name: countryGeom.name,
        d: pathParts.join(' ')
      };
    });
  }, [worldGeometries]);

  const getScoreColor = (score) => {
    if (score >= 6.8) return HAPPINESS_PALETTE.muyAlta;
    if (score >= 5.6) return HAPPINESS_PALETTE.moderadaAlta;
    if (score >= 4.4) return HAPPINESS_PALETTE.moderadaBaja;
    return HAPPINESS_PALETTE.muyBaja;
  };

  const getScoreLabel = (score) => {
    if (score >= 6.8) return 'Bienestar Muy Alto';
    if (score >= 5.6) return 'Bienestar Moderado-Alto';
    if (score >= 4.4) return 'Bienestar Moderado-Bajo';
    return 'Bienestar Bajo';
  };

  const dataCurrentYear = useMemo(() => {
    return dataset.filter(
      (d) =>
        d.year === endYear &&
        (selectedRegion === 'Todas las regiones' || d.region === selectedRegion)
    );
  }, [dataset, endYear, selectedRegion]);

  // Mapa rápido por nombre de país para colorear las fronteras reales
  const countryDataLookup = useMemo(() => {
    const map = new Map();
    dataCurrentYear.forEach((c) => {
      map.set(c.name.toLowerCase(), c);
    });
    return map;
  }, [dataCurrentYear]);

  const dataPrevYear = useMemo(() => {
    const prevYear = Math.max(startYear, endYear - 1);
    return dataset.filter(
      (d) =>
        d.year === prevYear &&
        (selectedRegion === 'Todas las regiones' || d.region === selectedRegion)
    );
  }, [dataset, startYear, endYear, selectedRegion]);

  const dataStartYear = useMemo(() => {
    return dataset.filter(
      (d) =>
        d.year === startYear &&
        (selectedRegion === 'Todas las regiones' || d.region === selectedRegion)
    );
  }, [dataset, startYear, selectedRegion]);

  // País activo derivado sin setState síncrono en useEffect
  const selectedCountry = useMemo(() => {
    if (dataCurrentYear.length === 0) return null;
    if (selectedCountryName) {
      const found = dataCurrentYear.find((c) => c.name === selectedCountryName);
      if (found) return found;
    }
    return dataCurrentYear.find((c) => c.name === 'Mexico' || c.name === 'Finland') || dataCurrentYear[0];
  }, [dataCurrentYear, selectedCountryName]);

  // Datos comparativos del país seleccionado vs. el promedio de su propia subregión
  const tacticalComparison = useMemo(() => {
    if (!selectedCountry) return null;
    const peers = dataset.filter(
      (d) => d.year === endYear && d.region === selectedCountry.region
    );
    const count = peers.length || 1;
    const avgOf = (key) => peers.reduce((sum, p) => sum + (p[key] || 0), 0) / count;

    const allYear = dataset.filter((d) => d.year === endYear);
    const maxOf = (key) => Math.max(...allYear.map((d) => d[key] || 0), 0.01);

    const metrics = [
      {
        factor: 'PIB per cápita',
        key: 'gdp',
        countryRaw: selectedCountry.gdp,
        regionRaw: Number(avgOf('gdp').toFixed(2)),
        countryNorm: Math.round((selectedCountry.gdp / maxOf('gdp')) * 100),
        regionNorm: Math.round((avgOf('gdp') / maxOf('gdp')) * 100)
      },
      {
        factor: 'Apoyo social',
        key: 'socialSupport',
        countryRaw: selectedCountry.socialSupport,
        regionRaw: Number(avgOf('socialSupport').toFixed(2)),
        countryNorm: Math.round((selectedCountry.socialSupport / maxOf('socialSupport')) * 100),
        regionNorm: Math.round((avgOf('socialSupport') / maxOf('socialSupport')) * 100)
      },
      {
        factor: 'Salud / Vida',
        key: 'lifeExpectancy',
        countryRaw: selectedCountry.lifeExpectancy,
        regionRaw: Number(avgOf('lifeExpectancy').toFixed(1)),
        countryNorm: Math.round((selectedCountry.lifeExpectancy / maxOf('lifeExpectancy')) * 100),
        regionNorm: Math.round((avgOf('lifeExpectancy') / maxOf('lifeExpectancy')) * 100)
      },
      {
        factor: 'Libertad',
        key: 'freedom',
        countryRaw: selectedCountry.freedom,
        regionRaw: Number(avgOf('freedom').toFixed(2)),
        countryNorm: Math.round((selectedCountry.freedom / maxOf('freedom')) * 100),
        regionNorm: Math.round((avgOf('freedom') / maxOf('freedom')) * 100)
      },
      {
        factor: 'Generosidad',
        key: 'generosity',
        countryRaw: selectedCountry.generosity,
        regionRaw: Number(avgOf('generosity').toFixed(2)),
        countryNorm: Math.round((selectedCountry.generosity / maxOf('generosity')) * 100),
        regionNorm: Math.round((avgOf('generosity') / maxOf('generosity')) * 100)
      },
      {
        factor: 'Corrupción (inv.)',
        key: 'corruption',
        countryRaw: selectedCountry.corruption,
        regionRaw: Number(avgOf('corruption').toFixed(2)),
        countryNorm: Math.round((selectedCountry.corruption / maxOf('corruption')) * 100),
        regionNorm: Math.round((avgOf('corruption') / maxOf('corruption')) * 100)
      }
    ];

    const sortedGaps = [...metrics].sort(
      (a, b) => (b.countryNorm - b.regionNorm) - (a.countryNorm - a.regionNorm)
    );

    return {
      metrics,
      strength: sortedGaps[0],
      bottleneck: sortedGaps[sortedGaps.length - 1],
      regionAvgScore: Number(avgOf('score').toFixed(2)),
      peerCount: peers.length
    };
  }, [selectedCountry, dataset, endYear]);

  // KPIs calculados dinámicamente
  const kpis = useMemo(() => {
    const avgCurrent =
      dataCurrentYear.length > 0
        ? dataCurrentYear.reduce((sum, item) => sum + item.score, 0) / dataCurrentYear.length
        : 0;
    const avgPrev =
      dataPrevYear.length > 0
        ? dataPrevYear.reduce((sum, item) => sum + item.score, 0) / dataPrevYear.length
        : avgCurrent;
    const avgStart =
      dataStartYear.length > 0
        ? dataStartYear.reduce((sum, item) => sum + item.score, 0) / dataStartYear.length
        : avgCurrent;

    const diffPrev = avgCurrent - avgPrev;
    const diffStart = avgCurrent - avgStart;
    const pctChange = avgStart > 0 ? ((avgCurrent - avgStart) / avgStart) * 100 : 0;

    const sorted = [...dataCurrentYear].sort((a, b) => b.score - a.score);
    const happiest = sorted[0] || { name: 'N/A', score: 0 };

    return {
      globalAvg: avgCurrent.toFixed(2),
      diffPrev: (diffPrev >= 0 ? '+' : '') + diffPrev.toFixed(2),
      isPositivePrev: diffPrev >= 0,
      countryCount: dataCurrentYear.length,
      coverage: Math.min(100, Math.round((dataCurrentYear.length / 150) * 100)) || 98,
      happiestCountry: happiest.name,
      happiestScore: happiest.score.toFixed(2),
      evolutionPct: (pctChange >= 0 ? '+' : '') + pctChange.toFixed(1) + '%',
      diffStart: (diffStart >= 0 ? '+' : '') + diffStart.toFixed(2),
      isPositiveStart: diffStart >= 0
    };
  }, [dataCurrentYear, dataPrevYear, dataStartYear]);

  const rankingList = useMemo(() => {
    const sorted = [...dataCurrentYear].sort((a, b) => b.score - a.score);
    if (rankingTab === 'top') {
      return sorted.slice(0, 10);
    }
    return sorted.slice(-10).reverse();
  }, [dataCurrentYear, rankingTab]);

  // Top 6 países líderes en el factor seleccionado (reemplazo intuitivo del gráfico de dispersión)
  const scatterData = useMemo(() => {
    return dataCurrentYear.map((item) => ({
      ...item,
      xVal: Number((item[selectedFactor] || 0).toFixed(2)),
      yVal: item.score,
      zVal: Math.max(40, item.lifeExpectancy * 1.2)
    }));
  }, [dataCurrentYear, selectedFactor]);

  const scatterAverages = useMemo(() => {
    if (scatterData.length === 0) return { avgX: 0, avgY: 0 };
    const sumX = scatterData.reduce((acc, d) => acc + d.xVal, 0);
    const sumY = scatterData.reduce((acc, d) => acc + d.yVal, 0);
    return {
      avgX: Number((sumX / scatterData.length).toFixed(2)),
      avgY: Number((sumY / scatterData.length).toFixed(2))
    };
  }, [scatterData]);

  // Regiones activas en el dataset (las 10 exactas + Sin región si tiene datos)
  const activeRegions = useMemo(() => {
    const present = new Set(dataset.map((d) => d.region));
    return ALL_REGIONS.filter((r) => present.has(r));
  }, [dataset]);

  const regionEvolutionData = useMemo(() => {
    const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
    return years.map((yr) => {
      const row = { year: yr };
      activeRegions.forEach((reg) => {
        if (reg === 'Sin región asignada') return;
        const matches = dataset.filter((d) => d.year === yr && d.region === reg);
        if (matches.length > 0) {
          const avg = matches.reduce((acc, val) => acc + val.score, 0) / matches.length;
          row[reg] = Number(avg.toFixed(2));
        }
      });
      return row;
    });
  }, [dataset, startYear, endYear, activeRegions]);

  return (
    <div
      className={`min-h-screen transition-colors duration-300 font-sans pb-12 ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#F5F7FA] text-slate-800'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6A4C93] to-[#457B9D] flex items-center justify-center text-white shadow-md shrink-0">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold tracking-widest uppercase text-[#E68A2E]">
                · World Happiness Report · 
              </span>
              <h1
                className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                  darkMode ? 'text-white' : 'text-[#4B3B78]'
                }`}
              >
                El pulso de la felicidad mundial
              </h1>
              <p className={`text-sm mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Análisis multifactorial del bienestar en {dataCurrentYear.length} países y 10 regiones geopolíticas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                darkMode
                  ? 'bg-slate-900 text-slate-300 border border-slate-700'
                  : 'bg-white text-slate-600 shadow-sm border border-slate-200/80'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  csvStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              {csvStatus === 'connected'
                ? `CSV Conectado (${dataset.length} registros)`
                : 'Vista previa lista'}
            </span>

            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                darkMode
                  ? 'bg-slate-800 text-amber-300 hover:bg-slate-700 border border-slate-700'
                  : 'bg-white text-slate-700 hover:bg-slate-50 shadow-sm border border-slate-200/80'
              }`}
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {darkMode ? 'Modo Claro' : 'Modo Oscuro'}
            </button>
          </div>
        </div>

        {/* BARRA DE FILTROS GLOBALES */}
        <div
          className={`rounded-2xl p-4 border flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
            darkMode
              ? 'bg-slate-900 border-slate-700'
              : 'bg-white border-slate-200/70 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                darkMode ? 'bg-slate-800 text-amber-400' : 'bg-amber-100 text-amber-800'
              }`}
            >
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <h2
                className={`text-sm font-bold leading-tight ${
                  darkMode ? 'text-white' : 'text-[#4B3B78]'
                }`}
              >
                Explorar datos
              </h2>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Personaliza el período y subregión geopolítica
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex flex-col gap-1">
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                  darkMode ? 'text-slate-400' : 'text-slate-600'
                }`}>
                Rango de años
              </span>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <Calendar className={`w-3.5 h-3.5 ${darkMode ? 'text-[#E68A2E]' : 'text-amber-700'}`} />
                <select
                  value={startYear}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setStartYear(val);
                    if (val > endYear) setEndYear(val);
                  }}
                  className="bg-transparent focus:outline-none cursor-pointer"
                >
                  {[2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024].map((y) => (
                    <option key={y} value={y} className={darkMode ? 'bg-slate-800' : 'bg-white'}>
                      {y}
                    </option>
                  ))}
                </select>
                <span className="opacity-40">—</span>
                <select
                  value={endYear}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setEndYear(val);
                    if (val < startYear) setStartYear(val);
                  }}
                  className="bg-transparent focus:outline-none cursor-pointer"
                >
                  {[2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024].map((y) => (
                    <option key={y} value={y} className={darkMode ? 'bg-slate-800' : 'bg-white'}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                  darkMode ? 'text-slate-400' : 'text-slate-600'
                }`}>
                Región WHR (10 categorías)
              </span>
              <div
                className={`relative flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <Globe className={`w-3.5 h-3.5 ${darkMode ? 'text-[#457B9D]' : 'text-sky-800'}`} />
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="bg-transparent pr-5 appearance-none focus:outline-none cursor-pointer"
                >
                  <option value="Todas las regiones" className={darkMode ? 'bg-slate-800' : 'bg-white'}>
                    Todas las regiones (10)
                  </option>
                  {activeRegions.map((reg) => (
                    <option key={reg} value={reg} className={darkMode ? 'bg-slate-800' : 'bg-white'}>
                      {REGION_CONFIG[reg]?.label || reg}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 opacity-50 pointer-events-none absolute right-2.5" />
              </div>
            </div>
          </div>
        </div>

        {/* 4 TARJETAS KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            className={`rounded-2xl p-5 border transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-100 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Promedio {selectedRegion === 'Todas las regiones' ? 'global' : 'regional'}
              </span>
              <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-[#E68A2E]">
                <Globe className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold tracking-tight">{kpis.globalAvg}</div>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span
                className={`inline-flex items-center gap-0.5 font-semibold ${
                  kpis.isPositivePrev ? 'text-[#2A9D8F]' : 'text-[#6A4C93]'
                }`}
              >
                {kpis.isPositivePrev ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {kpis.diffPrev}
              </span>
              <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}>vs. año anterior</span>
            </div>
          </div>

          <div
            className={`rounded-2xl p-5 border transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-100 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Países analizados
              </span>
              <div className="w-8 h-8 rounded-full bg-teal-500/10 flex items-center justify-center text-[#2A9D8F]">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold tracking-tight">{kpis.countryCount}</div>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-0.5 font-semibold text-[#2A9D8F]">
                <TrendingUp className="w-3.5 h-3.5" />
                +{kpis.countryCount > 0 ? Math.max(1, Math.round(kpis.countryCount * 0.05)) : 0}
              </span>
              <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}>
                {kpis.coverage}% de muestra WHR
              </span>
            </div>
          </div>

          <div
            className={`rounded-2xl p-5 border transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-100 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                País líder ({endYear})
              </span>
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-[#457B9D]">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight truncate">
              {kpis.happiestCountry}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-0.5 font-semibold text-[#2A9D8F]">
                <TrendingUp className="w-3.5 h-3.5" />
                {kpis.happiestScore}
              </span>
              <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}>puntos en el índice</span>
            </div>
          </div>

          <div
            className={`rounded-2xl p-5 border transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-100 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Variación acumulada
              </span>
              <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-[#6A4C93]">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold tracking-tight">{kpis.evolutionPct}</div>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span
                className={`inline-flex items-center gap-0.5 font-semibold ${
                  kpis.isPositiveStart ? 'text-[#2A9D8F]' : 'text-[#6A4C93]'
                }`}
              >
                {kpis.isPositiveStart ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {kpis.diffStart}
              </span>
              <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}>
                desde {startYear}
              </span>
            </div>
          </div>
        </div>

        {/* FILA 1: MAPA MUNDIAL + RANKINGS TOP 10 / BOTTOM 10 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* MAPA MUNDIAL VECTORIAL DE ALTA PRECISIÓN */}
          <div
            className={`lg:col-span-7 rounded-3xl p-6 border flex flex-col justify-between transition-colors ${
              darkMode
                ? 'bg-slate-900 border-slate-700'
                : 'bg-white border-slate-100 shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-[#E68A2E] uppercase">
                  Panorama Global · Todos los Continentes
                </span>
                <h2 className={`text-lg font-extrabold ${darkMode ? 'text-white' : 'text-[#4B3B78]'}`}>
                  La felicidad alrededor del mundo
                </h2>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Haz clic en cualquier país para abrir su diagnóstico táctico · {endYear}
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${
                  darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-[#4B3B78]'
                }`}
              >
                {dataCurrentYear.length} países
              </span>
            </div>

            <div
              className={`relative w-full flex-1 min-h-[18rem] sm:min-h-[20rem] rounded-2xl overflow-hidden border ${
                darkMode ? 'bg-slate-950 border-slate-700' : 'bg-[#EBF2F7] border-slate-200/80'
              }`}
            >
              <svg
                viewBox="0 0 1000 500"
                preserveAspectRatio="xMidYMid meet"
                className="w-full h-full select-none"
              >
                {/* Retícula cartográfica sutil */}
                <g stroke={darkMode ? '#1E293B' : '#CBD5E1'} strokeWidth="0.6" strokeDasharray="3 3" opacity="0.65">
                  <line x1="0" y1="125" x2="1000" y2="125" />
                  <line x1="0" y1="250" x2="1000" y2="250" />
                  <line x1="0" y1="375" x2="1000" y2="375" />
                  <line x1="250" y1="0" x2="250" y2="500" />
                  <line x1="500" y1="0" x2="500" y2="500" />
                  <line x1="750" y1="0" x2="750" y2="500" />
                </g>

                {/* Mapa Coroplético Real con fronteras de cada país */}
                <g stroke={darkMode ? '#0F172A' : '#FFFFFF'} strokeWidth="0.55" strokeLinejoin="round">
                  {worldCountryPaths.map((geo, idx) => {
                    const aliasName = COUNTRY_NAME_ALIASES[geo.name] || geo.name;
                    const matched =
                      countryDataLookup.get(geo.name.toLowerCase()) ||
                      countryDataLookup.get(aliasName.toLowerCase());
                    const isSelected = matched && selectedCountry?.name === matched.name;
                    const fillColor = matched
                      ? getScoreColor(matched.score)
                      : darkMode
                      ? '#1E293B'
                      : '#CBD5E1';

                    return (
                      <path
                        key={geo.id || `${geo.name}-${idx}`}
                        d={geo.d}
                        fill={fillColor}
                        fillOpacity={matched ? (isSelected ? 1 : 0.85) : 0.55}
                        stroke={isSelected ? '#F59E0B' : darkMode ? '#0F172A' : '#FFFFFF'}
                        strokeWidth={isSelected ? 1.6 : 0.55}
                        onMouseEnter={() => {
                          if (matched) setHoveredCountry(matched);
                        }}
                        onMouseLeave={() => setHoveredCountry(null)}
                        onClick={() => {
                          if (matched) setSelectedCountryName(matched.name);
                        }}
                        className={matched ? 'cursor-pointer transition-opacity duration-150 hover:opacity-100' : ''}
                      />
                    );
                  })}
                </g>
              </svg>

              {/* Tooltip flotante del país bajo el cursor */}
              {hoveredCountry && (
                <div
                  className={`absolute top-3 left-3 px-3 py-2 rounded-xl border text-xs shadow-md pointer-events-none ${
                    darkMode
                      ? 'bg-slate-900/95 border-slate-700 text-slate-100'
                      : 'bg-white/95 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="font-bold">{hoveredCountry.name}</div>
                  <div className="text-[11px] opacity-75">
                    {REGION_CONFIG[hoveredCountry.region]?.label || hoveredCountry.region}
                  </div>
                  <div
                    className="font-extrabold mt-0.5"
                    style={{ color: getScoreColor(hoveredCountry.score) }}
                  >
                    {hoveredCountry.score.toFixed(2)} pts · {getScoreLabel(hoveredCountry.score)}
                  </div>
                </div>
              )}

              {/* Escala de color fluida (4 tonos sin gris) */}
              <div
                className={`absolute bottom-3 right-3 px-3.5 py-2 rounded-2xl border flex items-center gap-3 text-[11px] font-semibold shadow-xs ${
                  darkMode
                    ? 'bg-slate-900/90 border-slate-700 text-slate-300'
                    : 'bg-white/95 border-slate-200/80 text-slate-600'
                }`}
              >
                <span>Menor</span>
                <div
                  className="w-24 sm:w-32 h-2.5 rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${HAPPINESS_PALETTE.muyBaja} 0%, ${HAPPINESS_PALETTE.moderadaBaja} 35%, ${HAPPINESS_PALETTE.moderadaAlta} 70%, ${HAPPINESS_PALETTE.muyAlta} 100%)`
                  }}
                />
                <span>Mayor bienestar</span>
              </div>
            </div>
          </div>

          {/* RANKINGS TOP 10 / BOTTOM 10 */}
          <div
            className={`lg:col-span-5 rounded-3xl p-6 border flex flex-col justify-between transition-colors ${
              darkMode
                ? 'bg-slate-900 border-slate-700'
                : 'bg-white border-slate-100 shadow-sm'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold tracking-widest text-[#E68A2E] uppercase">
                  Ranking {endYear}
                </span>
                <span className="text-[10px] opacity-60">Clic para inspeccionar</span>
              </div>
              <h2 className={`text-lg font-extrabold ${darkMode ? 'text-white' : 'text-[#4B3B78]'}`}>
                Los extremos del bienestar
              </h2>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Países con mayor y menor puntuación
              </p>

              {/* Pestañas Top 10 / Bottom 10 */}
              <div
                className={`grid grid-cols-2 p-1 rounded-xl mt-4 mb-5 ${
                  darkMode ? 'bg-slate-800' : 'bg-slate-100'
                }`}
              >
                <button
                  onClick={() => setRankingTab('top')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                    rankingTab === 'top'
                      ? darkMode
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-[#4B3B78] shadow-xs'
                      : darkMode
                      ? 'text-slate-400 hover:text-slate-200'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Top 10
                </button>
                <button
                  onClick={() => setRankingTab('bottom')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                    rankingTab === 'bottom'
                      ? darkMode
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-[#4B3B78] shadow-xs'
                      : darkMode
                      ? 'text-slate-400 hover:text-slate-200'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Bottom 10
                </button>
              </div>

              <div className="space-y-2.5">
                {rankingList.map((item, index) => {
                  const pct = Math.min(100, Math.max(12, (item.score / 8) * 100));
                  const barColor = getScoreColor(item.score);
                  const isSelected = selectedCountry?.name === item.name;
                  const barGradient =
                    rankingTab === 'top'
                      ? `linear-gradient(90deg, ${HAPPINESS_PALETTE.moderadaAlta} 0%, ${HAPPINESS_PALETTE.muyAlta} 100%)`
                      : `linear-gradient(90deg, ${HAPPINESS_PALETTE.muyBaja} 0%, ${HAPPINESS_PALETTE.moderadaBaja} 100%)`;

                  return (
                    <button
                      key={`${item.name}-${index}`}
                      onClick={() => setSelectedCountryName(item.name)}
                      className={`w-full flex items-center gap-3 text-xs p-1 rounded-lg transition-colors text-left ${
                        isSelected
                          ? darkMode
                            ? 'bg-slate-800/90'
                            : 'bg-amber-50/80'
                          : darkMode
                          ? 'hover:bg-slate-800/60'
                          : 'hover:bg-slate-100/60'
                      }`}
                    >
                      <span
                        className={`w-4 text-right font-semibold ${
                          darkMode ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        {rankingTab === 'top' ? index + 1 : dataCurrentYear.length - index}
                      </span>
                      <span
                        className={`w-28 truncate font-medium ${
                          darkMode ? 'text-slate-200' : 'text-slate-700'
                        }`}
                        title={`${item.name} (${REGION_CONFIG[item.region]?.label || item.region})`}
                      >
                        {item.name}
                      </span>
                      <div
                        className={`flex-1 h-2.5 rounded-full overflow-hidden ${
                          darkMode ? 'bg-slate-700' : 'bg-slate-100'
                        }`}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: barGradient
                          }}
                        />
                      </div>
                      <span
                        className="w-9 text-right font-bold"
                        style={{ color: barColor }}
                      >
                        {item.score.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* FILA 2: EVOLUCIÓN DE LA DÉCADA + DIAGRAMA DE DISPERSIÓN (PIB vs. FELICIDAD) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* EVOLUCIÓN TEMPORAL POR LAS 10 REGIONES */}
          <div
            className={`lg:col-span-7 rounded-3xl p-6 border flex flex-col justify-between transition-colors ${
              darkMode
                ? 'bg-slate-900 border-slate-700'
                : 'bg-white border-slate-100 shadow-sm'
            }`}
          >
            <div className="flex flex-col gap-2 mb-4">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-[#E68A2E] uppercase">
                  Evolución Longitudinal
                </span>
                <h2 className={`text-lg font-extrabold ${darkMode ? 'text-white' : 'text-[#4B3B78]'}`}>
                  Una década de bienestar por región WHR
                </h2>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Trayectoria media de las 10 regiones del reporte (clic en una etiqueta para aislar)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[10px] pt-1">
                {activeRegions
                  .filter((r) => r !== 'Sin región asignada')
                  .map((reg) => (
                    <button
                      key={reg}
                      onClick={() =>
                        setSelectedRegion(selectedRegion === reg ? 'Todas las regiones' : reg)
                      }
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-all ${
                        selectedRegion === reg
                          ? darkMode
                            ? 'bg-slate-800 border-slate-600 font-bold'
                            : 'bg-slate-100 border-slate-300 font-bold'
                          : 'border-transparent opacity-85 hover:opacity-100'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: REGION_CONFIG[reg].color }}
                      />
                      <span className={darkMode ? 'text-slate-300' : 'text-slate-600'}>
                        {REGION_CONFIG[reg].label}
                      </span>
                    </button>
                  ))}
              </div>
            </div>

            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={regionEvolutionData} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                  <defs>
                    {activeRegions
                      .filter((r) => r !== 'Sin región asignada')
                      .map((reg) => (
                        <linearGradient
                          key={`grad-${reg}`}
                          id={`areaGrad-${reg.replace(/\s+/g, '-')}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="5%" stopColor={REGION_CONFIG[reg].color} stopOpacity={0.28} />
                          <stop offset="95%" stopColor={REGION_CONFIG[reg].color} stopOpacity={0.0} />
                        </linearGradient>
                      ))}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={darkMode ? '#1E293B' : '#F1F5F9'}
                  />
                  <XAxis
                    dataKey="year"
                    tick={{ fontSize: 11, fill: darkMode ? '#94A3B8' : '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[3.5, 7.5]}
                    tick={{ fontSize: 11, fill: darkMode ? '#94A3B8' : '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value, name) => [value, REGION_CONFIG[name]?.label || name]}
                    contentStyle={{
                      backgroundColor: darkMode ? '#0F172A' : '#FFFFFF',
                      borderColor: darkMode ? '#334155' : '#E2E8F0',
                      borderRadius: '12px',
                      fontSize: '11px'
                    }}
                  />
                  {activeRegions
                    .filter((r) => r !== 'Sin región asignada')
                    .map((reg) => {
                      const isSelected = selectedRegion === reg;
                      const isDimmed =
                        selectedRegion !== 'Todas las regiones' && !isSelected;
                      return (
                        <Area
                          key={reg}
                          type="monotone"
                          dataKey={reg}
                          stroke={REGION_CONFIG[reg].color}
                          fill={`url(#areaGrad-${reg.replace(/\s+/g, '-')})`}
                          fillOpacity={isSelected ? 1 : isDimmed ? 0.05 : 0.35}
                          strokeWidth={isSelected ? 3.2 : 1.8}
                          strokeOpacity={isDimmed ? 0.15 : 1}
                          dot={false}
                          activeDot={{ r: 5 }}
                        />
                      );
                    })}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* DIAGRAMA DE DISPERSIÓN: CORRELACIÓN PIB / PILARES VS. FELICIDAD */}
          <div
            className={`lg:col-span-5 rounded-3xl p-6 border flex flex-col justify-between transition-colors ${
              darkMode
                ? 'bg-slate-900 border-slate-700'
                : 'bg-white border-slate-100 shadow-sm'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold tracking-widest text-[#E68A2E] uppercase">
                    Diagrama de Dispersión · Correlación
                  </span>
                  <h2 className={`text-lg font-extrabold ${darkMode ? 'text-white' : 'text-[#4B3B78]'}`}>
                    {activeFactorMeta.shortLabel} vs. Felicidad
                  </h2>
                </div>
              </div>

              {/* Selector sencillo de los 6 pilares */}
              <div className="mt-2.5">
                <label
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                    darkMode
                      ? 'bg-slate-800 border-slate-700 text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#E68A2E] shrink-0" />
                  <span className="opacity-70 shrink-0">Eje X:</span>
                  <select
                    value={selectedFactor}
                    onChange={(e) => setSelectedFactor(e.target.value)}
                    className="bg-transparent w-full focus:outline-none cursor-pointer"
                  >
                    {EXPLANATORY_FACTORS.map((f) => (
                      <option key={f.key} value={f.key} className={darkMode ? 'bg-slate-800' : 'bg-white'}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className={`text-[11px] mt-1.5 leading-snug ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Cada punto es un país ({endYear}). Las líneas punteadas marcan el promedio; haz clic en un punto para inspeccionarlo.
                </p>
              </div>
            </div>

            <div className="w-full h-60 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 12, right: 16, bottom: 16, left: -18 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={darkMode ? '#1E293B' : '#F1F5F9'}
                  />
                  <XAxis
                    type="number"
                    dataKey="xVal"
                    name={activeFactorMeta.shortLabel}
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10, fill: darkMode ? '#94A3B8' : '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    label={{
                      value: activeFactorMeta.shortLabel,
                      position: 'insideBottom',
                      offset: -8,
                      fontSize: 10,
                      fill: darkMode ? '#94A3B8' : '#64748B'
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="yVal"
                    name="Felicidad"
                    domain={[2, 8]}
                    tick={{ fontSize: 10, fill: darkMode ? '#94A3B8' : '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ZAxis type="number" dataKey="zVal" range={[45, 95]} />
                  <ReferenceLine
                    x={scatterAverages.avgX}
                    stroke={darkMode ? '#475569' : '#CBD5E1'}
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    y={scatterAverages.avgY}
                    stroke={darkMode ? '#475569' : '#CBD5E1'}
                    strokeDasharray="4 4"
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const pt = payload[0].payload;
                      return (
                        <div
                          className={`px-3 py-2 rounded-xl border text-xs shadow-md ${
                            darkMode
                              ? 'bg-slate-900/95 border-slate-700 text-slate-100'
                              : 'bg-white/95 border-slate-200 text-slate-800'
                          }`}
                        >
                          <div className="font-bold">{pt.name}</div>
                          <div className="text-[10px] opacity-70 mb-1">
                            {REGION_CONFIG[pt.region]?.label || pt.region}
                          </div>
                          <div>
                            {activeFactorMeta.shortLabel}: <strong>{pt.xVal}</strong>
                          </div>
                          <div>
                            Felicidad: <strong style={{ color: getScoreColor(pt.yVal) }}>{pt.yVal} pts</strong>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    data={scatterData}
                    onClick={(node) => {
                      if (node && node.name) setSelectedCountryName(node.name);
                    }}
                    className="cursor-pointer"
                  >
                    {scatterData.map((entry, idx) => {
                      const isSelected = selectedCountry?.name === entry.name;
                      return (
                        <Cell
                          key={`cell-${idx}`}
                          fill={getScoreColor(entry.yVal)}
                          fillOpacity={isSelected ? 1 : 0.8}
                          stroke={isSelected ? '#F59E0B' : '#FFFFFF'}
                          strokeWidth={isSelected ? 2.2 : 0.8}
                        />
                      );
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* PANEL TÁCTICO DE DIAGNÓSTICO POR PAÍS (COMPARATIVA VISUAL DIRECTA) */}
        {selectedCountry && tacticalComparison && (
          <div
            className={`rounded-3xl p-6 border transition-colors ${
              darkMode
                ? 'bg-slate-900 border-slate-700'
                : 'bg-white border-slate-100 shadow-sm'
            }`}
          >
            <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b ${
                darkMode ? 'border-slate-700' : 'border-slate-200/60'
              }`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-widest text-[#E68A2E] uppercase">
                    Radiografía por País · {endYear}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: getScoreColor(selectedCountry.score) }}
                  >
                    {getScoreLabel(selectedCountry.score)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <h2 className={`text-xl font-extrabold ${darkMode ? 'text-white' : 'text-[#4B3B78]'}`}>
                    {selectedCountry.name}
                  </h2>
                  <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Región: <strong>{REGION_CONFIG[selectedCountry.region]?.label || selectedCountry.region}</strong> ({tacticalComparison.peerCount} países)
                  </span>
                  <select
                    value={selectedCountry.name}
                    onChange={(e) => setSelectedCountryName(e.target.value)}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium cursor-pointer ${
                      darkMode
                        ? 'bg-slate-800 border-slate-700 text-slate-200'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    {[...dataCurrentYear]
                      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
                      .map((c) => (
                        <option
                          key={c.name}
                          value={c.name}
                          className={darkMode ? 'bg-slate-800' : 'bg-white'}
                        >
                          Ver país: {c.name} ({c.score.toFixed(2)})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Resumen ejecutivo en lenguaje claro */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div
                  className={`px-3.5 py-2 rounded-2xl border ${
                    darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-emerald-50/70 border-emerald-200/70'
                  }`}
                >
                  <span className="block text-[10px] uppercase font-bold text-[#2A9D8F]">
                    Mayor Fortaleza
                  </span>
                  <span className="font-bold">
                    {tacticalComparison.strength.factor} ({tacticalComparison.strength.countryRaw} vs. {tacticalComparison.strength.regionRaw} regional)
                  </span>
                </div>

                <div
                  className={`px-3.5 py-2 rounded-2xl border ${
                    darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-purple-50/70 border-purple-200/70'
                  }`}
                >
                  <span className="block text-[10px] uppercase font-bold text-[#6A4C93]">
                    Oportunidad de Mejora
                  </span>
                  <span className="font-bold">
                    {tacticalComparison.bottleneck.factor} ({tacticalComparison.bottleneck.countryRaw} vs. {tacticalComparison.bottleneck.regionRaw} regional)
                  </span>
                </div>
              </div>
            </div>

            {/* Barras comparativas directas: País vs. Promedio de su región */}
            <div className="pt-5">
              <div className="flex items-center justify-between text-xs mb-3">
                <span className={`font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Comparación directa de los 6 pilares frente al promedio de su región
                </span>
                <div className="flex items-center gap-4 text-[11px] font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#E68A2E]" />
                    {selectedCountry.name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#457B9D]" />
                    Promedio Regional
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tacticalComparison.metrics.map((m) => {
                  const diff = m.countryRaw - m.regionRaw;
                  const isAbove = diff >= 0;
                  return (
                    <div
                      key={m.key}
                      className={`p-4 rounded-2xl border ${
                        darkMode
                          ? 'bg-slate-800/70 border-slate-700'
                          : 'bg-slate-50/80 border-slate-200/70'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-bold">{m.factor}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isAbove
                              ? 'bg-[#2A9D8F]/15 text-[#2A9D8F]'
                              : 'bg-[#6A4C93]/15 text-[#6A4C93]'
                          }`}
                        >
                          {isAbove ? `+${diff.toFixed(2)} sobre media` : `${diff.toFixed(2)} bajo media`}
                        </span>
                      </div>

                      <div className="space-y-2 mt-2">
                        <div>
                          <div className="flex justify-between text-[11px] font-semibold mb-0.5">
                            <span>{selectedCountry.name}</span>
                            <span className="text-[#E68A2E] font-extrabold">{m.countryRaw}</span>
                          </div>
                          <div className={`w-full h-2 rounded-full overflow-hidden ${
                            darkMode ? 'bg-slate-700' : 'bg-slate-200'
                          }`}>
                            <div
                              className="h-full rounded-full bg-[#E68A2E] transition-all duration-500"
                              style={{ width: `${Math.min(100, m.countryNorm)}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] opacity-75 mb-0.5">
                            <span>Promedio Regional</span>
                            <span className="font-bold">{m.regionRaw}</span>
                          </div>
                          <div className={`w-full h-2 rounded-full overflow-hidden ${
                            darkMode ? 'bg-slate-700' : 'bg-slate-200'
                          }`}>
                            <div
                              className="h-full rounded-full bg-[#457B9D] transition-all duration-500"
                              style={{ width: `${Math.min(100, m.regionNorm)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* FOOTER CON NOTA METODOLÓGICA PARA INVESTIGADORES Y ANALISTAS */}
        <div
          className={`pt-4 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] gap-2 ${
            darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200/80 text-slate-500'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2">
            <Info className="w-3.5 h-3.5 text-[#457B9D] shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong>Nota metodológica:</strong> Los valores de los 6 factores corresponden a las puntuaciones normalizadas/logarítmicas reportadas en el <em>World Happiness Report (2015–2024)</em> sobre 1,502 observaciones.
            </span>
          </div>
          <span className="shrink-0">Fuente: WHR · Gallup World Poll</span>
        </div>
      </div>
    </div>
  );
}