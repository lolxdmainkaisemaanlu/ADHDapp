import { useEffect, useMemo, useRef, useState } from 'react';
import type { SessionCategory, SessionStatus } from '@shared/types';

interface FocusTimerProps {
  onLogSession: (entry: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
    category: SessionCategory;
    status: SessionStatus;
    label: string;
  }) => void;
}

const FOCUS_PRESET_MINUTES = 25;
const SHORT_BREAK_MINUTES = 5;
const LONG_BREAK_MINUTES = 15;
const DEFAULT_NOISE_SOURCE =
  'https://cdn.pixabay.com/download/audio/2021/11/18/audio_2b0b658d14.mp3?filename=white-noise-ambient-113166.mp3';

type RunningStatus = 'idle' | 'running' | 'paused';

const labels: Record<SessionCategory, string> = {
  focus: 'Focus session',
  'short-break': 'Short break',
  'long-break': 'Long break'
};

const formatTime = (totalSeconds: number) => {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60));
  const seconds = Math.max(0, totalSeconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const FocusTimer = ({ onLogSession }: FocusTimerProps) => {
  const [focusMinutes, setFocusMinutes] = useState(FOCUS_PRESET_MINUTES);
  const [mode, setMode] = useState<SessionCategory>('focus');
  const [secondsRemaining, setSecondsRemaining] = useState(FOCUS_PRESET_MINUTES * 60);
  const [totalSeconds, setTotalSeconds] = useState(FOCUS_PRESET_MINUTES * 60);
  const [runningState, setRunningState] = useState<RunningStatus>('idle');
  const [completedFocusCount, setCompletedFocusCount] = useState(0);
  const [activeLabel, setActiveLabel] = useState(labels.focus);
  const [noiseEnabled, setNoiseEnabled] = useState(false);
  const [noiseInput, setNoiseInput] = useState(DEFAULT_NOISE_SOURCE);
  const [noiseSource, setNoiseSource] = useState(DEFAULT_NOISE_SOURCE);
  const [noiseError, setNoiseError] = useState('');

  const startedAtRef = useRef<Date | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isRunning = runningState === 'running';
  const isPaused = runningState === 'paused';

  const nextBreakLabel = useMemo(() => {
    const projectedFocuses = mode === 'focus' && runningState !== 'idle' ? completedFocusCount + 1 : completedFocusCount;
    const breakType = projectedFocuses !== 0 && projectedFocuses % 4 === 0 ? 'long-break' : 'short-break';
    return labels[breakType];
  }, [completedFocusCount, mode, runningState]);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(noiseSource);
      audioRef.current.loop = true;
      audioRef.current.preload = 'auto';
      return;
    }

    audioRef.current.src = noiseSource;
    audioRef.current.load();
  }, [noiseSource]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (noiseEnabled && isRunning && mode === 'focus') {
      void audio.play().catch(() => {
        setNoiseError('Unable to start playback. Check your audio source or unmute the tab.');
      });
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [isRunning, mode, noiseEnabled]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setRunningState('idle');
          finalizeSession('completed');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const validateAudioUrl = (url: string) => {
    try {
      const parsed = new URL(url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Audio must use http or https');
      }
      return parsed.toString();
    } catch (error) {
      setNoiseError((error as Error).message);
      return null;
    }
  };

  const startSession = (category: SessionCategory, minutes: number, label?: string) => {
    const safeMinutes = Math.max(1, Math.round(minutes));
    const total = safeMinutes * 60;
    startedAtRef.current = new Date();
    setMode(category);
    setTotalSeconds(total);
    setSecondsRemaining(total);
    setRunningState('running');
    setActiveLabel(label ?? labels[category]);
  };

  const finalizeSession = (status: SessionStatus) => {
    if (!startedAtRef.current) {
      setRunningState('idle');
      setSecondsRemaining(focusMinutes * 60);
      setTotalSeconds(focusMinutes * 60);
      setMode('focus');
      setActiveLabel(labels.focus);
      return;
    }

    const end = new Date();
    const elapsedSeconds = Math.max(totalSeconds - secondsRemaining, 0);
    const durationMs = Math.max(elapsedSeconds * 1000, 1000);

    onLogSession({
      startedAt: startedAtRef.current.toISOString(),
      completedAt: end.toISOString(),
      durationMs,
      category: mode,
      status,
      label: activeLabel || labels[mode]
    });

    if (mode === 'focus' && status === 'completed') {
      const nextCount = completedFocusCount + 1;
      setCompletedFocusCount(nextCount);
      const breakType: SessionCategory = nextCount % 4 === 0 ? 'long-break' : 'short-break';
      startSession(breakType, breakType === 'long-break' ? LONG_BREAK_MINUTES : SHORT_BREAK_MINUTES);
    } else {
      startedAtRef.current = null;
      setRunningState('idle');
      setSecondsRemaining(focusMinutes * 60);
      setTotalSeconds(focusMinutes * 60);
      setMode('focus');
      setActiveLabel(labels.focus);
    }
  };

  const handlePauseToggle = () => {
    if (runningState === 'running') {
      setRunningState('paused');
    } else if (runningState === 'paused') {
      setRunningState('running');
    }
  };

  const handleCancel = () => {
    setRunningState('idle');
    finalizeSession('cancelled');
  };

  const handleNoiseSourceChange = () => {
    const validated = validateAudioUrl(noiseInput);
    if (validated) {
      setNoiseSource(validated);
      setNoiseError('');
    }
  };

  const upcomingMessage = useMemo(() => {
    if (mode === 'focus' && isRunning) {
      return `Auto ${nextBreakLabel.toLowerCase()} after this block.`;
    }

    if (mode !== 'focus' && isRunning) {
      return 'Breaks are logged and kept offline until you are back online.';
    }

    return 'Start a focus block to begin tracking sessions.';
  }, [isRunning, mode, nextBreakLabel]);

  const progress = totalSeconds > 0 ? Math.min(100, Math.round(((totalSeconds - secondsRemaining) / totalSeconds) * 100)) : 0;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4 shadow-inner shadow-slate-950/30">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Timer</p>
          <h3 className="text-lg font-semibold text-slate-100">Guided focus & breaks</h3>
          <p className="text-sm text-slate-400">Presets with automatic short/long breaks and offline logging.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span className="rounded-full bg-slate-800 px-3 py-1">Next: {nextBreakLabel}</span>
          <span className="rounded-full bg-slate-800 px-3 py-1">{completedFocusCount} focus done</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3 rounded-lg border border-slate-800/80 bg-slate-950/60 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs text-slate-400" htmlFor="focusMinutes">
                Focus length (minutes)
              </label>
              <input
                id="focusMinutes"
                type="number"
                min={1}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                value={focusMinutes}
                onChange={(event) => setFocusMinutes(Number(event.target.value))}
              />
            </div>
            <button
              type="button"
              className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400"
              onClick={() => startSession('focus', FOCUS_PRESET_MINUTES)}
            >
              25-min preset
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-emerald-400"
              onClick={() => startSession('focus', focusMinutes, 'Custom focus block')}
            >
              Start focus
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-amber-400"
              onClick={() => startSession('short-break', SHORT_BREAK_MINUTES)}
            >
              Start short break
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-amber-400"
              onClick={() => startSession('long-break', LONG_BREAK_MINUTES)}
            >
              Start long break
            </button>
          </div>

          <div className="rounded-md border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{labels[mode]}</p>
                <p className="text-4xl font-mono font-semibold text-slate-50">{formatTime(secondsRemaining)}</p>
              </div>
              <div className="text-right text-sm text-slate-400">
                <p>{activeLabel}</p>
                <p>Progress {progress}%</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePauseToggle}
                disabled={runningState === 'idle'}
                className="rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-100 transition enabled:hover:bg-slate-700 disabled:opacity-50"
              >
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={runningState === 'idle'}
                className="rounded-md bg-rose-500/90 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition enabled:hover:bg-rose-400 disabled:opacity-50"
              >
                Stop & log
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-400">{upcomingMessage}</p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-800/80 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Soundscape</p>
              <p className="text-sm text-slate-300">White noise helps mask distractions.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={noiseEnabled}
                onChange={(event) => setNoiseEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800"
              />
              Play white noise
            </label>
          </div>

          <div className="space-y-2 text-sm">
            <label className="text-slate-400" htmlFor="noiseSource">
              Custom URL or playlist
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="noiseSource"
                value={noiseInput}
                onChange={(event) => setNoiseInput(event.target.value)}
                placeholder="https://example.com/audio.mp3"
                className="flex-1 rounded-md border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
              />
              <button
                type="button"
                onClick={handleNoiseSourceChange}
                className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
              >
                Use source
              </button>
            </div>
            {noiseError ? (
              <p className="text-xs text-rose-300">{noiseError}</p>
            ) : (
              <p className="text-xs text-slate-400">HTTP(S) links only. Audio keeps playing while focus is active.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FocusTimer;
