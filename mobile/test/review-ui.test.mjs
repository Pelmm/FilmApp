import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';
import { getReviewError, mergeMovies, getPopularMovies } from '../src/services/api.js';
import { StackRouter, StackActions } from '../node_modules/@react-navigation/routers/lib/module/index.js';

const require = createRequire(import.meta.url);
const { parse } = require('../node_modules/@babel/parser');
const { transformSync } = require('../node_modules/@babel/core');
const jsx = require('../node_modules/@babel/plugin-transform-react-jsx');
const user = { id: 'owner', username: 'Testperson' };
const review = {
  id: 'review-id', movieId: 550, rating: 8, text: 'Bra film.', user,
  updatedAt: '2026-10-19T10:00:00.000Z',
};
const movie = {
  id: 550, title: 'Testfilm', overview: 'Handling', poster_path: null,
  release_date: '', vote_average: null, genres: [], runtime: null,
};

// Kör riktiga komponenter med isolerade hooks, navigation och API-dubblar.
// Ingen enhetslagring eller riktig databas används.
function screen(name, props = {}, authenticated = true) {
  const source = fs.readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const body = ast.program.body.filter(node => node.type !== 'ImportDeclaration').map(node => {
    if (node.type.startsWith('Export')) node = node.declaration;
    return source.slice(node.start, node.end);
  }).join('\n');
  const code = transformSync(body, { configFile: false, babelrc: false, plugins: [jsx] }).code;
  const hooks = [];
  const listeners = new Map();
  const destinations = [];
  const alerts = [];
  const shares = [];
  const shareApi = {
    sharedAction: 'sharedAction',
    dismissedAction: 'dismissedAction',
    async share(content) {
      shares.push(content);
      return { action: 'sharedAction' };
    },
  };
  const timers = new Map();
  let timerId = 0;
  let now = 0;
  let focused = true;
  let position = 0;
  let dirty = true;
  let tree;
  let effects = [];
  const auth = {
    user: authenticated ? user : null, token: authenticated ? 'isolated-test-token' : null,
    isAuthenticated: authenticated, invalidated: 0, signedOut: 0,
    async invalidateSession() { auth.invalidated++; },
    async signOut() { auth.signedOut++; },
  };
  const api = {
    getReviewError, mergeMovies,
    getPopularMovies: async () => ({ page: 1, total_pages: 0, results: [] }),
    searchMovies: async () => ({ page: 1, total_pages: 1, results: [] }),
    discoverMovies: async () => ({ page: 1, total_pages: 0, total_results: 0, results: [] }),
    getMovieGenres: async () => [{ id: 27, name: 'Skräck' }, { id: 28, name: 'Action' }],
    getMovieDetails: async () => movie,
    getMovieReviews: async () => [],
    getMyReviews: async () => [],
    createReview: async () => review,
    updateReview: async () => review,
    deleteReview: async () => {},
  };
  const navigation = {
    navigate: (...args) => destinations.push(args),
    goBack: () => destinations.push(['back']),
    isFocused: () => focused,
    addListener(event, callback) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(callback);
      return () => listeners.get(event).delete(callback);
    },
  };
  const scope = {
    React: {
      Fragment: 'Fragment',
      createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    },
    useContext: () => auth,
    useNavigation: () => navigation,
    useIsFocused: () => focused,
    useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    useState(initial) {
      const index = position++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], value => {
        hooks[index] = typeof value === 'function' ? value(hooks[index]) : value;
        dirty = true;
      }];
    },
    useRef(initial) {
      const index = position++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useEffect(callback, dependencies) {
      const index = position++;
      const previous = hooks[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
        effects.push(() => {
          previous?.cleanup?.();
          hooks[index] = { dependencies, cleanup: callback() };
        });
      }
    },
    AuthContext: {}, AbortController, Date,
    StyleSheet: { create: value => value },
    Platform: { OS: 'android' }, Keyboard: { dismiss() {} },
    Alert: { alert: (...args) => alerts.push(args) },
    Share: shareApi,
    colors: {}, fonts: { sizes: {}, weights: {} }, globalStyles: {},
  };
  for (const name of ['ActivityIndicator', 'Image', 'KeyboardAvoidingView', 'ScrollView',
    'FlatList', 'Button', 'Modal', 'TextInput', 'Pressable', 'Text', 'View', 'ReviewCard', 'MovieCard']) scope[name] = name;
  for (const key of Object.keys(api)) scope[key] = (...args) => api[key](...args);
  const context = vm.createContext(scope);
  vm.runInContext(code, context);
  const component = context[name.split('/').at(-1)];
  function render() {
    position = 0;
    dirty = false;
    tree = component({ navigation, ...props });
    const pending = effects;
    effects = [];
    pending.forEach(effect => effect());
  }
  return {
    auth, api, navigation, destinations, alerts, shares, shareApi,
    get tree() { return tree; },
    // Låter väntande löften och ändringar i testets skärm hinna köras klart.
    async flush() {
      for (let i = 0; i < 30; i++) {
        await Promise.resolve();
        if (dirty) render();
      }
    },
    // Provar genrebytets korta väntetid utan att testerna behöver vänta på riktig tid.
    async advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of timers) {
        if (timer.due <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
      await this.flush();
    },
    focus(value) {
      focused = value;
      dirty = true;
      for (const callback of listeners.get(value ? 'focus' : 'blur') || []) callback();
    },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()); },
  };
}

function nodes(root, type) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node.type === type) found.push(node);
    visit(node.children);
    visit(node.props?.ListHeaderComponent);
    visit(node.props?.ListEmptyComponent);
    visit(node.props?.ListFooterComponent);
  }
  visit(root);
  return found;
}
function text(root) {
  if (root === null || root === undefined || root === false) return '';
  if (typeof root !== 'object') return String(root);
  if (Array.isArray(root)) return root.map(text).join(' ');
  return text(root.children);
}
function button(app, label) {
  const found = nodes(app.tree, 'Pressable').find(node => text(node).trim() === label);
  assert.ok(found, `Knappen ${label} ska visas`);
  return found.props.onPress;
}
async function fill(app) {
  await app.flush();
  nodes(app.tree, 'Pressable').find(node => node.props.accessibilityLabel === 'Betyg 8 av 10').props.onPress();
  nodes(app.tree, 'TextInput')[0].props.onChangeText('Bra film.');
  await app.flush();
}

const editorProps = { route: { params: { movieId: 550, movieTitle: 'Testfilm' } } };

test('Dela film använder aktuell titel och TMDB-länk även utan inloggning', async () => {
  for (const data of [movie, { ...movie, id: 155, title: 'The Dark Knight' }]) {
    const app = screen('screens/MovieDetailsScreen', { route: { params: { movieId: data.id } } }, false);
    app.api.getMovieDetails = async () => data;
    await app.flush();
    await button(app, 'Dela film')();
    assert.equal(app.shares.length, 1);
    assert.equal(app.shares[0].message, `Kolla in ${data.title}!\n\nhttps://www.themoviedb.org/movie/${data.id}`);
    assert.equal(app.alerts.length, 0);
    assert.equal(app.auth.isAuthenticated, false);
    assert.equal(app.destinations.length, 0);
  }
});

test('Dela film fungerar även för en inloggad användare och trimmar titeln', async () => {
  const app = screen('screens/MovieDetailsScreen', { route: { params: { movieId: 550 } } });
  app.api.getMovieDetails = async () => ({ ...movie, title: '  Testfilm  ' });
  await app.flush();
  await button(app, 'Dela film')();
  assert.equal(app.shares[0].message, 'Kolla in Testfilm!\n\nhttps://www.themoviedb.org/movie/550');
  assert.equal(app.alerts.length, 0);
});

test('saknat eller ogiltigt film-ID stoppar delningen med ett begripligt fel', async () => {
  for (const id of [undefined, null, 0, -1, 1.5, '550']) {
    const app = screen('screens/MovieDetailsScreen', { route: { params: { movieId: 550 } } });
    app.api.getMovieDetails = async () => ({ ...movie, id });
    await app.flush();
    await button(app, 'Dela film')();
    assert.equal(app.shares.length, 0);
    assert.equal(app.alerts.length, 1);
    assert.equal(app.alerts[0][0], 'Kan inte dela filmen');
    assert.equal(app.alerts[0][1], 'Filmens ID saknas eller är ogiltigt.');
  }
});

test('saknad eller tom filmtitel delas inte som reservtext', async () => {
  for (const title of [undefined, null, '', '   ', 123]) {
    const app = screen('screens/MovieDetailsScreen', { route: { params: { movieId: 550 } } });
    app.api.getMovieDetails = async () => ({ ...movie, title });
    await app.flush();
    await button(app, 'Dela film')();
    assert.equal(app.shares.length, 0);
    assert.equal(app.alerts.length, 1);
    assert.equal(app.alerts[0][1], 'Filmens titel saknas.');
  }
});

test('avbruten delning visar inget fel eller framgångsmeddelande', async () => {
  const app = screen('screens/MovieDetailsScreen', { route: { params: { movieId: 550 } } });
  app.shareApi.share = async () => ({ action: app.shareApi.dismissedAction });
  await app.flush();
  await button(app, 'Dela film')();
  assert.equal(app.alerts.length, 0);
  assert.equal(app.destinations.length, 0);
});

test('ett faktiskt Share-fel visas utan att exponera det interna felmeddelandet', async () => {
  const app = screen('screens/MovieDetailsScreen', { route: { params: { movieId: 550 } } });
  app.shareApi.share = async () => { throw new Error('Internt fel från operativsystemet'); };
  await app.flush();
  await button(app, 'Dela film')();
  assert.equal(app.alerts.length, 1);
  assert.equal(app.alerts[0][0], 'Kunde inte dela filmen');
  assert.equal(app.alerts[0][1], 'Försök igen om en stund.');
  assert.equal(app.auth.invalidated, 0);
});

test('formuläret validerar, blockerar dubbeltryck och visar lyckat resultat', async () => {
  const app = screen('screens/ReviewEditorScreen', editorProps);
  let calls = 0;
  let respond;
  app.api.createReview = () => { calls++; return new Promise(resolve => { respond = resolve; }); };
  await app.flush();
  await button(app, 'Spara')();
  await app.flush();
  assert.ok(text(app.tree).includes('heltalsbetyg'));
  assert.equal(calls, 0);
  await fill(app);
  const save = button(app, 'Spara');
  const pending = save();
  await save();
  assert.equal(calls, 1);
  await app.flush();
  assert.equal(nodes(app.tree, 'ActivityIndicator').length, 1);
  respond(review);
  await pending;
  await app.flush();
  assert.ok(text(app.tree).includes('Din recension har sparats.'));
  button(app, 'Tillbaka')();
  assert.equal(app.destinations[0][0], 'back');
});

test('redigering förifyller fälten och uppdaterar rätt recension', async () => {
  const app = screen('screens/ReviewEditorScreen', { route: { params: { ...editorProps.route.params, review } } });
  let args;
  app.api.updateReview = async (...values) => { args = values; };
  await app.flush();
  assert.equal(nodes(app.tree, 'TextInput')[0].props.value, review.text);
  nodes(app.tree, 'TextInput')[0].props.onChangeText('Ny text');
  await app.flush();
  await button(app, 'Spara')();
  assert.equal(args[1], review.id);
  assert.equal(args[2].rating, 8);
  assert.equal(args[2].text, 'Ny text');
});

test('409 hämtar aktuell egen recension och byter till redigering', async () => {
  const app = screen('screens/ReviewEditorScreen', editorProps);
  app.api.createReview = async () => { throw Object.assign(new Error('Finns redan'), { status: 409 }); };
  app.api.getMovieReviews = async () => [review];
  let patched = 0;
  app.api.updateReview = async () => { patched++; };
  await fill(app);
  await button(app, 'Spara')();
  await app.flush();
  assert.ok(text(app.tree).includes('har laddats för redigering'));
  assert.equal(nodes(app.tree, 'TextInput')[0].props.value, review.text);
  await button(app, 'Spara')();
  assert.equal(patched, 1);
});

for (const status of [401, 403, 404, 500, undefined]) {
  test(`sparfel ${status || 'nätverk'} hanteras utan felaktig utloggning`, async () => {
    const app = screen('screens/ReviewEditorScreen', editorProps);
    app.api.createReview = async () => { throw Object.assign(new Error('Kunde inte spara'), { status }); };
    await fill(app);
    await button(app, 'Spara')();
    await app.flush();
    assert.equal(app.auth.invalidated, status === 401 ? 1 : 0);
    if (status !== 401) assert.ok(text(app.tree).includes('Kunde inte spara'));
  });
}

test('lämna formuläret avbryter sparandet och ignorerar ett sent svar', async () => {
  const app = screen('screens/ReviewEditorScreen', editorProps);
  let signal, respond;
  app.api.createReview = (_token, _body, options) => {
    signal = options.signal;
    return new Promise(resolve => { respond = resolve; });
  };
  await fill(app);
  const pending = button(app, 'Spara')();
  app.focus(false);
  assert.equal(signal.aborted, true);
  respond(review);
  await pending;
  app.focus(true);
  await app.flush();
  assert.equal(text(app.tree).includes('har sparats'), false);
});

test('endast ägaren ser redigera och radera; filmlänken använder movieId', async () => {
  const app = screen('components/ReviewCard', { review, movieTitle: 'Testfilm', showMovieLink: true });
  await app.flush();
  button(app, 'Testfilm')();
  button(app, 'Redigera')();
  assert.equal(app.destinations[0][0], 'MovieDetails');
  assert.equal(app.destinations[0][1].movieId, 550);
  assert.equal(app.destinations[1][0], 'ReviewEditor');
  const other = screen('components/ReviewCard', { review: { ...review, user: { id: 'other' } } });
  const guest = screen('components/ReviewCard', { review }, false);
  await other.flush();
  await guest.flush();
  assert.equal(nodes(other.tree, 'Pressable').length, 0);
  assert.equal(nodes(guest.tree, 'Pressable').length, 0);
});

test('radering kräver bekräftelse, kan avbrytas och spärrar dubbeltryck', async () => {
  let calls = 0, changed = 0, respond;
  const app = screen('components/ReviewCard', { review, onChanged: () => { changed++; } });
  app.api.deleteReview = () => { calls++; return new Promise(resolve => { respond = resolve; }); };
  await app.flush();
  const remove = button(app, 'Ta bort');
  remove();
  remove();
  assert.equal(app.alerts.length, 1);
  assert.equal(calls, 0);
  app.alerts[0][2][0].onPress();
  assert.equal(calls, 0);
  remove();
  const confirm = app.alerts[1][2][1].onPress;
  const pending = confirm();
  await confirm();
  assert.equal(calls, 1);
  respond();
  await pending;
  assert.equal(changed, 1);
});

test('gammal raderingsdialog får inte radera efter att skärmen lämnats', async () => {
  const app = screen('components/ReviewCard', { review, onChanged() {} });
  app.api.deleteReview = () => assert.fail('Ingen radering efter blur');
  await app.flush();
  button(app, 'Ta bort')();
  app.focus(false);
  await app.alerts[0][2][1].onPress();
});

test('publik film visar tom lista, inloggningsknapp och laddar om vid återkomst', async () => {
  const app = screen('screens/MovieDetailsScreen', { route: { params: { movieId: 550 } } }, false);
  let calls = 0;
  app.api.getMovieReviews = async () => { calls++; return []; };
  await app.flush();
  assert.ok(text(app.tree).includes('Inga recensioner ännu'));
  assert.ok(text(app.tree).includes('Handling'));
  button(app, 'Logga in för att skriva en recension')();
  assert.equal(app.destinations[0][0], 'Login');
  app.focus(false);
  await app.flush();
  app.api.getMovieReviews = async () => { calls++; return [review]; };
  app.focus(true);
  await app.flush();
  assert.equal(calls, 2);
  const card = nodes(app.tree, 'ReviewCard')[0];
  assert.equal(card.props.review.id, review.id);
  card.props.onChanged();
  await app.flush();
  assert.equal(calls, 3);
});

test('filmrecensionernas nätverksfel har fungerande försök igen', async () => {
  const app = screen('screens/MovieDetailsScreen', { route: { params: { movieId: 550 } } });
  app.api.getMovieReviews = async () => { throw new Error('Tillfälligt nätverksfel'); };
  await app.flush();
  assert.ok(text(app.tree).includes('Tillfälligt nätverksfel'));
  assert.equal(text(app.tree).includes('Skriv recension'), false);
  app.api.getMovieReviews = async () => [];
  button(app, 'Försök igen')();
  await app.flush();
  button(app, 'Skriv recension')();
  assert.equal(app.destinations[0][0], 'ReviewEditor');
});

test('befintlig egen recension visas utan en extra skapa-knapp', async () => {
  const app = screen('screens/MovieDetailsScreen', { route: { params: { movieId: 550 } } });
  app.api.getMovieReviews = async () => [review];
  await app.flush();
  assert.equal(nodes(app.tree, 'ReviewCard').length, 1);
  assert.equal(text(app.tree).includes('Skriv recension'), false);
});

test('egna recensioner hämtar titlar i ordning, visar reservtext och uppdateras', async () => {
  const app = screen('screens/MyReviewsScreen');
  let lists = 0, active = 0, maxActive = 0;
  const titles = [];
  app.api.getMyReviews = async () => {
    lists++;
    return [review, { ...review, id: 'second', movieId: 551 }];
  };
  app.api.getMovieDetails = async id => {
    active++;
    maxActive = Math.max(maxActive, active);
    titles.push(id);
    await Promise.resolve();
    active--;
    if (id === 551) throw new Error('Filmen saknas');
    return movie;
  };
  await app.flush();
  const cards = app.tree.props.data.map(item => app.tree.props.renderItem({ item }));
  assert.equal(cards[0].props.movieTitle, 'Testfilm');
  assert.equal(cards[1].props.movieTitle, 'Film 551');
  assert.equal(cards[0].props.showMovieLink, true);
  assert.equal(maxActive, 1);
  cards[0].props.onChanged();
  await app.flush();
  assert.equal(lists, 2);
  assert.equal(titles.filter(id => id === 550).length, 1);
  app.focus(false);
  await app.flush();
  app.focus(true);
  await app.flush();
  assert.equal(lists, 3);
  await button(app, 'Logga ut')();
  assert.equal(app.auth.signedOut, 1);
});

test('egna recensioner visar tom lista, nätverksfel och ogiltig session korrekt', async () => {
  const app = screen('screens/MyReviewsScreen');
  await app.flush();
  assert.ok(text(app.tree.props.ListEmptyComponent).includes('inga recensioner'));
  app.api.getMyReviews = async () => { throw new Error('Nätverksfel'); };
  app.focus(false);
  await app.flush();
  app.focus(true);
  await app.flush();
  assert.ok(text(app.tree.props.ListEmptyComponent).includes('Nätverksfel'));
  assert.equal(app.auth.invalidated, 0);
  app.api.getMyReviews = async () => { throw Object.assign(new Error('Utgången'), { status: 401 }); };
  button(app, 'Försök igen')();
  await app.flush();
  assert.equal(app.auth.invalidated, 1);
});

test('inloggning behåller filmen och utloggning tar bort skyddade skärmar i riktiga StackRouter', () => {
  const guest = ['Home', 'Search', 'MovieDetails', 'Login', 'Register'];
  const member = ['Home', 'Search', 'MovieDetails', 'MyReviews', 'ReviewEditor'];
  const router = StackRouter({ initialRouteName: 'Home' });
  function options(routeNames) { return { routeNames, routeParamList: {}, routeGetIdList: {} }; }
  let state = router.getInitialState(options(guest));
  state = router.getStateForAction(state, StackActions.push('MovieDetails', { movieId: 550 }), options(guest));
  state = router.getStateForAction(state, StackActions.push('Login'), options(guest));
  state = router.getStateForRouteNamesChange(state, { ...options(member), routeKeyChanges: [] });
  assert.equal(state.routes[state.index].name, 'MovieDetails');
  assert.equal(state.routes[state.index].params.movieId, 550);
  state = router.getStateForAction(state, StackActions.push('ReviewEditor', { movieId: 550 }), options(member));
  state = router.getStateForRouteNamesChange(state, { ...options(guest), routeKeyChanges: [] });
  assert.equal(state.routes.some(route => route.name === 'ReviewEditor'), false);
  assert.equal(state.routes.some(route => route.name === 'MyReviews'), false);
  assert.equal(state.routes[state.index].name, 'MovieDetails');
});

test('Sök titel är standard och hämtar ingen genrelista före Utforska', async () => {
  const app = screen('screens/SearchScreen');
  let genreCalls = 0;
  app.api.getMovieGenres = async () => { genreCalls++; return [{ id: 27, name: 'Skräck' }]; };
  await app.flush();
  assert.equal(genreCalls, 0);
  const titleMode = nodes(app.tree, 'Pressable').find(node => text(node) === 'Sök titel');
  assert.equal(titleMode.props.accessibilityState.selected, true);
  assert.equal(nodes(app.tree, 'TextInput')[0].props.accessibilityLabel, 'Filmtitel att söka efter');
  button(app, 'Utforska filmer')();
  await app.flush();
  assert.equal(genreCalls, 1);
  button(app, 'Skräck');
  button(app, 'Sök titel')();
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  assert.equal(genreCalls, 1);
});

test('titelsökningen validerar tomt fält och skickar titel och sida ett som tidigare', async () => {
  const app = screen('screens/SearchScreen');
  let args;
  app.api.searchMovies = async (...values) => { args = values; return { page: 1, total_pages: 1, results: [movie] }; };
  app.api.discoverMovies = () => assert.fail('Titelsökning får inte använda Discover');
  await app.flush();
  await button(app, 'Sök')();
  await app.flush();
  assert.equal(args, undefined);
  assert.ok(text(nodes(app.tree, 'FlatList')[0].props.ListEmptyComponent).includes('Ange en filmtitel'));
  nodes(app.tree, 'TextInput')[0].props.onChangeText(' Batman ');
  await app.flush();
  await button(app, 'Sök')();
  await app.flush();
  assert.equal(args[0], 'Batman');
  assert.equal(args[1], 1);
  const list = nodes(app.tree, 'FlatList')[0];
  assert.equal(list.props.data[0].id, movie.id);
  const rendered = list.props.renderItem({ item: list.props.data[0] });
  assert.equal(rendered.type, 'MovieCard');
  const card = screen('components/MovieCard', rendered.props);
  await card.flush();
  nodes(card.tree, 'Pressable')[0].props.onPress();
  assert.equal(card.destinations[0][0], 'MovieDetails');
  assert.equal(card.destinations[0][1].movieId, movie.id);
});

test('genrerna ligger horisontellt och filterpanelen kan stängas med knapp och Androids tillbaka', async () => {
  const app = screen('screens/SearchScreen');
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  assert.equal(nodes(app.tree, 'ScrollView')[0].props.horizontal, true);
  assert.equal(nodes(app.tree, 'TextInput').length, 0);
  assert.equal(nodes(app.tree, 'Modal').length, 0);
  button(app, 'Filter')();
  await app.flush();
  assert.equal(nodes(app.tree, 'Modal').length, 1);
  assert.equal(nodes(app.tree, 'TextInput')[0].props.accessibilityLabel, 'Utgivningsår');
  nodes(app.tree, 'TextInput')[0].props.onChangeText('2020');
  button(app, '8+')();
  await app.flush();
  nodes(app.tree, 'Modal')[0].props.onRequestClose();
  await app.flush();
  assert.equal(nodes(app.tree, 'Modal').length, 0);
  assert.equal(app.destinations.length, 0);
  button(app, 'Filter')();
  await app.flush();
  assert.equal(nodes(app.tree, 'TextInput')[0].props.value, '');
  const allRatings = nodes(app.tree, 'Pressable').find(node => text(node).trim() === 'Alla betyg');
  assert.equal(allRatings.props.accessibilityState.selected, true);
  button(app, 'Stäng')();
  await app.flush();
  assert.equal(nodes(app.tree, 'Modal').length, 0);
});

test('snabba genrebyten skickar bara det sista genre-ID:t och markerar ett val', async () => {
  const app = screen('screens/SearchScreen');
  const calls = [];
  app.api.discoverMovies = async filters => { calls.push(filters); return { page: 1, total_pages: 1, results: [movie] }; };
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  button(app, 'Skräck')();
  await app.flush();
  await app.advance(100);
  button(app, 'Action')();
  await app.flush();
  await app.advance(299);
  assert.equal(calls.length, 0);
  await app.advance(1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].genre, 28);
  assert.equal(calls[0].sortBy, 'popular');
  assert.equal(nodes(app.tree, 'FlatList')[0].props.data[0].id, movie.id);
  const selected = nodes(app.tree, 'Pressable').filter(node => {
    return node.props.accessibilityLabel?.startsWith('Genre:') && node.props.accessibilityState.selected;
  });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].props.accessibilityLabel, 'Genre: Action');
});

test('panelen kombinerar val med genre och nya genreval använder tillämpade filter', async () => {
  const app = screen('screens/SearchScreen');
  const calls = [];
  app.api.discoverMovies = async filters => { calls.push(filters); return { page: 1, total_pages: 1, results: [movie] }; };
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  button(app, 'Skräck')();
  await app.advance(300);
  button(app, 'Filter')();
  await app.flush();
  nodes(app.tree, 'TextInput')[0].props.onChangeText('2020');
  button(app, '7+')();
  button(app, 'Högst betyg')();
  await app.flush();
  assert.equal(calls.length, 1);
  assert.equal(nodes(app.tree, 'FlatList')[0].props.data.length, 1);
  await button(app, 'Visa filmer')();
  await app.flush();
  assert.equal(nodes(app.tree, 'Modal').length, 0);
  assert.equal(JSON.stringify(calls[1]), JSON.stringify({ sortBy: 'rating', genre: 27, year: 2020, minRating: 7 }));
  button(app, 'Action')();
  await app.flush();
  assert.equal(nodes(app.tree, 'FlatList')[0].props.data.length, 0);
  await app.advance(300);
  assert.equal(JSON.stringify(calls[2]), JSON.stringify({ sortBy: 'rating', genre: 28, year: 2020, minRating: 7 }));
});

test('stängd panel behåller tidigare filter och resultat trots ändringar som inte tillämpats', async () => {
  const app = screen('screens/SearchScreen');
  const calls = [];
  app.api.discoverMovies = async filters => { calls.push(filters); return { page: 1, total_pages: 1, results: [movie] }; };
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  button(app, 'Filter')();
  await app.flush();
  nodes(app.tree, 'TextInput')[0].props.onChangeText('2020');
  await app.flush();
  await button(app, 'Visa filmer')();
  await app.flush();
  button(app, 'Filter')();
  await app.flush();
  nodes(app.tree, 'TextInput')[0].props.onChangeText('2030');
  button(app, '9+')();
  button(app, 'Äldsta')();
  await app.flush();
  assert.equal(calls.length, 1);
  assert.equal(nodes(app.tree, 'FlatList')[0].props.data.length, 1);
  button(app, 'Stäng')();
  await app.flush();
  button(app, 'Skräck')();
  await app.advance(300);
  assert.equal(calls[1].year, 2020);
  assert.equal(calls[1].minRating, undefined);
  assert.equal(calls[1].sortBy, 'popular');
  button(app, 'Filter')();
  await app.flush();
  assert.equal(nodes(app.tree, 'TextInput')[0].props.value, '2020');
});

test('Rensa filter återställer genre, panel och tillämpade filter utan onödigt anrop', async () => {
  const app = screen('screens/SearchScreen');
  const calls = [];
  app.api.discoverMovies = async filters => { calls.push(filters); return { page: 1, total_pages: 1, results: [movie] }; };
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  button(app, 'Skräck')();
  await app.advance(300);
  button(app, 'Filter')();
  await app.flush();
  nodes(app.tree, 'TextInput')[0].props.onChangeText('2020');
  button(app, '8+')();
  button(app, 'Äldsta')();
  await app.flush();
  await button(app, 'Visa filmer')();
  await app.flush();
  button(app, 'Filter')();
  await app.flush();
  button(app, 'Rensa filter')();
  await app.flush();
  assert.equal(calls.length, 2);
  assert.equal(nodes(app.tree, 'FlatList')[0].props.data.length, 0);
  assert.equal(nodes(app.tree, 'TextInput')[0].props.value, '');
  for (const label of ['Alla', 'Alla betyg', 'Populärast']) {
    const option = nodes(app.tree, 'Pressable').find(node => text(node).trim() === label);
    assert.equal(option.props.accessibilityState.selected, true);
  }
  await button(app, 'Visa filmer')();
  await app.flush();
  assert.equal(JSON.stringify(calls[2]), JSON.stringify({ sortBy: 'popular' }));
});

test('ogiltigt år behåller panelen och rätt årsgränser kan tillämpas', async () => {
  const app = screen('screens/SearchScreen');
  const calls = [];
  app.api.discoverMovies = async filters => { calls.push(filters); return { page: 1, total_pages: 1, results: [] }; };
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  button(app, 'Filter')();
  await app.flush();
  const lastYear = new Date().getFullYear() + 5;
  for (const year of ['1887', String(lastYear + 1), '2020.5', '2e3', '0x7e4', ' 2020', '2020 ', 'abc']) {
    nodes(app.tree, 'TextInput')[0].props.onChangeText(year);
    await app.flush();
    await button(app, 'Visa filmer')();
    await app.flush();
    assert.equal(nodes(app.tree, 'Modal').length, 1);
    assert.ok(text(nodes(app.tree, 'Modal')[0]).includes('Ange ett årtal'));
  }
  assert.equal(calls.length, 0);
  for (const year of ['1888', String(lastYear), '']) {
    nodes(app.tree, 'TextInput')[0].props.onChangeText(year);
    await app.flush();
    await button(app, 'Visa filmer')();
    await app.flush();
    assert.equal(nodes(app.tree, 'Modal').length, 0);
    button(app, 'Filter')();
    await app.flush();
  }
  assert.equal(calls[0].year, 1888);
  assert.equal(calls[1].year, lastYear);
  assert.equal(calls[2].year, undefined);
});

test('Visa filmer spärrar dubbeltryck och behåller laddning, tom lista, API-fel och återförsök', async () => {
  const app = screen('screens/SearchScreen');
  let calls = 0, respond;
  app.api.discoverMovies = () => { calls++; return new Promise(resolve => { respond = resolve; }); };
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  button(app, 'Filter')();
  await app.flush();
  const apply = button(app, 'Visa filmer');
  apply();
  apply();
  await app.flush();
  assert.equal(calls, 1);
  assert.equal(nodes(app.tree, 'Modal').length, 0);
  assert.equal(nodes(app.tree, 'ActivityIndicator').length, 1);
  respond({ page: 1, total_pages: 1, results: [] });
  await app.flush();
  assert.ok(text(nodes(app.tree, 'FlatList')[0].props.ListEmptyComponent).includes('Inga filmer matchar filtren'));
  app.api.discoverMovies = async () => { throw new Error('Tillfälligt nätverksfel'); };
  button(app, 'Filter')();
  await app.flush();
  button(app, 'Visa filmer')();
  await app.flush();
  assert.ok(text(nodes(app.tree, 'FlatList')[0].props.ListEmptyComponent).includes('Tillfälligt nätverksfel'));
  app.api.discoverMovies = async () => ({ page: 1, total_pages: 1, results: [movie] });
  await button(app, 'Försök igen')();
  await app.flush();
  assert.equal(nodes(app.tree, 'FlatList')[0].props.data[0].id, movie.id);
});

test('genrelistans laddning och fel har kvar sitt återförsök', async () => {
  const app = screen('screens/SearchScreen');
  let fail;
  app.api.getMovieGenres = () => new Promise((_resolve, reject) => { fail = reject; });
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  assert.equal(nodes(app.tree, 'ActivityIndicator')[0].props.accessibilityLabel, 'Hämtar genrer');
  fail(new Error('Kunde inte hämta genrer'));
  await app.flush();
  assert.ok(text(nodes(app.tree, 'FlatList')[0].props.ListHeaderComponent).includes('Kunde inte hämta genrer'));
  app.api.getMovieGenres = async () => [{ id: 35, name: 'Komedi' }];
  button(app, 'Försök hämta genrer igen')();
  await app.flush();
  button(app, 'Komedi');
  assert.equal(nodes(app.tree, 'ActivityIndicator').length, 0);
});

test('sena titelsvar och fel får inte skriva över resultat från ett nytt sökläge', async () => {
  for (const fail of [false, true]) {
    const app = screen('screens/SearchScreen');
    let resolve, reject, signal;
    app.api.searchMovies = (_query, _page, options) => {
      signal = options.signal;
      return new Promise((success, failure) => { resolve = success; reject = failure; });
    };
    app.api.discoverMovies = async () => ({ page: 1, total_pages: 1, results: [{ ...movie, id: 155 }] });
    await app.flush();
    nodes(app.tree, 'TextInput')[0].props.onChangeText('Batman');
    await app.flush();
    const pending = button(app, 'Sök')();
    button(app, 'Utforska filmer')();
    await app.flush();
    button(app, 'Alla')();
    await app.advance(300);
    assert.equal(signal.aborted, true);
    if (fail) reject(new Error('Gammalt fel'));
    else resolve({ page: 1, total_pages: 1, results: [movie] });
    await pending;
    await app.flush();
    assert.equal(nodes(app.tree, 'FlatList')[0].props.data[0].id, 155);
    assert.equal(text(nodes(app.tree, 'FlatList')[0].props.ListEmptyComponent).includes('Gammalt fel'), false);
  }
});

test('genrebyte avbryter förra hämtningen och sena svar påverkar inte nya filmer', async () => {
  const app = screen('screens/SearchScreen');
  const signals = [], responses = [];
  app.api.discoverMovies = (_filters, options) => {
    signals.push(options.signal);
    return new Promise(resolve => responses.push(resolve));
  };
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  button(app, 'Skräck')();
  await app.advance(300);
  button(app, 'Action')();
  assert.equal(signals[0].aborted, true);
  await app.advance(300);
  responses[1]({ page: 1, total_pages: 1, results: [{ ...movie, id: 155 }] });
  await app.flush();
  responses[0]({ page: 1, total_pages: 1, results: [movie] });
  await app.flush();
  assert.equal(nodes(app.tree, 'FlatList')[0].props.data[0].id, 155);
});

test('Rensa filter, lägesbyte och avmontering stoppar väntande genreanrop', async () => {
  const app = screen('screens/SearchScreen');
  let calls = 0;
  app.api.discoverMovies = async () => { calls++; return { page: 1, total_pages: 1, results: [] }; };
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  button(app, 'Skräck')();
  await app.flush();
  button(app, 'Filter')();
  await app.flush();
  button(app, 'Rensa filter')();
  button(app, 'Stäng')();
  await app.flush();
  await app.advance(300);
  assert.equal(calls, 0);
  button(app, 'Action')();
  await app.flush();
  button(app, 'Sök titel')();
  await app.flush();
  await app.advance(300);
  assert.equal(calls, 0);
  button(app, 'Utforska filmer')();
  await app.flush();
  button(app, 'Skräck')();
  app.unmount();
  await app.advance(300);
  assert.equal(calls, 0);
});

test('blur stänger panelen och avbryter både genrer och pågående filmhämtning', async () => {
  const app = screen('screens/SearchScreen');
  let genreSignal, genreReply, movieSignal, movieReply;
  app.api.getMovieGenres = options => {
    genreSignal = options.signal;
    return new Promise(resolve => { genreReply = resolve; });
  };
  app.api.discoverMovies = (_filters, options) => {
    movieSignal = options.signal;
    return new Promise(resolve => { movieReply = resolve; });
  };
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  button(app, 'Alla')();
  await app.advance(300);
  button(app, 'Filter')();
  await app.flush();
  app.focus(false);
  await app.flush();
  assert.equal(genreSignal.aborted, true);
  assert.equal(movieSignal.aborted, true);
  assert.equal(nodes(app.tree, 'Modal').length, 0);
  genreReply([{ id: 35, name: 'Gammal genre' }]);
  movieReply({ page: 1, total_pages: 1, results: [movie] });
  await app.flush();
  assert.equal(nodes(app.tree, 'FlatList')[0].props.data.length, 0);
});

function filmPage(page, results = [movie], totalPages = 3) {
  return { page, total_pages: totalPages, total_results: totalPages * 20, results };
}

function movieList(app) {
  return nodes(app.tree, 'FlatList')[0].props.data;
}

async function searchTitle(app, title = 'Batman') {
  nodes(app.tree, 'TextInput')[0].props.onChangeText(title);
  await app.flush();
  await button(app, 'Sök')();
  await app.flush();
}

for (const name of ['HomeScreen', 'SearchScreen']) {
  test(name + ' börjar på sida ett och lägger till unika filmer i rätt ordning', async () => {
    const app = screen('screens/' + name);
    const pages = [];
    const load = async page => {
      pages.push(page);
      if (page === 1) return filmPage(1, [movie, movie, null]);
      return filmPage(page, [movie, { ...movie, id: 155 }, undefined, { id: -1 }], 2);
    };
    app.api.getPopularMovies = load;
    app.api.searchMovies = (_query, page) => load(page);
    await app.flush();
    if (name === 'SearchScreen') await searchTitle(app);
    assert.deepEqual(pages, [1]);
    assert.deepEqual(movieList(app).map(item => item.id), [550]);
    const press = nodes(app.tree, 'Pressable').find(node => text(node).trim() === 'Ladda fler');
    assert.equal(press.props.accessibilityRole, 'button');
    assert.equal(press.props.accessibilityState.disabled, false);
    await press.props.onPress();
    await app.flush();
    assert.deepEqual(pages, [1, 2]);
    assert.deepEqual(movieList(app).map(item => item.id), [550, 155]);
    assert.equal(nodes(app.tree, 'Pressable').some(node => text(node).trim() === 'Ladda fler'), false);
  });

  test(name + ' behåller filmer vid laddning och fel, spärrar dubbeltryck och försöker samma sida igen', async () => {
    const app = screen('screens/' + name);
    const pages = [];
    let reject, resolve;
    const load = page => {
      pages.push(page);
      if (page === 1) return Promise.resolve(filmPage(1));
      return new Promise((success, failure) => { resolve = success; reject = failure; });
    };
    app.api.getPopularMovies = load;
    app.api.searchMovies = (_query, page) => load(page);
    await app.flush();
    if (name === 'SearchScreen') await searchTitle(app);
    const more = button(app, 'Ladda fler');
    more();
    more();
    await app.flush();
    assert.deepEqual(pages, [1, 2]);
    assert.equal(movieList(app).length, 1);
    const footer = nodes(app.tree, 'FlatList')[0].props.ListFooterComponent;
    assert.equal(nodes(footer, 'ActivityIndicator')[0].props.accessibilityLabel, 'Hämtar fler filmer');
    assert.equal(nodes(footer, 'Pressable')[0].props.disabled, true);
    reject(new Error('Tillfälligt nätverksfel'));
    await app.flush();
    assert.equal(movieList(app).length, 1);
    assert.ok(text(nodes(app.tree, 'FlatList')[0].props.ListFooterComponent).includes('Kunde inte ladda fler filmer'));
    button(app, 'Ladda fler')();
    resolve(filmPage(2, [{ ...movie, id: 155 }], 2));
    await app.flush();
    assert.deepEqual(pages, [1, 2, 2]);
    assert.deepEqual(movieList(app).map(item => item.id), [550, 155]);
    assert.equal(text(nodes(app.tree, 'FlatList')[0].props.ListFooterComponent).includes('Tillfälligt'), false);
  });

  test(name + ' stannar på sida 500 även om TMDB anger fler sidor', async () => {
    const app = screen('screens/' + name);
    const pages = [];
    const load = async page => { pages.push(page); return filmPage(page, [movie], 700); };
    app.api.getPopularMovies = load;
    app.api.searchMovies = (_query, page) => load(page);
    await app.flush();
    if (name === 'SearchScreen') await searchTitle(app);
    for (let page = 2; page <= 500; page++) {
      await button(app, 'Ladda fler')();
      await app.flush();
    }
    assert.equal(pages.length, 500);
    assert.equal(pages.at(-1), 500);
    assert.equal(movieList(app).length, 1);
    assert.equal(nodes(app.tree, 'Pressable').some(node => text(node).trim() === 'Ladda fler'), false);
  });

  for (const leave of ['blur', 'unmount']) {
    test(name + ' avbryter nästa sida vid ' + leave + ' och ignorerar sena svar och fel', async () => {
      for (const fail of [false, true]) {
        const app = screen('screens/' + name);
        let signal, resolve, reject;
        const load = (page, options) => {
          if (page === 1) return Promise.resolve(filmPage(1));
          signal = options.signal;
          return new Promise((success, failure) => { resolve = success; reject = failure; });
        };
        app.api.getPopularMovies = load;
        app.api.searchMovies = (_query, page, options) => load(page, options);
        await app.flush();
        if (name === 'SearchScreen') await searchTitle(app);
        button(app, 'Ladda fler')();
        await app.flush();
        if (leave === 'blur') {
          app.focus(false);
          await app.flush();
        } else app.unmount();
        assert.equal(signal.aborted, true);
        if (fail) reject(new Error('Gammalt fel'));
        else resolve(filmPage(2, [{ ...movie, id: 155 }]));
        await app.flush();
        assert.deepEqual(movieList(app).map(item => item.id), [550]);
        assert.equal(text(nodes(app.tree, 'FlatList')[0].props.ListFooterComponent).includes('Gammalt fel'), false);
        if (leave === 'blur') {
          app.focus(true);
          await app.flush();
          button(app, 'Ladda fler');
        }
      }
    });
  }
}

test('Hem har kvar återförsök på första sidan och tomresultat utan Ladda fler', async () => {
  const app = screen('screens/HomeScreen');
  app.api.getPopularMovies = async () => { throw new Error('Kunde inte hämta filmer'); };
  await app.flush();
  assert.ok(text(app.tree).includes('Kunde inte hämta filmer'));
  app.api.getPopularMovies = async () => filmPage(1, [], 0);
  nodes(app.tree, 'Button')[0].props.onPress();
  await app.flush();
  assert.equal(movieList(app).length, 0);
  assert.equal(nodes(app.tree, 'Pressable').length, 0);
});

test('titelsökning använder listans sökord och ny sökning återställer sida ett', async () => {
  const app = screen('screens/SearchScreen');
  const calls = [];
  app.api.searchMovies = async (query, page) => {
    calls.push([query, page]);
    return filmPage(page, [{ ...movie, id: query === 'Batman' ? page : 100 + page }]);
  };
  await app.flush();
  await searchTitle(app);
  nodes(app.tree, 'TextInput')[0].props.onChangeText('Avatar');
  await app.flush();
  await button(app, 'Ladda fler')();
  await app.flush();
  assert.deepEqual(calls[1], ['Batman', 2]);
  await button(app, 'Sök')();
  await app.flush();
  assert.deepEqual(calls[2], ['Avatar', 1]);
  assert.deepEqual(movieList(app).map(item => item.id), [101]);
  await button(app, 'Ladda fler')();
  await app.flush();
  assert.deepEqual(calls[3], ['Avatar', 2]);
});

test('Discover paginerar med tillämpade filter, ignorerar panelutkast och återställer vid nya filter och genre', async () => {
  const app = screen('screens/SearchScreen');
  const calls = [];
  app.api.discoverMovies = async filters => {
    calls.push({ ...filters });
    return filmPage(filters.page || 1, [{ ...movie, id: calls.length }], 5);
  };
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  button(app, 'Skräck')();
  await app.advance(300);
  button(app, 'Filter')();
  await app.flush();
  nodes(app.tree, 'TextInput')[0].props.onChangeText('2020');
  button(app, '7+')();
  button(app, 'Högst betyg')();
  await app.flush();
  button(app, 'Visa filmer')();
  await app.flush();
  await button(app, 'Ladda fler')();
  await app.flush();
  assert.deepEqual(calls.at(-1), { genre: 27, year: 2020, minRating: 7, sortBy: 'rating', page: 2 });
  button(app, 'Filter')();
  await app.flush();
  nodes(app.tree, 'TextInput')[0].props.onChangeText('2025');
  button(app, '9+')();
  button(app, 'Äldsta')();
  await app.flush();
  nodes(app.tree, 'Modal')[0].props.onRequestClose();
  await app.flush();
  await button(app, 'Ladda fler')();
  await app.flush();
  assert.deepEqual(calls.at(-1), { genre: 27, year: 2020, minRating: 7, sortBy: 'rating', page: 3 });
  button(app, 'Filter')();
  await app.flush();
  nodes(app.tree, 'TextInput')[0].props.onChangeText('2021');
  await app.flush();
  button(app, 'Visa filmer')();
  await app.flush();
  assert.equal(calls.at(-1).page, undefined);
  assert.equal(calls.at(-1).year, 2021);
  assert.equal(movieList(app).length, 1);
  await button(app, 'Ladda fler')();
  await app.flush();
  assert.equal(calls.at(-1).page, 2);
  button(app, 'Action')();
  await app.advance(300);
  assert.equal(calls.at(-1).page, undefined);
  assert.equal(calls.at(-1).genre, 28);
  assert.equal(calls.at(-1).year, 2021);
  assert.equal(movieList(app).length, 1);
});

for (const change of ['mode', 'title', 'genre', 'filters', 'reset']) {
  test('sena svar och fel från Ladda fler ignoreras efter ' + change, async () => {
    for (const fail of [false, true]) {
      const app = screen('screens/SearchScreen');
      const discover = ['genre', 'filters', 'reset'].includes(change);
      let signal, resolve, reject;
      const load = (page, options) => {
        if (page === 1) return Promise.resolve(filmPage(1));
        signal = options.signal;
        return new Promise((success, failure) => { resolve = success; reject = failure; });
      };
      app.api.searchMovies = (_query, page, options) => load(page, options);
      app.api.discoverMovies = (filters, options) => load(filters.page || 1, options);
      await app.flush();
      if (discover) {
        button(app, 'Utforska filmer')();
        await app.flush();
        button(app, 'Skräck')();
        await app.advance(300);
      } else await searchTitle(app);
      button(app, 'Ladda fler')();
      await app.flush();
      if (change === 'mode') {
        button(app, 'Utforska filmer')();
      } else if (change === 'title') {
        await searchTitle(app, 'Avatar');
      } else if (change === 'genre') {
        button(app, 'Action')();
        await app.advance(300);
      } else {
        button(app, 'Filter')();
        await app.flush();
        if (change === 'reset') button(app, 'Rensa filter')();
        else {
          nodes(app.tree, 'TextInput')[0].props.onChangeText('2020');
          await app.flush();
          button(app, 'Visa filmer')();
        }
      }
      await app.flush();
      assert.equal(signal.aborted, true);
      if (fail) reject(new Error('Gammalt fel'));
      else resolve(filmPage(2, [{ ...movie, id: 999 }]));
      await app.flush();
      assert.equal(movieList(app).some(item => item.id === 999), false);
      assert.equal(text(nodes(app.tree, 'FlatList')[0].props.ListFooterComponent).includes('Gammalt fel'), false);
    }
  });
}


test('Discover behåller listan vid fel och dubbeltryck, försöker samma sida och döljer knappen efter sista sidan', async () => {
  const app = screen('screens/SearchScreen');
  const pages = [];
  let resolve, reject;
  app.api.discoverMovies = filters => {
    const page = filters.page || 1;
    pages.push(page);
    if (page === 1) return Promise.resolve(filmPage(1, [movie], 2));
    return new Promise((success, failure) => { resolve = success; reject = failure; });
  };
  await app.flush();
  button(app, 'Utforska filmer')();
  await app.flush();
  button(app, 'Alla')();
  await app.advance(300);
  const more = button(app, 'Ladda fler');
  more();
  more();
  await app.flush();
  assert.deepEqual(pages, [1, 2]);
  assert.equal(movieList(app).length, 1);
  reject(new Error('Tillfälligt fel'));
  await app.flush();
  assert.equal(movieList(app).length, 1);
  button(app, 'Ladda fler')();
  resolve(filmPage(2, [{ ...movie, id: 155 }], 2));
  await app.flush();
  assert.deepEqual(pages, [1, 2, 2]);
  assert.deepEqual(movieList(app).map(item => item.id), [550, 155]);
  assert.equal(nodes(app.tree, 'Pressable').some(node => text(node).trim() === 'Ladda fler'), false);
});

test('ett ogiltigt svars sidnummer avvisas utan att flytta listan eller sidräknaren', async t => {
  const previousUrl = process.env.EXPO_PUBLIC_API_URL;
  process.env.EXPO_PUBLIC_API_URL = 'http://isolated.test/api';
  let reply = filmPage(1);
  const pages = [];
  // Kör även den riktiga API-kontrollen, men ersätter nätverket helt.
  t.mock.method(globalThis, 'fetch', async url => {
    pages.push(Number(new URL(url).searchParams.get('page')));
    return Response.json(reply);
  });
  try {
    const app = screen('screens/HomeScreen');
    app.api.getPopularMovies = getPopularMovies;
    await app.flush();
    reply = filmPage(3, [{ ...movie, id: 999 }]);
    button(app, 'Ladda fler')();
    await app.flush();
    assert.deepEqual(movieList(app).map(item => item.id), [550]);
    assert.ok(text(nodes(app.tree, 'FlatList')[0].props.ListFooterComponent).includes('ogiltig filmlista'));
    reply = filmPage(2, [{ ...movie, id: 155 }]);
    button(app, 'Ladda fler')();
    await app.flush();
    assert.deepEqual(pages, [1, 2, 2]);
    assert.deepEqual(movieList(app).map(item => item.id), [550, 155]);
  } finally {
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previousUrl;
  }
});
