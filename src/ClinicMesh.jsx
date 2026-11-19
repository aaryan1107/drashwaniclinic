import { createContext, useEffect, useRef, useState } from "react";

export const ClinicMotion = createContext(null);

const palettes = {
  light: ["#E1F4DF", "#D3E4E8", "#CFE7D3", "#EEF4EC", "#FAFBF7"],
  charcoal: ["#25292A", "#3A4142", "#282F2D", "#424A46", "#202324"],
  pine: ["#174D73", "#1D7290", "#136952", "#63B79B", "#233F54"],
};

const speed = 0.42;

export default function ClinicMesh({ theme, paused }) {
  const host = useRef(null);
  const renderer = useRef(null);
  const settings = useRef({ theme, paused });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    settings.current = { theme, paused };
    renderer.current?.update();
  }, [theme, paused]);

  useEffect(() => {
    const container = host.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;

    function syncMotion() {
      renderer.current?.update();
      if (disposed || renderer.current || reducedMotion.matches) return;

      import("@paper-design/shaders").then(({
        ShaderMount, ShaderFitOptions, meshGradientFragmentShader, getShaderColorFromString,
      }) => {
        if (disposed || renderer.current || reducedMotion.matches) return;
        const uniforms = () => ({
          u_colors: palettes[settings.current.theme].map(getShaderColorFromString),
          u_colorsCount: palettes[settings.current.theme].length,
        });
        const mount = new ShaderMount(container, meshGradientFragmentShader, {
          ...uniforms(),
          u_distortion: 0.49,
          u_swirl: 0.18,
          u_grainMixer: 0,
          u_grainOverlay: 0,
          u_fit: ShaderFitOptions.cover,
          u_rotation: 0,
          u_scale: 1,
          u_offsetX: 0,
          u_offsetY: 0,
          u_originX: 0.5,
          u_originY: 0.5,
          u_worldWidth: 0,
          u_worldHeight: 0,
        }, undefined, settings.current.paused ? 0 : speed, 15700, 1, 420_000);

        const canvas = container.querySelector("canvas");
        const onContextLoss = () => setReady(false);
        canvas?.addEventListener("webglcontextlost", onContextLoss);
        renderer.current = {
          update() {
            mount.setUniforms(uniforms());
            mount.setSpeed(settings.current.paused || reducedMotion.matches ? 0 : speed);
          },
          dispose() {
            canvas?.removeEventListener("webglcontextlost", onContextLoss);
            mount.dispose();
          },
        };
        setReady(true);
      }).catch(() => {
        if (!disposed) container.replaceChildren();
      });
    }

    syncMotion();
    reducedMotion.addEventListener("change", syncMotion);
    return () => {
      disposed = true;
      reducedMotion.removeEventListener("change", syncMotion);
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);

  return (
    <div className="clinic-mesh" aria-hidden="true">
      <div ref={host} className="clinic-mesh-canvas" data-webgl={ready} />
    </div>
  );
}
