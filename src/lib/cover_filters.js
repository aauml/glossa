export function initCollectionFilters(root = document, location = window.location, history = window.history) {
  const buttons = [...root.querySelectorAll('.cover-filter .f')];
  const cards = [...root.querySelectorAll('.article-card[data-topics]')];
  const empty = root.querySelector('.cover-empty');
  function apply(button, updateUrl = true) {
    const track = button.dataset.track;
    const topic = button.dataset.t;
    buttons.forEach(b => {
      b.classList.toggle('on', b === button);
      b.setAttribute('aria-pressed', String(b === button));
    });
    let shown = 0;
    cards.forEach(card => {
      const matches = track ? card.dataset.track === track : topic === 'all' || (card.dataset.topics || '').split('|').includes(topic);
      card.hidden = !matches;
      if (matches) shown++;
    });
    if (empty) empty.hidden = shown !== 0;
    if (updateUrl && (track === 'thesis' || location.hash === '#tesis')) {
      history.replaceState(null, '', location.pathname + location.search + (track === 'thesis' ? '#tesis' : ''));
    }
  }
  buttons.forEach(button => button.addEventListener('click', () => apply(button)));
  const selected = buttons.find(b => location.hash === '#tesis' ? b.dataset.track === 'thesis' : b.dataset.t === 'all');
  if (selected) apply(selected, false);
}
