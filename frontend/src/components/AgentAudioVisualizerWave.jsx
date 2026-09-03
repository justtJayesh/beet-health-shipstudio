import { useEffect, useMemo, useRef } from "react";
import { useAgentAudioVisualizerWave } from "../hooks/useAgentAudioVisualizerWave.js";

const DEFAULT_COLOR = "#1FD5F9";

// ponytail: hand-rolled single-pass WebGL harness — upstream's ReactShaderToy
// (packages/shadcn/components/agents-ui/react-shader-toy.tsx) is a ~1000
// line generic ShaderToy emulator supporting multi-buffer passes, texture
// and audio channels, and mouse/keyboard uniforms. This component only ever
// needs iTime/iResolution plus a handful of floats, so vendor just that
// slice. Upgrade to the full file if a future shader here needs channels.
const VERTEX_SHADER_SOURCE = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER_MAIN = `
void main(void) {
  vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}`;

// Verbatim from LiveKit's Agents UI registry (agent-audio-visualizer-wave.tsx)
// — the oscilloscope-with-bell-curve-attenuation wave shader.
const WAVE_SHADER_SOURCE = `
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uMix;
uniform float uLineWidth;
uniform float uSmoothing;
uniform vec3 uColor;
uniform float uColorShift;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float bellCurve(float distanceFromCenter, float maxDistance) {
  float normalizedDistance = distanceFromCenter / maxDistance;
  return pow(cos(normalizedDistance * (3.14159265359 / 4.0)), 16.0);
}

float oscilloscopeWave(float x, float centerX, float time) {
  float relativeX = x - centerX;
  float maxDistance = centerX;
  float distanceFromCenter = abs(relativeX);
  float bell = bellCurve(distanceFromCenter, maxDistance);
  return sin(relativeX * uFrequency + time * uSpeed) * uAmplitude * bell;
}

void mainImage(inout vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float centerX = 0.5;
  float centerY = 0.5;
  float x = uv.x;
  float y = uv.y;

  float pixelSize = 2.0 / (iResolution.x + iResolution.y);
  float lineWidthUV = uLineWidth * pixelSize;
  float smoothingUV = uSmoothing * pixelSize;

  const int NUM_SAMPLES = 50;
  float minDist = 1000.0;
  float sampleRange = 0.02;

  for (int i = 0; i < NUM_SAMPLES; i++) {
    float offset = (float(i) / float(NUM_SAMPLES - 1) - 0.5) * sampleRange;
    float sampleX = x + offset;
    float waveY = centerY + oscilloscopeWave(sampleX, centerX, iTime);
    vec2 wavePoint = vec2(sampleX, waveY);
    vec2 currentPoint = vec2(x, y);
    minDist = min(minDist, distance(currentPoint, wavePoint));
  }

  float line = smoothstep(lineWidthUV + smoothingUV, lineWidthUV - smoothingUV, minDist);

  vec3 color = uColor;
  if (abs(uColorShift) > 0.01) {
    float centerBandHalfWidth = 0.2;
    float edgeBandWidth = 0.5;
    float distanceFromCenter = abs(x - centerX);
    float edgeFactor = clamp((distanceFromCenter - centerBandHalfWidth) / edgeBandWidth, 0.0, 1.0);
    vec3 hsv = rgb2hsv(color);
    hsv.x = fract(hsv.x + edgeFactor * uColorShift * 0.3);
    color = hsv2rgb(hsv);
  }

  color *= line;
  float alpha = line * uMix;
  fragColor = vec4(color * uMix, alpha);
}`;

function hexToRgb(hexColor) {
  const match = (hexColor ?? "").match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  if (!match) {
    return hexColor === DEFAULT_COLOR ? [0.12, 0.83, 0.98] : hexToRgb(DEFAULT_COLOR);
  }
  const [, r, g, b] = match;
  return [r, g, b].map((c) => parseInt(c, 16) / 255);
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

const SIZE_PX = { icon: 24, sm: 56, md: 112, lg: 224, xl: 448 };

/**
 * A wave-style audio visualizer that responds to agent state and audio
 * levels — ported from LiveKit's Agents UI registry component of the same
 * name (see file header comments for the parts vendored verbatim).
 */
export function AgentAudioVisualizerWave({
  size = "lg",
  state = "speaking",
  color = DEFAULT_COLOR,
  colorShift = 0.05,
  lineWidth,
  audioTrack,
  volume,
  className,
}) {
  const canvasRef = useRef(null);
  const uniformsRef = useRef(null);
  const { speed, amplitude, frequency, opacity } = useAgentAudioVisualizerWave({
    state,
    audioTrack,
    volume,
  });

  const rgbColor = useMemo(() => hexToRgb(color), [color]);
  const resolvedLineWidth = lineWidth ?? (size === "icon" || size === "sm" ? 2 : 1);

  uniformsRef.current = {
    uSpeed: speed,
    uAmplitude: amplitude,
    uFrequency: frequency,
    uMix: opacity,
    uLineWidth: resolvedLineWidth,
    uSmoothing: 0.5,
    uColor: rgbColor,
    uColorShift: colorShift,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const contextOptions = { alpha: true, premultipliedAlpha: false };
    const gl = canvas.getContext("webgl", contextOptions) ?? canvas.getContext("experimental-webgl", contextOptions);
    if (!gl) {
      return undefined;
    }
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let program;
    try {
      const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
      const fragmentShader = compileShader(
        gl,
        gl.FRAGMENT_SHADER,
        `${WAVE_SHADER_SOURCE}\n${FRAGMENT_SHADER_MAIN}`
      );
      program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
      }
    } catch {
      return undefined;
    }

    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const positionLoc = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const uniformLoc = (name) => gl.getUniformLocation(program, name);
    const locations = {
      iResolution: uniformLoc("iResolution"),
      iTime: uniformLoc("iTime"),
      uSpeed: uniformLoc("uSpeed"),
      uAmplitude: uniformLoc("uAmplitude"),
      uFrequency: uniformLoc("uFrequency"),
      uMix: uniformLoc("uMix"),
      uLineWidth: uniformLoc("uLineWidth"),
      uSmoothing: uniformLoc("uSmoothing"),
      uColor: uniformLoc("uColor"),
      uColorShift: uniformLoc("uColorShift"),
    };

    const start = performance.now();
    let rafId;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    }

    function render(now) {
      resize();
      gl.clear(gl.COLOR_BUFFER_BIT);
      const u = uniformsRef.current;
      gl.uniform2f(locations.iResolution, canvas.width, canvas.height);
      gl.uniform1f(locations.iTime, (now - start) / 1000);
      gl.uniform1f(locations.uSpeed, u.uSpeed);
      gl.uniform1f(locations.uAmplitude, u.uAmplitude);
      gl.uniform1f(locations.uFrequency, u.uFrequency);
      gl.uniform1f(locations.uMix, u.uMix);
      gl.uniform1f(locations.uLineWidth, u.uLineWidth);
      gl.uniform1f(locations.uSmoothing, u.uSmoothing);
      gl.uniform3f(locations.uColor, u.uColor[0], u.uColor[1], u.uColor[2]);
      gl.uniform1f(locations.uColorShift, u.uColorShift);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafId = requestAnimationFrame(render);
    }
    rafId = requestAnimationFrame(render);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      gl.deleteProgram(program);
    };
  }, []);

  const pixelSize = SIZE_PX[size] ?? SIZE_PX.lg;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      data-lk-state={state}
      style={{ width: pixelSize, height: pixelSize, maxWidth: "100%", maxHeight: "100%" }}
    />
  );
}
