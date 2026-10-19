import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';
import { getReviewError } from '../src/services/api.js';
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
    getReviewError,
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
    colors: {}, fonts: { sizes: {}, weights: {} }, globalStyles: {},
  };
  for (const name of ['ActivityIndicator', 'Image', 'KeyboardAvoidingView', 'ScrollView',
    'FlatList', 'TextInput', 'Pressable', 'Text', 'View', 'ReviewCard']) scope[name] = name;
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
    auth, api, navigation, destinations, alerts,
    get tree() { return tree; },
    // Låter väntande löften och ändringar i testets skärm hinna köras klart.
    async flush() {
      for (let i = 0; i < 30; i++) {
        await Promise.resolve();
        if (dirty) render();
      }
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
  const found = nodes(app.tree, 'Pressable').find(node => text(node) === label);
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
