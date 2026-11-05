import { $, escapeHTML, icon } from './dom.js';
import { findPlaces } from './geocoding.js';
import { describeError, isAbortError } from './api.js';
import { announce } from './ui.js';

const DEBOUNCE_MS = 280;
const el = {};
const state = { items: [], active: -1, timer: 0, controller: null, requestId: 0, query: '' };
let callbacks = {};
const mobileQuery = window.matchMedia('(max-width: 560px)');

export function initSearch(options) {
  callbacks = options;
  Object.assign(el, {
    wrap: $('#search'),
    input: $('#search-input'),
    panel: $('#search-panel'),
    list: $('#search-list'),
    status: $('#search-status'),
    spinner: $('#search-spinner'),
    clear: $('#search-clear'),
    cancel: $('#search-cancel'),
    topbar: $('#topbar'),
  });

  el.input.addEventListener('input', onInput);
  el.input.addEventListener('focus', onFocus);
  el.input.addEventListener('keydown', onKeydown);
  el.clear.addEventListener('click', () => {
    el.input.value = '';
    syncClear();
    showDefaults();
    el.input.focus();
  });
  el.cancel.addEventListener('click', () => {
    close();
    el.input.blur();
  });

  el.list.addEventListener('pointerdown', (event) => {
    if (event.target.closest('[role="option"]')) event.preventDefault();
  });
  el.list.addEventListener('click', (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) choose(Number(option.dataset.index));
  });
  el.list.addEventListener('pointermove', (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) setActive(Number(option.dataset.index), false);
  });
  el.status.addEventListener('click', (event) => {
    const retry = event.target.closest('[data-retry]');
    if (retry) runSearch(el.input.value, { pickFirst: false });
  });

  document.addEventListener('pointerdown', (event) => {
    if (el.panel.hidden) return;
    if (el.wrap.contains(event.target) || el.cancel.contains(event.target)) return;
    close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();
    focusSearch();
  });
}

export function focusSearch() {
  el.input.focus();
}

function syncClear() {
  const has = el.input.value.length > 0;
  el.clear.hidden = !has || !el.spinner.hidden;
  el.wrap.classList.toggle('has-value', has);
}

function open() {
  if (!el.panel.hidden) return;
  el.panel.hidden = false;
  el.input.setAttribute('aria-expanded', 'true');
}

function close() {
  clearTimeout(state.timer);
  el.panel.hidden = true;
  el.input.setAttribute('aria-expanded', 'false');
  el.input.removeAttribute('aria-activedescendant');
  el.topbar.classList.remove('is-searching');
  state.active = -1;
}

function setBusy(busy) {
  el.spinner.hidden = !busy;
  el.wrap.setAttribute('aria-busy', String(busy));
  syncClear();
}

function onFocus() {
  if (mobileQuery.matches) el.topbar.classList.add('is-searching');
  if (el.input.value.trim().length >= 2 && state.items.length) open();
  else showDefaults();
}

function onInput() {
  syncClear();
  clearTimeout(state.timer);
  const query = el.input.value;
  if (query.trim().length < 2) {
    if (state.controller) state.controller.abort();
    setBusy(false);
    showDefaults(query.trim().length === 1 ? 'Keep typing to search…' : '');
    return;
  }
  state.timer = setTimeout(() => runSearch(query, { pickFirst: false }), DEBOUNCE_MS);
}

function onKeydown(event) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      if (el.panel.hidden) {
        if (el.input.value.trim().length >= 2 && state.items.length) open();
        else showDefaults();
      }
      move(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      move(-1);
      break;
    case 'Enter':
      event.preventDefault();
      if (!el.panel.hidden && state.active >= 0) choose(state.active);
      else if (el.input.value.trim().length >= 2) runSearch(el.input.value, { pickFirst: true });
      break;
    case 'Escape':
      if (!el.panel.hidden) {
        event.preventDefault();
        close();
      } else if (el.input.value) {
        event.preventDefault();
        el.input.value = '';
        syncClear();
      } else {
        el.input.blur();
      }
      break;
    case 'Tab':
      close();
      break;
    default:
      break;
  }
}

function move(delta) {
  const count = state.items.length;
  if (!count) return;
  const next = state.active < 0 ? (delta > 0 ? 0 : count - 1) : (state.active + delta + count) % count;
  setActive(next, true);
}

function setActive(index, scroll) {
  state.active = index;
  el.list.querySelectorAll('[role="option"]').forEach((option) => {
    const selected = Number(option.dataset.index) === index;
    option.setAttribute('aria-selected', String(selected));
    if (selected) {
      el.input.setAttribute('aria-activedescendant', option.id);
      if (scroll) option.scrollIntoView({ block: 'nearest' });
    }
  });
}

function highlight(name, query) {
  const needle = query.split(',')[0].trim().toLowerCase();
  const index = needle ? name.toLowerCase().indexOf(needle) : -1;
  if (index < 0) return escapeHTML(name);
  return `${escapeHTML(name.slice(0, index))}<mark>${escapeHTML(name.slice(index, index + needle.length))}</mark>${escapeHTML(name.slice(index + needle.length))}`;
}

function placeSub(place) {
  return [place.admin1 && place.admin1 !== place.name ? place.admin1 : '', place.country].filter(Boolean).join(', ');
}

function optionHtml(item, index, query) {
  if (item.type === 'locate') {
    return `<li class="search__option" role="option" id="search-opt-${index}" data-index="${index}" aria-selected="false">
      <span class="search__option-icon">${icon('i-locate')}</span>
      <span><span class="search__name">Use my current location</span><span class="search__sub">Asks your browser for permission</span></span><span></span>
    </li>`;
  }
  const { place } = item;
  const iconId = item.group === 'favorite' ? 'i-star' : item.group === 'recent' ? (place.source === 'geo' ? 'i-geo' : 'i-clock') : 'i-pin';
  return `<li class="search__option" role="option" id="search-opt-${index}" data-index="${index}" aria-selected="false">
    <span class="search__option-icon">${icon(iconId)}</span>
    <span><span class="search__name">${query ? highlight(place.name, query) : escapeHTML(place.name)}</span><span class="search__sub">${escapeHTML(placeSub(place) || `${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}`)}</span></span>
    ${place.countryCode ? `<span class="search__cc">${escapeHTML(place.countryCode)}</span>` : '<span></span>'}
  </li>`;
}

function render(groups, query = '') {
  state.items = [];
  let html = '';
  groups.forEach((group) => {
    if (!group.items.length) return;
    if (group.label) html += `<li class="search__group label" role="presentation">${escapeHTML(group.label)}</li>`;
    group.items.forEach((item) => {
      const index = state.items.length;
      state.items.push(item);
      html += optionHtml(item, index, query);
    });
  });
  el.list.innerHTML = html;
  state.active = -1;
  el.input.removeAttribute('aria-activedescendant');
}

function setStatus(html) {
  el.status.innerHTML = html;
}

function showDefaults(message = '') {
  const favorites = callbacks.getFavorites().map((place) => ({ type: 'place', place, group: 'favorite' }));
  const favoriteKeys = new Set(favorites.map((item) => `${item.place.lat.toFixed(2)},${item.place.lon.toFixed(2)}`));
  const recents = callbacks.getRecents()
    .filter((place) => !favoriteKeys.has(`${place.lat.toFixed(2)},${place.lon.toFixed(2)}`))
    .map((place) => ({ type: 'place', place, group: 'recent' }));
  render([
    { label: '', items: [{ type: 'locate' }] },
    { label: 'Your places', items: favorites },
    { label: 'Recent', items: recents },
  ]);
  setStatus(message ? escapeHTML(message) : '');
  open();
}

async function runSearch(rawQuery, { pickFirst }) {
  const query = rawQuery.trim().replace(/\s+/g, ' ');
  clearTimeout(state.timer);
  if (query.length < 2) return;
  if (state.controller) state.controller.abort();
  const controller = new AbortController();
  state.controller = controller;
  const id = ++state.requestId;
  state.query = query;
  setBusy(true);
  open();
  if (!state.items.length || state.items[0].type === 'locate') setStatus('Searching…');

  try {
    const { results, suggestions } = await findPlaces(query, { signal: controller.signal });
    if (id !== state.requestId) return;
    if (results.length) {
      render([{ label: '', items: results.map((place) => ({ type: 'place', place, group: 'result' })) }], query);
      setStatus('');
      announce(`${results.length} ${results.length === 1 ? 'place' : 'places'} found. Use the arrow keys to choose.`);
      if (pickFirst) choose(0);
      return;
    }
    if (suggestions.length) {
      render([{ label: 'Did you mean', items: suggestions.map((place) => ({ type: 'place', place, group: 'result' })) }]);
      setStatus(`No exact match for <strong>“${escapeHTML(query)}”</strong>.`);
      announce(`No exact match for ${query}. ${suggestions.length} suggestions available.`);
      return;
    }
    render([]);
    setStatus(`No places match <strong>“${escapeHTML(query)}”</strong>.
      <ul class="search__tips"><li>Check the spelling</li><li>Try a larger nearby city</li><li>Add the country, for example “Paris, France”</li></ul>`);
    announce(`No places match ${query}.`);
  } catch (error) {
    if (isAbortError(error) || id !== state.requestId) return;
    const info = describeError(error);
    render([]);
    setStatus(`${escapeHTML(info.message)} <button class="text-btn" type="button" data-retry style="margin:0 0 0 4px">Try again</button>`);
    announce(info.message);
  } finally {
    if (id === state.requestId) setBusy(false);
  }
}

function choose(index) {
  const item = state.items[index];
  if (!item) return;
  close();
  el.input.value = '';
  syncClear();
  el.input.blur();
  if (item.type === 'locate') callbacks.onLocate();
  else callbacks.onSelect(item.place);
}
