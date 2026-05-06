// src/routes/routing.js
// ─────────────────────────────────────────────────────────────────────────────
// Rota de cálculo de percurso usando OSRM público (OpenStreetMap)
// GET /api/route?fromLat=&fromLng=&toLat=&toLng=
// Devolve: { distanceKm, durationMin, points: [{lat,lng}] }
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Decodifica polyline encodada (formato Google/OSRM).
 * precision=5 para OSRM, precision=6 para MapBox.
 */
function decodePolyline(encoded, precision = 5) {
  const factor = Math.pow(10, precision);
  const points = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

router.get('/', async (req, res) => {
  const { fromLat, fromLng, toLat, toLng } = req.query;

  if (!fromLat || !fromLng || !toLat || !toLng) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: fromLat, fromLng, toLat, toLng' });
  }

  try {
    // OSRM público — driving profile — formato: lng,lat (atenção à ordem)
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=polyline`;

    const response = await axios.get(url, { timeout: 8000 });
    const route = response.data.routes?.[0];

    if (!route) {
      return res.status(404).json({ error: 'Rota não encontrada' });
    }

    const distanceKm = route.distance / 1000;
    const durationMin = route.duration / 60;
    const points = decodePolyline(route.geometry);

    return res.json({ distanceKm, durationMin, points });
  } catch (err) {
    console.error('Erro OSRM:', err.message);

    // Fallback: linha recta se OSRM falhar
    const fLat = parseFloat(fromLat), fLng = parseFloat(fromLng);
    const tLat = parseFloat(toLat), tLng = parseFloat(toLng);
    const R = 6371;
    const dLat = (tLat - fLat) * Math.PI / 180;
    const dLon = (tLng - fLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(fLat * Math.PI / 180) * Math.cos(tLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const points = Array.from({ length: 11 }, (_, i) => ({
      lat: fLat + (tLat - fLat) * i / 10,
      lng: fLng + (tLng - fLng) * i / 10,
    }));

    return res.json({ distanceKm, durationMin: distanceKm * 3, points, fallback: true });
  }
});

module.exports = router;