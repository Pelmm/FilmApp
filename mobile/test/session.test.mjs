import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parse } = require('../node_modules/@babel/parser');
const { transformSync } = require('../node_modules/@babel/core');
const jsx = require('../node_modules/@babel/plugin-transform-react-jsx');
const key = 'filmapp.session';
const user = { id: 'test-id', username: 'Testperson', email: 'test@example.com' };

// Kör den riktiga Context-koden med isolerade React-, nätverks- och lagringsdubblar.
// Ingen simulator, enhetslagring eller Atlas-databas används av testerna.
function loadComponent(file, name, scope) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const body = ast.program.body.filter(node => node.type !== 'ImportDeclaration').map(node => {
    if (node.type.startsWith('Export')) node = node.declaration;
    return source.slice(node.start, node.end);
  }).join('\n');
  const code = transformSync(body, { configFile: false, babelrc: false, plugins: [jsx] }).code;
  const context = vm.createContext(scope);
  vm.runInContext(code, context);
  return context[name];
}

const React = {
  Fragment: 'Fragment',
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
};

function sessionApp(stored) {
  let now = Date.now();
  const data = {
    token: randomBytes(32).toString('hex'),
    expiresAt: new Date(now + 3600000).toISOString(),
    expiresIn: 3600,
    user,
  };
  const values = new Map();
  if (stored) values.set(key, stored);
  const storage = {
    getItemAsync: async name => values.get(name) || null,
    setItemAsync: async (name, value) => { values.set(name, value); },
    deleteItemAsync: async name => { values.delete(name); },
  };
  const api = {
    loginUser: async () => data,
    getCurrentUser: async () => user,
  };
  const hooks = [];
  const timers = new Map();
  const listeners = new Set();
  let index = 0;
  let dirty = true;
  let root;
  let timerId = 0;
  let pendingEffects = [];
  const Provider = loadComponent('../src/context/AuthContext.js', 'AuthProvider', {
    React,
    createContext: () => ({ Provider: 'Provider' }),
    useState(initial) {
      const position = index++;
      if (!(position in hooks)) hooks[position] = initial;
      return [hooks[position], value => {
        hooks[position] = typeof value === 'function' ? value(hooks[position]) : value;
        dirty = true;
      }];
    },
    useRef(initial) {
      const position = index++;
      if (!(position in hooks)) hooks[position] = { current: initial };
      return hooks[position];
    },
    useEffect(callback, dependencies) {
      const position = index++;
      const previous = hooks[position];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          hooks[position] = { dependencies, cleanup: callback() };
        });
      }
    },
    SecureStore: storage,
    loginUser: (...args) => api.loginUser(...args),
    getCurrentUser: (...args) => api.getCurrentUser(...args),
    AbortController,
    Date: { now: () => now, parse: Date.parse },
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    AppState: {
      addEventListener(_event, callback) {
        listeners.add(callback);
        return { remove: () => listeners.delete(callback) };
      },
    },
  });

  function render() {
    index = 0;
    dirty = false;
    root = Provider({ children: 'AppNavigator' });
    const effects = pendingEffects;
    pendingEffects = [];
    effects.forEach(effect => effect());
  }
  render();

  return {
    data, values, storage, api,
    get value() { return root.props.value; },
    async flush() {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
        if (dirty) render();
      }
    },
    async advance(milliseconds, foreground = false) {
      now += milliseconds;
      if (foreground) {
        for (const listener of listeners) listener('active');
      } else {
        for (const [id, timer] of timers) {
          if (timer.due <= now) {
            timers.delete(id);
            await timer.callback();
          }
        }
      }
      await this.flush();
    },
  };
}

async function signedInApp() {
  const app = sessionApp();
  await app.flush();
  await app.value.signIn({ email: user.email, password: 'Testpassword123!' });
  await app.flush();
  return app;
}

test('utan sparad session blir appen utloggad efter återställningen', async () => {
  const app = sessionApp();
  assert.equal(app.value.restoring, true);
  await app.flush();
  assert.equal(app.value.restoring, false);
  assert.equal(app.value.isAuthenticated, false);
  assert.equal(app.value.token, null);
});

test('lyckad inloggning sparar token och utgångstid enbart i SecureStore', async () => {
  const app = await signedInApp();
  const saved = JSON.parse(app.values.get(key));
  assert.deepEqual(saved, { token: app.data.token, expiresAt: app.data.expiresAt });
  assert.equal(app.value.token, app.data.token);
  assert.equal(app.value.user.username, user.username);
  assert.equal(app.value.isAuthenticated, true);
});

test('återställning verifierar token mot backend och hämtar aktuell användare', async () => {
  const first = await signedInApp();
  const app = sessionApp(first.values.get(key));
  let checked = false;
  app.api.getCurrentUser = async token => {
    assert.equal(token, first.data.token);
    checked = true;
    return { ...user, username: 'Uppdaterat namn' };
  };
  await app.flush();
  assert.equal(checked, true);
  assert.equal(app.value.user.username, 'Uppdaterat namn');
  assert.equal(app.value.isAuthenticated, true);
});

test('trasiga och utgångna poster tas bort utan att användaren blir autentiserad', async () => {
  for (const stored of ['not-json', '{}', JSON.stringify({
    token: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() - 10000).toISOString(),
  })]) {
    const app = sessionApp(stored);
    await app.flush();
    assert.equal(app.value.isAuthenticated, false);
    assert.equal(app.values.has(key), false);
    assert.ok(app.value.message.includes('Logga in igen'));
  }
});

test('401 tar bort sparad token och visar ett begripligt meddelande', async () => {
  const first = await signedInApp();
  const app = sessionApp(first.values.get(key));
  app.api.getCurrentUser = async () => {
    const error = new Error('Invalid session');
    error.status = 401;
    throw error;
  };
  await app.flush();
  assert.equal(app.values.has(key), false);
  assert.equal(app.value.isAuthenticated, false);
  assert.ok(app.value.message.includes('Logga in igen'));
});

test('nätverksfel behåller token och återförsök kan återställa sessionen', async () => {
  const first = await signedInApp();
  const stored = first.values.get(key);
  const app = sessionApp(stored);
  app.api.getCurrentUser = async () => { throw new Error('Offline'); };
  await app.flush();
  assert.equal(app.values.get(key), stored);
  assert.equal(app.value.canRetry, true);
  assert.equal(app.value.restoring, false);
  app.api.getCurrentUser = async () => user;
  app.value.retryRestore();
  await app.flush();
  assert.equal(app.value.isAuthenticated, true);
  assert.equal(app.value.message, '');
});

test('utloggning raderar lagrad token och gemensam sessionsstatus', async () => {
  const app = await signedInApp();
  await app.value.signOut();
  await app.flush();
  assert.equal(app.values.has(key), false);
  assert.equal(app.value.user, null);
  assert.equal(app.value.token, null);
  assert.equal(app.value.isAuthenticated, false);
});

test('lagringsfel exponeras inte och ger ingen falsk lyckad inloggning eller utloggning', async () => {
  const app = sessionApp();
  await app.flush();
  app.storage.setItemAsync = async () => { throw new Error(app.data.token); };
  await assert.rejects(app.value.signIn({}), { message: 'Kunde inte spara inloggningen säkert. Försök igen.' });
  await app.flush();
  assert.equal(app.value.isAuthenticated, false);
  const loggedIn = await signedInApp();
  loggedIn.storage.deleteItemAsync = async () => { throw new Error(loggedIn.data.token); };
  await assert.rejects(loggedIn.value.signOut(), { message: 'Kunde inte logga ut säkert. Försök igen.' });
  await loggedIn.flush();
  assert.equal(loggedIn.value.isAuthenticated, true);
});

test('utgångstid loggar ut i förgrunden och vid återgång från bakgrunden', async () => {
  for (const foreground of [false, true]) {
    const app = await signedInApp();
    await app.advance(3600001, foreground);
    assert.equal(app.value.isAuthenticated, false);
    assert.equal(app.value.token, null);
    assert.equal(app.values.has(key), false);
    assert.ok(app.value.message.includes('gått ut'));
  }
});

test('avbruten inloggning aktiverar eller sparar ingen session', async () => {
  const app = sessionApp();
  await app.flush();
  const controller = new AbortController();
  app.api.loginUser = async () => { controller.abort(); return app.data; };
  await app.value.signIn({}, { signal: controller.signal });
  await app.flush();
  assert.equal(app.value.isAuthenticated, false);
  assert.equal(app.values.has(key), false);
});

test('avbrytning under SecureStore-skrivningen raderar posten innan en ny inloggning kan starta', async () => {
  const app = sessionApp();
  await app.flush();
  const controller = new AbortController();
  app.storage.setItemAsync = async (name, value) => {
    app.values.set(name, value);
    controller.abort();
  };
  await app.value.signIn({}, { signal: controller.signal });
  await app.flush();
  assert.equal(app.value.isAuthenticated, false);
  assert.equal(app.values.has(key), false);
});

test('återställning och dubbel inloggning startar inte parallellt med ett inloggningsanrop', async () => {
  const app = sessionApp();
  await app.flush();
  let respond;
  app.api.loginUser = () => new Promise(resolve => { respond = resolve; });
  const pending = app.value.signIn({});
  app.value.retryRestore();
  await assert.rejects(app.value.signIn({}), { message: 'En sessionsåtgärd pågår. Försök igen.' });
  respond(app.data);
  await pending;
  await app.flush();
  assert.equal(app.value.isAuthenticated, true);
  assert.equal(app.values.has(key), true);
});

function renderNavigator(isAuthenticated) {
  const destinations = [];
  const scope = {
    React,
    useContext: () => ({ isAuthenticated, restoring: false, message: '', canRetry: false }),
    AuthContext: {},
    useState: initial => [initial, () => {}],
    useNavigationContainerRef: () => ({
      isReady: () => true,
      navigate: name => destinations.push(name),
    }),
    createNativeStackNavigator: () => ({ Navigator: 'Stack', Screen: 'Screen' }),
    StyleSheet: { create: value => value },
    globalStyles: {}, colors: {}, fonts: { sizes: {}, weights: {} },
  };
  for (const name of ['Pressable', 'ActivityIndicator', 'Text', 'View', 'SafeAreaView', 'NavigationContainer',
    'HomeScreen', 'SearchScreen', 'MovieDetailsScreen', 'LoginScreen', 'RegisterScreen', 'MyReviewsScreen']) scope[name] = name;
  const Navigator = loadComponent('../src/navigation/AppNavigator.js', 'AppNavigator', scope);
  const tree = Navigator();
  const screens = [], buttons = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.type === 'Screen') screens.push(node.props.name);
    if (node.type === 'Pressable') buttons.push(node);
    walk(node.children);
  }
  walk(tree);
  buttons.at(-1).props.onPress();
  return { screens, destinations };
}

test('navigationen skyddar Mina recensioner och håller filmvyerna offentliga', () => {
  const guest = renderNavigator(false);
  const member = renderNavigator(true);
  assert.equal(guest.screens.includes('MyReviews'), false);
  assert.equal(member.screens.includes('MyReviews'), true);
  assert.equal(member.screens.includes('Login'), false);
  assert.equal(guest.destinations[0], 'Login');
  assert.equal(member.destinations[0], 'MyReviews');
  for (const name of ['Home', 'Search', 'MovieDetails']) {
    assert.equal(guest.screens.includes(name), true);
    assert.equal(member.screens.includes(name), true);
  }
  assert.equal(renderNavigator(false).screens.includes('MyReviews'), false);
});
