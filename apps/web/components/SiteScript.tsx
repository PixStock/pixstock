"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Ports the static site's site.js almost verbatim: the interactive chrome
 * (sticky header, scroll reveals, the statement word-reveal, the round
 * timeline, theme toggle, the grouped nav menu, the marquee pacing and the
 * problem carousel) is DOM-imperative by design and doesn't buy anything by
 * being rewritten into React state — it operates on ids/classes that the JSX
 * below renders once per page. Re-runs on every route change since each page
 * mounts a fresh copy of this component.
 */
type A11yStrings = {
  themeToLight: string;
  themeToDark: string;
  slideOf: string;
};

export function SiteScript({ a11y }: { a11y: A11yStrings }) {
  const pathname = usePathname();

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    // 1 · header + spacer -------------------------------------------------
    (function chrome() {
      const head = document.getElementById("head");
      const spacer = document.getElementById("head-spacer");
      if (!head || !spacer) return;

      function measure() {
        const h = head!.offsetHeight + 22;
        spacer!.style.height = h + "px";
        document.documentElement.style.setProperty("--head-h", h + "px");
      }
      function onScroll() {
        if (window.scrollY > 8) head!.classList.add("stuck");
        else head!.classList.remove("stuck");
      }
      measure();
      onScroll();
      window.addEventListener("resize", measure);
      window.addEventListener("scroll", onScroll, { passive: true });
      cleanups.push(() => {
        window.removeEventListener("resize", measure);
        window.removeEventListener("scroll", onScroll);
      });
    })();

    // marquee pacing --------------------------------------------------------
    (function marquee() {
      const track = document.getElementById("mq-track");
      const set = document.getElementById("mq-set");
      if (!track || !set) return;

      function pace() {
        const w = set!.getBoundingClientRect().width;
        if (!w) return;
        const view = track!.parentElement!.getBoundingClientRect().width;
        const need = Math.max(2, Math.ceil(view / w) + 1);

        let have = track!.children.length;
        while (have < need) {
          const c = set!.cloneNode(true) as HTMLElement;
          c.removeAttribute("id");
          c.setAttribute("aria-hidden", "true");
          c.querySelectorAll("a").forEach((a) => ((a as HTMLAnchorElement).tabIndex = -1));
          track!.appendChild(c);
          have++;
        }
        while (have > need) {
          track!.removeChild(track!.lastElementChild!);
          have--;
        }

        track!.style.setProperty("--mq-w", w.toFixed(1) + "px");
        track!.style.setProperty("--mq", (w / 46).toFixed(1) + "s");
      }

      pace();
      window.addEventListener("resize", pace);
      cleanups.push(() => window.removeEventListener("resize", pace));
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(pace);
    })();

    // 2 · reveal on scroll ---------------------------------------------------
    (function reveal() {
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let items = Array.from(document.querySelectorAll<HTMLElement>(".appear"));
      const fills = Array.from(document.querySelectorAll<HTMLElement>(".bar .f"));

      function fill(f: HTMLElement) {
        f.style.width = f.getAttribute("data-w") + "%";
      }

      if (reduce || !("IntersectionObserver" in window)) {
        items.forEach((el) => el.classList.add("in"));
        fills.forEach(fill);
        return;
      }

      const hero = Array.from(document.querySelectorAll<HTMLElement>(".hero .appear"));
      if (hero.length) {
        items = items.filter((el) => hero.indexOf(el) < 0);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            hero.forEach((el) => el.classList.add("in"));
          });
        });
      }

      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            e.target.classList.add("in");
            e.target.querySelectorAll<HTMLElement>(".f").forEach(fill);
            io.unobserve(e.target);
          });
        },
        { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
      );
      items.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());

      const wm = document.querySelector<HTMLElement>("#wordmark .rise");
      const wordmarkEl = document.getElementById("wordmark");
      if (wm && wordmarkEl) {
        const wio = new IntersectionObserver(
          (es) => {
            es.forEach((e) => {
              if (e.isIntersecting) {
                wm.classList.add("up");
                wio.disconnect();
              }
            });
          },
          { threshold: 0.6 },
        );
        wio.observe(wordmarkEl);
        cleanups.push(() => wio.disconnect());
      }
    })();

    // 3 · the statement lights word by word ----------------------------------
    (function statement() {
      const host = document.getElementById("statement-copy");
      const section = document.getElementById("statement");
      if (!host || !section) return;

      const words = (host.textContent || "").trim().split(/\s+/);
      host.textContent = "";
      const spans = words.map((w, i) => {
        const s = document.createElement("span");
        s.className = "w";
        s.textContent = w;
        host.appendChild(s);
        if (i < words.length - 1) host.appendChild(document.createTextNode(" "));
        return s;
      });

      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        spans.forEach((s) => s.classList.add("on"));
        return;
      }

      let queued = false;
      function paint() {
        queued = false;
        const r = section!.getBoundingClientRect();
        const span = r.height + window.innerHeight * 0.65;
        let p = (window.innerHeight * 0.82 - r.top) / span;
        p = Math.max(0, Math.min(1, p)) * 1.5;
        const lit = Math.round(p * spans.length);
        for (let i = 0; i < spans.length; i++) {
          if (i < lit) spans[i].classList.add("on");
          else spans[i].classList.remove("on");
        }
      }
      function onScroll() {
        if (!queued) {
          queued = true;
          requestAnimationFrame(paint);
        }
      }
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      paint();
      cleanups.push(() => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      });
    })();

    // 4 · round timeline -------------------------------------------------------
    (function timeline() {
      const tl = document.getElementById("tl");
      const fillEl = document.getElementById("tl-fill");
      if (!tl || !fillEl) return;
      const steps = Array.from(tl.querySelectorAll<HTMLElement>(".tl-step"));
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reduce) {
        fillEl.style.width = "100%";
        steps.forEach((s) => s.classList.add("on"));
        return;
      }

      let queued = false;
      function paint() {
        queued = false;
        const r = tl!.getBoundingClientRect();
        let p = (window.innerHeight * 0.78 - r.top) / (r.height + window.innerHeight * 0.34);
        p = Math.max(0, Math.min(1, p));
        fillEl!.style.setProperty("--p", (p * 100).toFixed(2) + "%");
        steps.forEach((s, i) => {
          if (p >= (i + 0.15) / steps.length) s.classList.add("on");
          else s.classList.remove("on");
        });
      }
      function onScroll() {
        if (!queued) {
          queued = true;
          requestAnimationFrame(paint);
        }
      }
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      paint();
      cleanups.push(() => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      });
    })();

    // theme toggle --------------------------------------------------------------
    (function theme() {
      const btn = document.getElementById("theme");
      if (!btn) return;

      function label() {
        const light = document.documentElement.classList.contains("light");
        btn!.setAttribute("aria-label", light ? a11y.themeToDark : a11y.themeToLight);
        btn!.setAttribute("aria-pressed", light ? "true" : "false");
      }
      label();

      function onClick() {
        const light = document.documentElement.classList.toggle("light");
        try {
          localStorage.setItem("df-theme", light ? "light" : "dark");
        } catch {
          /* private mode / storage disabled: theme just won't persist */
        }
        label();
        window.dispatchEvent(new Event("df:theme"));
      }
      btn.addEventListener("click", onClick);
      cleanups.push(() => btn.removeEventListener("click", onClick));
    })();

    // grouped nav menu ------------------------------------------------------------
    (function navGroup() {
      const groups = Array.from(document.querySelectorAll<HTMLElement>(".nav-group"));
      if (!groups.length) return;

      function close(g: HTMLElement) {
        g.removeAttribute("data-open");
        g.querySelector("button")?.setAttribute("aria-expanded", "false");
      }
      function open(g: HTMLElement) {
        groups.forEach(close);
        g.setAttribute("data-open", "");
        g.querySelector("button")?.setAttribute("aria-expanded", "true");
      }

      const teardowns: Array<() => void> = [];
      groups.forEach((g) => {
        const btn = g.querySelector("button");
        if (!btn) return;
        let hovering = false;
        btn.setAttribute("aria-expanded", "false");

        const onClick = (e: Event) => {
          e.stopPropagation();
          if (hovering) return;
          if (g.hasAttribute("data-open")) close(g);
          else open(g);
        };
        const onEnter = () => {
          hovering = true;
          open(g);
        };
        const onLeave = () => {
          hovering = false;
          close(g);
        };
        const onFocusIn = () => open(g);
        const onFocusOut = (e: FocusEvent) => {
          if (!g.contains(e.relatedTarget as Node)) close(g);
        };

        btn.addEventListener("click", onClick);
        g.addEventListener("mouseenter", onEnter);
        g.addEventListener("mouseleave", onLeave);
        g.addEventListener("focusin", onFocusIn);
        g.addEventListener("focusout", onFocusOut as EventListener);
        teardowns.push(() => {
          btn.removeEventListener("click", onClick);
          g.removeEventListener("mouseenter", onEnter);
          g.removeEventListener("mouseleave", onLeave);
          g.removeEventListener("focusin", onFocusIn);
          g.removeEventListener("focusout", onFocusOut as EventListener);
        });
      });

      const onDocClick = () => groups.forEach(close);
      const onKeydown = (e: KeyboardEvent) => {
        if (e.key === "Escape") groups.forEach(close);
      };
      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onKeydown);
      cleanups.push(() => {
        teardowns.forEach((t) => t());
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onKeydown);
      });
    })();

    // the problem carousel -------------------------------------------------------------
    (function carousel() {
      const rail = document.getElementById("car-rail") as HTMLElement | null;
      const track = document.getElementById("car-track") as HTMLElement | null;
      if (!rail || !track) return;

      const real = Array.from(track.children) as HTMLElement[];
      const N = real.length;
      if (!N) return;

      function copy(node: HTMLElement) {
        const c = node.cloneNode(true) as HTMLElement;
        c.setAttribute("aria-hidden", "true");
        return c;
      }
      real.map(copy).forEach((n) => track!.appendChild(n));
      real
        .map(copy)
        .reverse()
        .forEach((n) => track!.insertBefore(n, track!.firstChild));

      const slides = Array.from(track.children) as HTMLElement[];
      const dotsBox = document.getElementById("car-dots");
      const prev = document.getElementById("car-prev");
      const next = document.getElementById("car-next");
      if (!dotsBox || !prev || !next) return;
      const GAP = 24;
      let v = N,
        sw = 0,
        seen = false,
        dragged = false;

      function live() {
        return (((v - N) % N) + N) % N;
      }
      function offset() {
        return (rail!.clientWidth - sw) / 2 - v * (sw + GAP);
      }

      const dots = real.map((_, k) => {
        const b = document.createElement("button");
        b.className = "car-dot";
        b.type = "button";
        b.setAttribute("aria-label", a11y.slideOf.replace("{current}", String(k + 1)).replace("{total}", String(N)));
        b.addEventListener("click", () => go(v + (((k - live() + N) % N))));
        dotsBox!.appendChild(b);
        return b;
      });

      function place(animate: boolean) {
        if (!animate) track!.style.transition = "none";
        track!.style.transform = "translate3d(" + offset() + "px,0,0)";
        if (!animate) requestAnimationFrame(() => (track!.style.transition = ""));
        slides.forEach((s, k) => s.classList.toggle("is-on", seen && k === v));
        const at = live();
        dots.forEach((d, k) => d.setAttribute("aria-current", k === at ? "true" : "false"));
      }

      function measure() {
        const r = rail!.clientWidth;
        const peek = r < 700 ? 26 : 76;
        sw = Math.min(1040, Math.max(240, r - peek * 2));
        track!.style.setProperty("--sw", sw + "px");
        place(false);
      }

      function go(k: number) {
        v = k;
        place(true);
      }

      function onTransitionEnd(e: TransitionEvent) {
        if (e.propertyName !== "transform") return;
        if (v >= 2 * N) {
          v -= N;
          place(false);
        } else if (v < N) {
          v += N;
          place(false);
        }
      }
      track.addEventListener("transitionend", onTransitionEnd);

      const onPrev = () => go(v - 1);
      const onNext = () => go(v + 1);
      prev.addEventListener("click", onPrev);
      next.addEventListener("click", onNext);

      const slideClicks: Array<[HTMLElement, () => void]> = [];
      slides.forEach((s, k) => {
        const handler = () => {
          if (!dragged && k !== v) go(k);
        };
        s.addEventListener("click", handler);
        slideClicks.push([s, handler]);
      });

      rail.tabIndex = 0;
      rail.setAttribute("aria-roledescription", "carousel");
      const onKeydown = (e: KeyboardEvent) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          go(v + 1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(v - 1);
        }
      };
      rail.addEventListener("keydown", onKeydown);

      let x0: number | null = null,
        base = 0;
      const onPointerDown = (e: PointerEvent) => {
        if (e.button) return;
        x0 = e.clientX;
        base = offset();
        dragged = false;
        track!.classList.add("is-drag");
        try {
          track!.setPointerCapture(e.pointerId);
        } catch {
          /* pointer capture unsupported: drag still tracks via move/up */
        }
      };
      const onPointerMove = (e: PointerEvent) => {
        if (x0 === null) return;
        const dx = e.clientX - x0;
        if (Math.abs(dx) > 4) dragged = true;
        track!.style.transform = "translate3d(" + (base + dx) + "px,0,0)";
      };
      const onPointerUp = (e: PointerEvent) => {
        if (x0 === null) return;
        const dx = e.clientX - x0;
        x0 = null;
        track!.classList.remove("is-drag");
        if (Math.abs(dx) > sw * 0.12) go(v - (dx > 0 ? 1 : -1));
        else place(true);
        setTimeout(() => (dragged = false), 0);
      };
      const onPointerCancel = () => {
        x0 = null;
        track!.classList.remove("is-drag");
        place(true);
      };
      track.addEventListener("pointerdown", onPointerDown);
      track.addEventListener("pointermove", onPointerMove);
      track.addEventListener("pointerup", onPointerUp);
      track.addEventListener("pointercancel", onPointerCancel);

      measure();
      window.addEventListener("resize", measure);

      let io: IntersectionObserver | null = null;
      if ("IntersectionObserver" in window) {
        io = new IntersectionObserver(
          (es) => {
            if (!es[0].isIntersecting) return;
            seen = true;
            place(false);
            io!.disconnect();
          },
          { threshold: 0.25 },
        );
        io.observe(rail);
      } else {
        seen = true;
        place(false);
      }

      cleanups.push(() => {
        window.removeEventListener("resize", measure);
        track.removeEventListener("transitionend", onTransitionEnd);
        prev.removeEventListener("click", onPrev);
        next.removeEventListener("click", onNext);
        slideClicks.forEach(([s, h]) => s.removeEventListener("click", h));
        rail.removeEventListener("keydown", onKeydown);
        track.removeEventListener("pointerdown", onPointerDown);
        track.removeEventListener("pointermove", onPointerMove);
        track.removeEventListener("pointerup", onPointerUp);
        track.removeEventListener("pointercancel", onPointerCancel);
        io?.disconnect();
        // undo the cloning, so a re-run on the next mount starts from the
        // same N real children instead of tripling again
        slides.forEach((s) => {
          if (!real.includes(s)) s.remove();
        });
      });
    })();

    return () => cleanups.forEach((c) => c());
  }, [pathname, a11y.themeToLight, a11y.themeToDark, a11y.slideOf]);

  return null;
}
