function getRecognizeMode(settings) {
  if (!settings) return 'off';
  if (settings.mode === undefined) return settings.showRecognizeBtn === true ? 'custom' : 'off';
  return ['off', 'custom', 'meowid'].includes(settings.mode) ? settings.mode : 'off';
}

function normalizeRecognizeResponse(response, mode) {
  if (!response || response.ok !== true) return response;
  const data = Object.assign({}, response.data || {});
  data.catBoxes = Array.isArray(data.catBoxes) ? data.catBoxes : [];
  data.recognizeResults = Array.isArray(data.recognizeResults) ? data.recognizeResults : [];
  if (mode === 'custom' && !Number.isInteger(data.catCount)) {
    data.catCount = Math.max(data.catBoxes.length, data.recognizeResults.length ? 1 : 0);
  }
  data.provider = mode;
  return Object.assign({}, response, { data });
}

module.exports = { getRecognizeMode, normalizeRecognizeResponse };
