import { useEffect, useLayoutEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

const easeOut = "cubic-bezier(.23,1,.32,1)";

export function useClinicNavigation({ scope, route, restoreRoute }) {
  const shell = useRef(null);
  const history = useRef({ scope, entries: [], current: null, restore: null });
  const gesture = useRef(null);
  const navigateBack = useRef(null);
  const routeKey = JSON.stringify(route);

  useLayoutEffect(() => {
    const state = history.current;
    const previous = state.current;
    if (state.scope !== scope) {
      state.scope = scope;
      state.entries = [];
      state.restore = null;
    }

    const returning = state.restore?.key === routeKey ? state.restore : null;
    const scopeChanged = previous?.scope !== scope;
    if (previous && !scopeChanged && previous.key !== routeKey && !returning) {
      state.entries = [...state.entries.slice(-29), previous];
    }
    state.restore = null;
    state.current = { key: routeKey, route, scope, scroll: returning?.scroll || 0 };
    if (!previous || previous.key === routeKey && !scopeChanged) return;

    const screenChanged = previous.route.screen !== route.screen;
    const scroller = shell.current?.querySelector(".screen > .scroll-area");
    if (scroller) scroller.scrollTop = state.current.scroll;
    const screen = shell.current?.querySelector(":scope > .screen");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const transform = returning?.direction === "down" ? "translateY(-12px)" :
      scopeChanged ? "translateY(7px)" : returning ? "translateX(-12px)" : "translateX(12px)";
    // Slide only the scrolling content. The screen (header, back button, tab bar) just fades,
    // so controls that look fixed stay exactly where they are.
    const motions = [];
    if (screenChanged && screen?.animate) motions.push(screen.animate([{ opacity: 0.56 }, { opacity: 1 }], { duration: 215, easing: easeOut }));
    if (scroller?.animate) motions.push(scroller.animate([{ opacity: screenChanged ? 1 : 0.56, transform }, { opacity: 1, transform: "none" }], { duration: 215, easing: easeOut }));
    return () => motions.forEach((m) => m.cancel());
  }, [scope, routeKey]);

  function goBack(direction = "right") {
    const state = history.current;
    if (state.scope !== scope || state.restore) return false;
    const entry = state.entries.pop();
    if (!entry) return false;
    state.restore = { ...entry, direction };
    restoreRoute(entry.route);
    return true;
  }
  navigateBack.current = goBack;

  function isEditing() {
    return Boolean(shell.current?.querySelector(".vt, [role='dialog'][aria-modal='true']"));
  }

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    const listener = App.addListener("backButton", () => {
      if (isEditing()) return;
      if (!navigateBack.current?.()) void App.minimizeApp().catch(() => {});
    });
    return () => { void listener.then((handle) => handle.remove()).catch(() => {}); };
  }, []);

  function onTouchStart(event) {
    gesture.current = null;
    if (event.touches.length !== 1 || !history.current.entries.length || isEditing()) return;
    const target = event.target;
    if (target.closest("input, textarea, select, [contenteditable], [role='dialog'], .bottom-nav")) return;
    const { clientX, clientY } = event.touches[0];
    const bounds = shell.current?.getBoundingClientRect();
    if (!bounds) return;
    const edge = clientX - bounds.left <= 22;
    const header = Boolean(target.closest(".app-header, .top-action"));
    if (edge || header) gesture.current = { clientX, clientY, edge, header };
  }

  function onTouchEnd(event) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || !event.changedTouches.length || isEditing()) return;
    const { clientX, clientY } = event.changedTouches[0];
    const x = clientX - start.clientX;
    const y = clientY - start.clientY;
    if (start.edge && x > 65 && x > Math.abs(y) * 1.5) goBack();
    if (start.header && y > 65 && y > Math.abs(x) * 1.5) goBack("down");
  }

  function onScrollCapture(event) {
    if (history.current.current && event.target.matches?.(".screen > .scroll-area")) {
      history.current.current.scroll = event.target.scrollTop;
    }
  }

  return {
    shell, goBack, onTouchStart, onTouchEnd, onScrollCapture,
    onTouchCancel: () => { gesture.current = null; }
  };
}
