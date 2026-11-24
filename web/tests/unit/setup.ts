import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

// jsdom has no layout: scrolling is a no-op here.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
