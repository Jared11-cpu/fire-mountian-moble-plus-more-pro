import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }),
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, 'ResizeObserver', { value: ResizeObserverMock });
class IntersectionObserverMock {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) { this.callback([{ isIntersecting: true, boundingClientRect: { bottom: 800 } } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
  unobserve() {}
  disconnect() {}
  root = null;
  rootMargin = '0px';
  thresholds = [0];
  takeRecords() { return []; }
}
Object.defineProperty(window, 'IntersectionObserver', { value: IntersectionObserverMock, writable: true });
Object.defineProperty(window, 'scrollTo', { value: () => undefined, writable: true });
Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => undefined, writable: true });
