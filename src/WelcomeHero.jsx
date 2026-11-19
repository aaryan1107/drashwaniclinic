// Welcome screen hero and condition cards.
// Layout follows the doctor-profile reference in inspo/: the portrait floats on the page background
// (the live mesh shows through), the name sits on the left, and a content sheet rises underneath
// with a curved top edge. Two thin bands ride that edge, shifting colour slowly, and a soft light
// glides along them. Colours come from --wh-* tokens set per theme in welcome.css.
import { useContext, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ClinicMotion } from "./ClinicMesh";
import "./welcome.css";

// viewBox 375 x 318. Curves run from the left edge down and across to the right edge.
const W = 375;
const H = 318;
const curve = (dy) => `M0 ${206 + dy} C 104 ${276 + dy}, 236 ${306 + dy}, ${W} ${292 + dy}`;
const curveBack = (dy) => `L${W} ${292 + dy} C 236 ${306 + dy}, 104 ${276 + dy}, 0 ${206 + dy} Z`;
const band = (top, bottom) => `${curve(top)} ${curveBack(bottom)}`;
const ABOVE = `M0 0 H${W} V292 C 236 306, 104 276, 0 206 Z`;
const SHEET = `${curve(14)} L${W} ${H} L0 ${H} Z`;
const stop = (offset, token) => <stop offset={offset} style={{ stopColor: `var(${token})` }} />;

function useMotionAllowed() {
  const motion = useContext(ClinicMotion);
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return undefined;
    const sync = () => setReduced(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return !reduced && !motion?.paused;
}

export function WelcomeHero() {
  const svgRef = useRef(null);
  const moving = useMotionAllowed();

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg?.pauseAnimations) return;
    if (moving) svg.unpauseAnimations();
    else svg.pauseAnimations();
  }, [moving]);

  return (
    <div className={`wh${moving ? "" : " is-still"}`}>
      <svg ref={svgRef} className="wh-art" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="wh-halo" cx=".72" cy=".46" r=".42">
            <stop offset="0" style={{ stopColor: "var(--wh-halo)", stopOpacity: 0.9 }} />
            <stop offset="1" style={{ stopColor: "var(--wh-halo)", stopOpacity: 0 }} />
          </radialGradient>
          <linearGradient id="wh-band-a" x1="0" y1="0" x2="375" y2="0" spreadMethod="reflect" gradientUnits="userSpaceOnUse">
            {stop(0, "--wh-band-a1")}
            {stop(1, "--wh-band-a2")}
            <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="750 0" dur="14s" repeatCount="indefinite" />
          </linearGradient>
          <linearGradient id="wh-band-b" x1="0" y1="0" x2="375" y2="0" spreadMethod="reflect" gradientUnits="userSpaceOnUse">
            {stop(0, "--wh-band-b1")}
            {stop(1, "--wh-band-b2")}
            <animateTransform attributeName="gradientTransform" type="translate" from="750 0" to="0 0" dur="18s" repeatCount="indefinite" />
          </linearGradient>
          {/* A short soft highlight that travels left to right along the curve. */}
          <linearGradient id="wh-sheen" x1="-140" y1="0" x2="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
            <animateTransform attributeName="gradientTransform" type="translate" values="0 0; 520 0" keyTimes="0; 1"
              dur="6.5s" calcMode="spline" keySplines=".45 0 .25 1" repeatCount="indefinite" />
          </linearGradient>
          <clipPath id="wh-above"><path d={ABOVE} /></clipPath>
        </defs>

        <circle cx="290" cy="150" r="128" fill="url(#wh-halo)" />
        <image href="/doctor-ashwani-welcome.webp" x="170" y="4" width="246" height="334"
          preserveAspectRatio="xMidYMax meet" clipPath="url(#wh-above)" />
        <path d={band(0, 8)} fill="url(#wh-band-a)" />
        <path d={band(8, 14)} fill="url(#wh-band-b)" />
        <path d={SHEET} className="wh-sheet" />
        <path className="wh-sheen" d={curve(0)} />
      </svg>

      <div className="wh-copy">
        <span className="wh-eyebrow">Your doctor</span>
        <h1 id="clinic-doctor-name">Dr Ashwani <span>Kansal</span></h1>
        <p className="wh-role">Consultant Diabetologist and Physician</p>
        <p className="wh-creds">MBBS · DFID · M.MED · PGCAT</p>
      </div>
    </div>
  );
}

// Front: icon and condition. Back: a short line on how the clinic helps.
// Spring flip via Motion. Hover flips on pointer devices; tap or Enter/Space toggles everywhere.
// Reduced motion: the faces crossfade instead of turning.
const FLIP_SPRING = { type: "spring", stiffness: 240, damping: 24, mass: 0.9 };

function ConditionCard({ Icon, label, back, tone, index, open, onToggle }) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const canHover = typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
  const flipped = open || (canHover && hovered);
  return (
    <li data-care-tone={tone}>
      <motion.button type="button" className="fc-card" aria-pressed={open} aria-label={`${label}: ${back}`}
        onClick={onToggle} onHoverStart={() => setHovered(true)} onHoverEnd={() => setHovered(false)}
        initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.08 + index * 0.04, ease: [0.2, 0.75, 0.25, 1] }}
        whileTap={reduce ? undefined : { scale: 0.97 }}>
        <motion.span className="fc-inner" initial={false}
          animate={reduce ? {} : { rotateY: flipped ? 180 : 0 }} transition={FLIP_SPRING}>
          <motion.span className="fc-face fc-front" aria-hidden="true" initial={false}
            animate={reduce ? { opacity: flipped ? 0 : 1 } : {}}>
            <span className="welcome-care-icon"><Icon size={19} strokeWidth={1.8} /></span>
            <span>{label}</span>
          </motion.span>
          <motion.span className="fc-face fc-back" aria-hidden="true" initial={false}
            animate={reduce ? { opacity: flipped ? 1 : 0 } : {}}>{back}</motion.span>
        </motion.span>
      </motion.button>
    </li>
  );
}

export function ConditionCards({ conditions }) {
  const [openLabel, setOpenLabel] = useState(null);
  return (
    <section className="welcome-care fc" aria-labelledby="fc-heading">
      <div className="fc-head">
        <h2 id="fc-heading">What we treat</h2>
        <span>Tap a card</span>
      </div>
      <ul>
        {conditions.map(([Icon, label, back], index) => (
          <ConditionCard key={label} Icon={Icon} label={label} back={back} tone={index % 3} index={index}
            open={openLabel === label} onToggle={() => setOpenLabel(openLabel === label ? null : label)} />
        ))}
      </ul>
    </section>
  );
}
