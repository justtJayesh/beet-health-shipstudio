// Ported from LiveKit's Agents UI registry (agent-audio-visualizer-wave),
// which ships as copy-paste shadcn source, not an npm package:
// https://docs.livekit.io/reference/components/agents-ui/component/agent-audio-visualizer-wave/
import { useRef, useState, useEffect, useCallback } from "react";
import { animate, useMotionValue, useMotionValueEvent } from "motion/react";
import { useTrackVolume } from "@livekit/components-react";

const DEFAULT_SPEED = 5;
const DEFAULT_AMPLITUDE = 0.025;
const DEFAULT_FREQUENCY = 10;
const DEFAULT_TRANSITION = { duration: 0.2, ease: "easeOut" };

function useAnimatedValue(initialValue) {
  const [value, setValue] = useState(initialValue);
  const motionValue = useMotionValue(initialValue);
  const controlsRef = useRef(null);
  useMotionValueEvent(motionValue, "change", (v) => setValue(v));

  const animateFn = useCallback(
    (targetValue, transition) => {
      controlsRef.current = animate(motionValue, targetValue, transition);
    },
    [motionValue]
  );

  return { value, animate: animateFn };
}

// State-driven preset for speed/amplitude/frequency/opacity, then the
// track's real volume layers on top while speaking.
export function useAgentAudioVisualizerWave({ state, audioTrack, volume: volumeProp }) {
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const { value: amplitude, animate: animateAmplitude } = useAnimatedValue(DEFAULT_AMPLITUDE);
  const { value: frequency, animate: animateFrequency } = useAnimatedValue(DEFAULT_FREQUENCY);
  const { value: opacity, animate: animateOpacity } = useAnimatedValue(1.0);

  const trackVolume = useTrackVolume(audioTrack, { fftSize: 512, smoothingTimeConstant: 0.55 });
  const volume = volumeProp ?? trackVolume;

  useEffect(() => {
    switch (state) {
      case "disconnected":
        setSpeed(DEFAULT_SPEED);
        animateAmplitude(0, DEFAULT_TRANSITION);
        animateFrequency(0, DEFAULT_TRANSITION);
        animateOpacity(1.0, DEFAULT_TRANSITION);
        return;
      case "listening":
        setSpeed(DEFAULT_SPEED);
        animateAmplitude(DEFAULT_AMPLITUDE, DEFAULT_TRANSITION);
        animateFrequency(DEFAULT_FREQUENCY, DEFAULT_TRANSITION);
        animateOpacity([1.0, 0.3], { duration: 0.75, repeat: Infinity, repeatType: "mirror" });
        return;
      case "thinking":
      case "connecting":
      case "initializing":
        setSpeed(DEFAULT_SPEED * 4);
        animateAmplitude(DEFAULT_AMPLITUDE / 4, DEFAULT_TRANSITION);
        animateFrequency(DEFAULT_FREQUENCY * 4, DEFAULT_TRANSITION);
        animateOpacity([1.0, 0.3], { duration: 0.4, repeat: Infinity, repeatType: "mirror" });
        return;
      case "speaking":
      default:
        setSpeed(DEFAULT_SPEED * 2);
        animateAmplitude(DEFAULT_AMPLITUDE, DEFAULT_TRANSITION);
        animateFrequency(DEFAULT_FREQUENCY, DEFAULT_TRANSITION);
        animateOpacity(1.0, DEFAULT_TRANSITION);
        return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, setSpeed, animateAmplitude, animateFrequency, animateOpacity]);

  useEffect(() => {
    if (state === "speaking") {
      animateAmplitude(0.015 + 0.4 * volume, { duration: 0 });
      animateFrequency(20 + 60 * volume, { duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, volume, animateAmplitude, animateFrequency]);

  return { speed, amplitude, frequency, opacity };
}
