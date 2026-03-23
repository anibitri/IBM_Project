import '@testing-library/jest-dom';

// jsdom does not implement scrollIntoView — mock it globally
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Silence noisy console.error in test output (e.g. React prop-type warnings)
const originalError = console.error;
beforeEach(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning:') || args[0].includes('ReactDOM.render'))
    ) return;
    originalError(...args);
  };
});
afterEach(() => {
  console.error = originalError;
});
