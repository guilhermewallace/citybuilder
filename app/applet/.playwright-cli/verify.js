module.exports = async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('WebSocket') && !txt.includes('tile.openstreetmap.org')) {
        errors.push(`console.error: ${txt}`);
      }
    }
  });

  await page.waitForSelector('[data-testid="city-canvas"]');
  const initialMode = await page.getAttribute('[data-testid="city-canvas"]', 'data-mode');
  const initialBuildings = await page.getAttribute('[data-testid="city-canvas"]', 'data-buildings');
  await page.screenshot({ path: '.playwright-cli/cb-r1-fictional.png' });

  // Open New Project modal and switch to Real City (OpenStreetMap)
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('tab', { name: /Real City/i }).click();
  await page.getByRole('button', { name: /Teresina, Brazil/i }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: '.playwright-cli/cb-r1-modal.png' });

  // Open real-world map for Teresina
  await page.getByRole('button', { name: /Open Real-World Map/i }).click();
  await page.waitForSelector('[data-testid="leaflet-map-layer"]');
  await page.waitForSelector('[data-testid="geo-coords-readout"]');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '.playwright-cli/cb-r1-map-explore.png' });

  const geoMode = await page.getAttribute('[data-testid="city-canvas"]', 'data-mode');
  const coordsText = await page.textContent('[data-testid="geo-coords-readout"]');
  const hasAttribution = await page.getByText('© OpenStreetMap contributors').isVisible();

  // Try real Overpass import first; if sandbox blocks or rate-limits Overpass, log status
  await page.getByRole('button', { name: /Import Selected Area/i }).click();
  let realImportOk = false;
  try {
    await page.waitForFunction(
      () => Number(document.querySelector('[data-testid="city-canvas"]')?.getAttribute('data-roads') || '0') > 0,
      { timeout: 12000 }
    );
    realImportOk = true;
  } catch {
    realImportOk = false;
  }

  let importErrorMsg = '';
  if (!realImportOk) {
    const errEl = page.locator('section[aria-label="OpenStreetMap Area Import"] .text-red-700');
    if (await errEl.count()) {
      importErrorMsg = (await errEl.first().textContent()) || '';
    }
    // Fulfill Overpass via Playwright route so we can verify full conversion, rendering, layer toggles, and persistence
    await page.route('**/api/interpreter', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: 0.6,
          elements: [
            {
              type: 'way',
              id: 1001,
              tags: { highway: 'primary', name: 'Av. Frei Serafim' },
              geometry: [
                { lat: -5.0892, lon: -42.8040 },
                { lat: -5.0892, lon: -42.7990 },
              ],
            },
            {
              type: 'way',
              id: 1002,
              tags: { highway: 'residential', name: 'Rua Coelho Rodrigues' },
              geometry: [
                { lat: -5.0882, lon: -42.8022 },
                { lat: -5.0902, lon: -42.8022 },
              ],
            },
            {
              type: 'way',
              id: 2001,
              tags: { building: 'commercial', name: 'Palácio da Cidade', 'building:levels': '3' },
              geometry: [
                { lat: -5.0889, lon: -42.8018 },
                { lat: -5.0889, lon: -42.8013 },
                { lat: -5.0893, lon: -42.8013 },
                { lat: -5.0893, lon: -42.8018 },
                { lat: -5.0889, lon: -42.8018 },
              ],
            },
            {
              type: 'way',
              id: 2002,
              tags: { building: 'apartments', name: 'Edifício Rio Branco', 'building:levels': '8' },
              geometry: [
                { lat: -5.0886, lon: -42.8025 },
                { lat: -5.0886, lon: -42.8021 },
                { lat: -5.0888, lon: -42.8021 },
                { lat: -5.0888, lon: -42.8025 },
                { lat: -5.0886, lon: -42.8025 },
              ],
            },
            {
              type: 'way',
              id: 3001,
              tags: { leisure: 'park', name: 'Praça da Bandeira' },
              geometry: [
                { lat: -5.0895, lon: -42.8020 },
                { lat: -5.0895, lon: -42.8014 },
                { lat: -5.0899, lon: -42.8014 },
                { lat: -5.0899, lon: -42.8020 },
                { lat: -5.0895, lon: -42.8020 },
              ],
            },
            {
              type: 'node',
              id: 4001,
              lat: -5.0892,
              lon: -42.8015,
              tags: { highway: 'bus_stop', name: 'Parada Frei Serafim' },
            },
          ],
        }),
      });
    });
    // Adjust category checkbox slightly or re-click Import Selected Area (note cache only caches successes)
    await page.getByRole('button', { name: /Import Selected Area/i }).click();
    await page.waitForFunction(
      () => Number(document.querySelector('[data-testid="city-canvas"]')?.getAttribute('data-roads') || '0') > 0,
      { timeout: 5000 }
    );
  }

  await page.waitForTimeout(500);
  const importedBuildings = await page.getAttribute('[data-testid="city-canvas"]', 'data-buildings');
  const importedRoads = await page.getAttribute('[data-testid="city-canvas"]', 'data-roads');
  const importedParks = await page.getAttribute('[data-testid="city-canvas"]', 'data-public-spaces');
  const importedStations = await page.getAttribute('[data-testid="city-canvas"]', 'data-stations');

  // Place a Proposed Building on the real-world map
  await page.getByRole('button', { name: 'Office building' }).click();
  const canvasBox = await page.locator('[data-testid="city-canvas"]').boundingBox();
  if (canvasBox) {
    await page.mouse.click(canvasBox.x + canvasBox.width * 0.58, canvasBox.y + canvasBox.height * 0.54);
  }
  await page.waitForTimeout(250);

  // Switch back to Select tool and click the imported building near center to inspect Existing Infrastructure + Lat/Lon
  await page.getByRole('button', { name: /Select & Move/i }).click();
  if (canvasBox) {
    await page.mouse.click(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.playwright-cli/cb-r1-imported-edit.png' });

  // Toggle Existing off & back on, and verify persistence across reload
  await page.getByRole('button', { name: 'Existing', exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: '.playwright-cli/cb-r1-proposed-only.png' });
  await page.getByRole('button', { name: 'Existing', exact: true }).click();
  await page.waitForTimeout(200);

  // Reload browser and confirm geographic city + imported items + proposed item persisted
  await page.reload();
  await page.waitForSelector('[data-testid="city-canvas"]');
  await page.waitForTimeout(600);
  const reloadedMode = await page.getAttribute('[data-testid="city-canvas"]', 'data-mode');
  const reloadedBuildings = await page.getAttribute('[data-testid="city-canvas"]', 'data-buildings');

  return {
    initialMode,
    initialBuildings,
    geoMode,
    coordsText,
    hasAttribution,
    realImportOk,
    importErrorMsg,
    importedBuildings,
    importedRoads,
    importedParks,
    importedStations,
    reloadedMode,
    reloadedBuildings,
    errors,
  };
};
