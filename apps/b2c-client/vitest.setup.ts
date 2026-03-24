import '@testing-library/jest-dom';

// jsdom doesn't implement scrollIntoView — mock it globally
Element.prototype.scrollIntoView = () => {};
