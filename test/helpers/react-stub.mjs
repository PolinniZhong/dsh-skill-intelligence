/**
 * Stand-ins for the modules the DSH web shell seeds into the client module table.
 *
 * The client bundle is loaded by the real shell with only these nine modules
 * provided, so the tests must load it the same way — with a stub per seed word, and
 * a `require` that throws for anything else. Otherwise a passing test would prove
 * nothing about what the browser can resolve.
 *
 * The React stub is deliberately wide: third-party renderers (React Flow) call
 * `forwardRef`, `memo`, `createContext` and friends at module init, before any of
 * our code runs.
 */

const passthrough = (value) => value

function reactStub() {
  return {
    createElement: (type, props, ...children) => ({ type, props, children }),
    Fragment: Symbol.for('react.fragment'),
    Children: { map: (children) => [], toArray: () => [], count: () => 0 },
    cloneElement: passthrough,
    isValidElement: () => false,
    createContext: (initial) => ({ Provider: passthrough, Consumer: passthrough, _currentValue: initial }),
    useContext: () => ({}),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useReducer: (_reducer, initial) => [initial, () => {}],
    useEffect: () => {},
    useLayoutEffect: () => {},
    useInsertionEffect: () => {},
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
    useRef: (initial) => ({ current: initial }),
    useId: () => ':r0:',
    useSyncExternalStore: (_subscribe, getSnapshot) => (typeof getSnapshot === 'function' ? getSnapshot() : undefined),
    useTransition: () => [false, (fn) => fn && fn()],
    startTransition: (fn) => fn && fn(),
    memo: passthrough,
    forwardRef: (render) => render,
    lazy: passthrough,
    StrictMode: 'StrictMode',
  }
}

function reactDomStub() {
  return { createPortal: passthrough, flushSync: (fn) => fn && fn(), version: '19.0.0' }
}

function jsxRuntimeStub() {
  return { jsx: () => ({}), jsxs: () => ({}), Fragment: Symbol.for('react.fragment') }
}

/**
 * A `require` for the client factory.
 *
 * @param required - optional array the resolved specifiers are pushed onto.
 * @returns a require that resolves seed words and throws for anything else.
 */
export function seedRequire(required = []) {
  return (spec) => {
    required.push(spec)
    switch (spec) {
      case 'react':
        return reactStub()
      case 'react-dom':
        return reactDomStub()
      case 'react-dom/client':
        return { createRoot: () => ({ render() {}, unmount() {} }), hydrateRoot: () => ({ render() {}, unmount() {} }) }
      case 'react/jsx-runtime':
        return jsxRuntimeStub()
      default:
        throw new Error(`client-modules: cannot resolve "${spec}" in this test harness`)
    }
  }
}

/** The seed words this harness can satisfy. */
export const SEEDED = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]
