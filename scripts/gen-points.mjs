import fs from "node:fs";

const outFile = "public/points.geojson";

// chỉnh số lượng điểm ở đây
const COUNT = 200000;

// Các "cụm" tập trung tại các quốc gia lớn
const clusters = [
  { name: "US-East", lon: -77, lat: 39, w: 0.28, lonStd: 1.5, latStd: 1 },
  { name: "US-West", lon: -122, lat: 37, w: 0.2, lonStd: 1.2, latStd: 1 },
  { name: "EU", lon: 10, lat: 50, w: 0.28, lonStd: 2, latStd: 1.5 },
  { name: "China", lon: 113, lat: 30, w: 0.2, lonStd: 1.5, latStd: 1.2 },
  { name: "India", lon: 78, lat: 22, w: 0.04, lonStd: 1.5, latStd: 1 },
];

// Gaussian random (Box–Muller)
function randn() {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function pickCluster() {
  const r = Math.random();
  let acc = 0;
  for (const c of clusters) {
    acc += c.w;
    if (r <= acc) return c;
  }
  return clusters[clusters.length - 1];
}

function clampLonLat(lon, lat) {
  lon = Math.max(-179.999, Math.min(179.999, lon));
  lat = Math.max(-84.999, Math.min(84.999, lat)); // tránh méo mercator
  return [lon, lat];
}

const features = new Array(COUNT);
for (let i = 0; i < COUNT; i++) {
  const c = pickCluster();
  let lon = c.lon + randn() * c.lonStd;
  let lat = c.lat + randn() * c.latStd;

  const [clon, clat] = clampLonLat(lon, lat);

  features[i] = {
    type: "Feature",
    properties: {
      weight: 1 + Math.floor(Math.random() * 5), // dùng cho bubble/heatmap nếu muốn
    },
    geometry: { type: "Point", coordinates: [clon, clat] },
  };
}

const geojson = { type: "FeatureCollection", features };
fs.writeFileSync(outFile, JSON.stringify(geojson));
console.log(`Wrote ${COUNT} points -> ${outFile}`);
