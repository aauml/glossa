// The publication track is metadata, independent of a piece's subject tags.
export function trackLabel(track, lang = 'es') {
  const labels = {
    thesis: {es: 'Tesis', en: 'Thesis'},
    'ai-policy': {es: 'Política de IA', en: 'AI policy'},
    finance: {es: 'Finanzas', en: 'Finance'},
    geopolitics: {es: 'Geopolítica', en: 'Geopolitics'},
  };
  return labels[track]?.[lang] || '';
}
export function thesisCollectionUrl(lang = 'es') {
  return (lang === 'es' ? '/es/' : '/') + '#tesis';
}
