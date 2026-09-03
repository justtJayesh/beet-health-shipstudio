import { useAudioWaveform } from "@livekit/components-react";

const BAR_COUNT = 24;
const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 40;

// A live waveform, not a fixed bar-count equalizer: each bar's height is the
// track's actual amplitude for that slice (via LiveKit's useAudioWaveform),
// so it reads as one continuous wave rather than a generic 5-dot meter.
export function AgentAudioVisualizerWave({ trackRef }) {
  const { bars } = useAudioWaveform(trackRef, { barCount: BAR_COUNT });

  return (
    <svg
      className="agent-wave"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {bars.map((amplitude, i) => {
        const barWidth = VIEW_WIDTH / bars.length;
        const height = Math.max(2, amplitude * VIEW_HEIGHT);
        const x = i * barWidth + barWidth * 0.2;
        const y = (VIEW_HEIGHT - height) / 2;
        return <rect key={i} x={x} y={y} width={barWidth * 0.6} height={height} rx={barWidth * 0.3} />;
      })}
    </svg>
  );
}
