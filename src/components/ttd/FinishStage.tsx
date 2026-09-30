import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-motion";
import { planStage, type StagePlan } from "@/lib/paint/capability";
import { posterSrc } from "@/lib/paint/posters";
import type { PaintEngine } from "@/lib/paint/engine";
import { cn } from "@/lib/utils";

/**
 * The paint surface behind the customer portal's hero: a curved panel of a car,
 * hazy and swirl-marked on one side and mirror clearcoat on the other, with the
 * 50/50 line showing how far the finish has got. `level` (0..1) is a real
 * quantity on every screen that uses it: qualifying visits out of seven, or
 * detailing stages ticked on a live job.
 *
 * It is an enhancement, never the carrier of content. The first paint is a
 * poster rendered from the same shader; the live WebGL layer is loaded when the
 * stage is on screen and idle, fades in over the poster once a real frame is
 * drawn, and any failure (no WebGL, reduced motion, data saving, lost context,
 * frames too slow) simply leaves the poster. One canvas is shared and moved
 * between pages, so navigating keeps the surface instead of rebuilding it.
 */

interface Shared {
  canvas: HTMLCanvasElement;
  engine: PaintEngine;
  surface: string | null;
  level: number;
}

let shared: Shared | null = null;
let creating: Promise<Shared | null> | null = null;
let overloaded = false;
const onFail = new Set<() => void>();

function failEverywhere() {
  overloaded = true;
  shared?.canvas.remove();
  shared?.engine.dispose();
  shared = null;
  creating = null;
  onFail.forEach((f) => f());
}

/** Run when the browser is idle (or shortly after, where it has no idle callback). */
function whenIdle(fn: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: 1200 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 250);
  return () => window.clearTimeout(id);
}

async function getShared(plan: StagePlan): Promise<Shared | null> {
  if (shared) return shared;
  creating ??= (async () => {
    const { createPaintEngine } = await import("@/lib/paint/engine");
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 h-full w-full";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.opacity = "0";
    canvas.style.transition = "opacity 420ms ease";
    const engine = createPaintEngine(canvas, {
      lite: plan.lite,
      maxDpr: plan.maxDpr,
      onOverload: failEverywhere,
      onLost: () => {
        canvas.style.opacity = "0";
      },
      onRestored: () => {
        canvas.style.opacity = "1";
      },
    });
    if (!engine) return null;
    shared = { canvas, engine, surface: null, level: 0 };
    return shared;
  })();
  return creating;
}

export interface FinishStageProps {
  /** 0..1. How finished this surface is. */
  level: number;
  /** Identifies what the level measures ("visits", "job:<id>"). The edge only travels between values on the same surface. */
  surface: string;
  /** Start the edge here, so a newly counted step is seen arriving. */
  from?: number | undefined;
  /** Play the light-pass once the edge arrives. */
  pass?: boolean;
  /** Horizontal position (0..1) of the step being looked at. */
  focus?: number | null;
  /** Darken the top so a headline reads over the glass. */
  scrim?: boolean;
  className?: string;
  children?: ReactNode;
}

export function FinishStage({
  level,
  surface,
  from,
  pass = false,
  focus = null,
  scrim = true,
  className,
  children,
}: FinishStageProps) {
  const reduced = usePrefersReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PaintEngine | null>(null);
  const [plan, setPlan] = useState<StagePlan | null>(null);
  const [state, setState] = useState<"poster" | "loading" | "live" | "fallback">("poster");
  const first = useRef({ level, from, pass, surface });
  // Always the latest, so a live layer that attaches a moment later starts from the right place.
  first.current = { level, from, pass, surface };

  useEffect(() => {
    setPlan(planStage(reduced));
  }, [reduced]);

  // Bring the live layer up: when the plan allows it, once idle, and only while there is room to draw.
  useEffect(() => {
    if (!plan) return;
    if (!plan.live || overloaded) {
      setState("fallback");
      return;
    }
    setState((s) => (s === "live" ? s : "loading"));
    let cancelled = false;
    let teardown: (() => void) | undefined;

    const attach = (s: Shared) => {
      const box = host.current;
      const mount = slot.current;
      if (cancelled || !box || !mount) return;
      mount.appendChild(s.canvas);
      engineRef.current = s.engine;
      const size = () => s.engine.resize(box.clientWidth, box.clientHeight);
      size();
      const { level: lv, from: fr, pass: ps, surface: sf } = first.current;
      const same = s.surface === sf;
      if (same && s.level === lv) s.engine.setLevel(lv, { ms: 0 });
      else s.engine.setLevel(lv, { from: fr ?? (same ? s.level : 0), pass: ps, ms: 1100 });
      s.surface = sf;
      s.level = lv;
      s.engine.setActive(!document.hidden);

      const ro = new ResizeObserver(size);
      ro.observe(box);
      const io = new IntersectionObserver(
        ([entry]) => s.engine.setActive(Boolean(entry?.isIntersecting) && !document.hidden),
        { threshold: 0.01 },
      );
      io.observe(box);
      const vis = () => s.engine.setActive(!document.hidden);
      document.addEventListener("visibilitychange", vis);

      requestAnimationFrame(() => {
        if (cancelled) return;
        s.canvas.style.opacity = "1";
        setState("live");
      });

      teardown = () => {
        ro.disconnect();
        io.disconnect();
        document.removeEventListener("visibilitychange", vis);
        if (s.canvas.parentNode === mount) mount.removeChild(s.canvas);
        s.engine.setActive(false);
        if (engineRef.current === s.engine) engineRef.current = null;
      };
    };

    const start = () => {
      void getShared(plan).then((s) => {
        if (cancelled) return;
        if (!s) setState("fallback");
        else attach(s);
      });
    };

    let cancelIdle: (() => void) | undefined;
    if (shared) attach(shared);
    else cancelIdle = whenIdle(start);

    const fail = () => {
      teardown?.();
      setState("fallback");
    };
    onFail.add(fail);

    return () => {
      cancelled = true;
      onFail.delete(fail);
      cancelIdle?.();
      teardown?.();
    };
    // The level and step are read once, on attach; later changes go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  // A level that changes while the stage is on screen: the edge travels there.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !shared) return;
    if (shared.level === level && shared.surface === surface) return;
    engine.setLevel(level, { pass });
    shared.level = level;
    shared.surface = surface;
  }, [level, surface, pass]);

  useEffect(() => {
    engineRef.current?.setFocus(focus);
  }, [focus, state]);

  const aim = (e: React.PointerEvent) => {
    const engine = engineRef.current;
    const box = host.current;
    if (!engine || !box || state !== "live") return;
    const r = box.getBoundingClientRect();
    engine.aim((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    box.dataset["torch"] = "on";
  };
  const stow = () => {
    engineRef.current?.aim(null);
    if (host.current) delete host.current.dataset["torch"];
  };

  return (
    <div
      ref={host}
      data-stage={state}
      data-reason={plan && !plan.live ? plan.reason : undefined}
      onPointerMove={aim}
      onPointerDown={aim}
      onPointerLeave={stow}
      onPointerUp={stow}
      onPointerCancel={stow}
      style={{ touchAction: "pan-y" }}
      className={cn("absolute inset-0 overflow-hidden bg-ink", className)}
    >
      <picture aria-hidden>
        <source media="(min-width: 700px)" srcSet={posterSrc(level, "wide")} />
        <img
          src={posterSrc(level, "narrow")}
          alt=""
          width={720}
          height={560}
          decoding="async"
          className={cn(
            "absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-500",
            state === "live" && "opacity-0",
          )}
        />
      </picture>
      <div ref={slot} className="absolute inset-0" aria-hidden />
      {scrim ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/75 via-ink/15 to-transparent"
        />
      ) : null}
      {children}
    </div>
  );
}
