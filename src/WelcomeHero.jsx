// Welcome screen hero and condition cards.
// Hero: a dark blue space holding the name and portrait, cut by three sweeping curves.
// The two bands between the curves carry slowly flowing gradients, and the curve lines drift.
import { useContext, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ClinicMotion } from "./ClinicMesh";
import "./welcome.css";

// Three parallel curves from the left edge sweeping down to the right edge (viewBox 375 x 292).
const curve = (dy) => `M0 ${150 + dy} C 70 ${222 + dy}, 210 ${262 + dy}, 375 ${256 + dy}`;
const band = (top, bottom) =>
  `${curve(top)} L375 ${256 + bottom} C 210 ${262 + bottom}, 70 ${222 + bottom}, 0 ${150 + bottom} Z`;
const SPACE_ONE = `M0 0 H375 V256 C 210 262, 70 222, 0 150 Z`;

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
      <svg ref={svgRef} className="wh-art" viewBox="0 0 375 292" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="wh-space" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0d2742" />
            <stop offset=".6" stopColor="#123a5c" />
            <stop offset="1" stopColor="#14505a" />
          </linearGradient>
          <linearGradient id="wh-band-a" x1="0" y1="0" x2="375" y2="0" spreadMethod="reflect" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#176763" />
            <stop offset=".45" stopColor="#3fa59a" />
            <stop offset="1" stopColor="#9bd8cb" />
            <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="750 0" dur="9s" repeatCount="indefinite" />
          </linearGradient>
          <linearGradient id="wh-band-b" x1="0" y1="0" x2="375" y2="0" spreadMethod="reflect" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4f8fc6" />
            <stop offset=".55" stopColor="#1d5287" />
            <stop offset="1" stopColor="#1f7a72" />
            <animateTransform attributeName="gradientTransform" type="translate" from="750 0" to="0 0" dur="12s" repeatCount="indefinite" />
          </linearGradient>
          <clipPath id="wh-space-clip"><path d={SPACE_ONE} /></clipPath>
        </defs>

        <path d={SPACE_ONE} fill="url(#wh-space)" />
        <image href="/doctor-ashwani-welcome.webp" x="168" y="8" width="214" height="290"
          preserveAspectRatio="xMidYMax meet" clipPath="url(#wh-space-clip)" />
        <path d={band(0, 16)} fill="url(#wh-band-a)" />
        <path d={band(16, 30)} fill="url(#wh-band-b)" />

        <path className="wh-line" d={curve(0)} />
        <path className="wh-line is-mid" d={curve(16)} />
        <path className="wh-line is-low" d={curve(30)} />
      </svg>

      <div className="wh-copy">
        <h1 id="clinic-doctor-name">Dr Ashwani <span>Kansal</span></h1>
        <p className="wh-role">Consultant Diabetologist<br />and Physician</p>
        <p className="wh-credentials">MBBS, DFID, M.MED, PGCAT</p>
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
    <section className="welcome-care fc" aria-label="Conditions treated">
      <ul>
        {conditions.map(([Icon, label, back], index) => (
          <ConditionCard key={label} Icon={Icon} label={label} back={back} tone={index % 3} index={index}
            open={openLabel === label} onToggle={() => setOpenLabel(openLabel === label ? null : label)} />
        ))}
      </ul>
    </section>
  );
}
