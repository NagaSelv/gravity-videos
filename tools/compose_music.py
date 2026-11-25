#!/usr/bin/env python3
"""Original chiptune soundtrack for the daily videos (written for Gravity!, 25 Nov 2026).

Composed and synthesised here from scratch (square/pulse lead and arpeggio, triangle bass,
noise drums) in an 80s arcade style, so it carries no third-party music and no Content ID claim.
Usage: python3 compose_music.py OUT.wav   (about 2:55, 132 BPM, A minor; loudness is set in make_video.py)
"""
import sys, numpy as np, wave

SR = 44100; BPM = 132; STEP = 60 / BPM / 4            # one 16th note
BAR = 16 * STEP

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

def pulse(f, n, duty=.5):
    ph = (np.arange(n) * f / SR) % 1.0
    return np.where(ph < duty, 1.0, -1.0)

def tri(f, n):
    ph = (np.arange(n) * f / SR) % 1.0
    return 4 * np.abs(ph - .5) - 1

def env(n, a=.004, d=.08, s=.6, r=.03):
    e = np.ones(n) * s; A, D, R = int(a * SR), int(d * SR), int(r * SR)
    A = min(A, n); e[:A] = np.linspace(0, 1, A)
    D2 = min(D, n - A); e[A:A + D2] = np.linspace(1, s, D2)
    if R < n: e[-R:] *= np.linspace(1, 0, R)
    return e

# chords: (root midi, chord tones) in A minor
CH = {'Am': (45, [57, 60, 64]), 'F': (41, [53, 57, 60]), 'C': (48, [55, 60, 64]), 'G': (43, [55, 59, 62]),
      'Dm': (50, [57, 62, 65]), 'E': (40, [56, 59, 64])}
PROG_A = ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E']
PROG_B = ['F', 'G', 'Am', 'Am', 'Dm', 'Am', 'E', 'E']

# lead melodies: per bar, list of (start16, len16, midi)
def P(s):  # "69:2 72:2 ..." sequential, '-' = rest
    out, t = [], 0
    for tok in s.split():
        n, l = tok.split(':'); l = int(l)
        if n != '-': out.append((t, l, int(n)))
        t += l
    return out
MEL_A = [P('76:3 74:1 72:2 71:2 72:4 69:4'), P('72:2 74:2 76:4 77:2 76:2 74:4'),
         P('76:2 79:2 76:2 72:2 74:4 72:2 74:2'), P('71:4 67:2 71:2 74:6 -:2'),
         P('76:3 74:1 72:2 71:2 72:4 69:4'), P('72:2 74:2 76:4 77:2 79:2 81:4'),
         P('79:2 77:2 76:2 74:2 71:4 74:4'), P('76:8 75:4 -:4')]
MEL_B = [P('81:4 79:2 77:2 76:4 72:4'), P('74:4 76:2 77:2 79:8'),
         P('81:2 79:2 76:2 72:2 76:2 79:2 81:4'), P('84:6 83:2 81:8'),
         P('77:4 76:2 74:2 77:4 81:4'), P('79:2 76:2 72:2 76:2 81:8'),
         P('80:4 79:2 76:2 74:4 71:4'), P('76:4 80:4 83:8')]

def render():
    sections = [('intro', PROG_A, None), ('A', PROG_A, MEL_A), ('B', PROG_B, MEL_B), ('A', PROG_A, MEL_A),
                ('break', PROG_B, None), ('A', PROG_A, MEL_A), ('B', PROG_B, MEL_B), ('A', PROG_A, MEL_A),
                ('B', PROG_B, MEL_B), ('A', PROG_A, MEL_A), ('outro', PROG_A, None)]
    bars = sum(len(p) for _, p, _ in sections)
    N = int(bars * BAR * SR) + SR
    L = np.zeros(N); R = np.zeros(N)
    rng = np.random.default_rng(7)
    noise = rng.uniform(-1, 1, SR)

    def add(sig, t, gl, gr):
        i = int(t * SR); j = min(N, i + len(sig)); L[i:j] += sig[:j - i] * gl; R[i:j] += sig[:j - i] * gr

    t0 = 0.0
    for name, prog, mel in sections:
        for b, ch in enumerate(prog):
            root, tones = CH[ch]; tb = t0 + b * BAR
            # bass: octave-bounce 8ths (triangle)
            for k in range(8):
                m = root if k % 2 == 0 else root + 12
                n = int(STEP * 2 * SR * .9); add(tri(hz(m), n) * env(n, d=.05, s=.8), tb + k * 2 * STEP, .55, .55)
            # arpeggio: 16ths, thin pulse, panned left-ish
            if name != 'outro' or b < 4:
                arp = tones + [tones[0] + 12]
                for k in range(16):
                    m = arp[[0, 1, 2, 3, 2, 1][k % 6] % 4]
                    n = int(STEP * SR * .85); add(pulse(hz(m), n, .125) * env(n, d=.04, s=.3), tb + k * STEP, .16, .09)
            # drums
            for k in range(16):
                ts = tb + k * STEP
                if k in (0, 8) or (k == 10 and b % 2): # kick
                    n = int(.12 * SR); tt = np.arange(n) / SR
                    f = 120 * np.exp(-tt * 30) + 45; kk = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 18)
                    add(kk, ts, .7, .7)
                if k in (4, 12) and name != 'intro' or (name == 'intro' and b >= 4 and k in (4, 12)):  # snare
                    n = int(.11 * SR); add(noise[:n] * np.exp(-np.arange(n) / SR * 28) * .5, ts, .3, .34)
                if k % 2 == 0 or name in ('B',):  # hats
                    n = int(.03 * SR); h = np.diff(noise[:n + 1]); add(h * np.exp(-np.arange(n) / SR * 120) * .25, ts, .1, .16)
            # lead
            if mel:
                for s, l, m in mel[b]:
                    n = int(l * STEP * SR * .92); tt = np.arange(n) / SR
                    vib = 1 + .006 * np.sin(2 * np.pi * 5.5 * tt) * np.clip(tt * 4 - .4, 0, 1)
                    ph = np.cumsum(hz(m) * vib / SR) % 1.0
                    sig = np.where(ph < .5, 1.0, -1.0) * env(n, d=.1, s=.55, r=.04)
                    add(sig * .22, tb + s * STEP, .2, .22)
                    add(sig * .07, tb + s * STEP + .18, .05, .1)      # small echo, right
        t0 += len(prog) * BAR
    x = np.stack([L, R], 1)[:int(t0 * SR) + int(.5 * SR)]
    # gentle low-pass to soften the squares
    from scipy.signal import lfilter
    a = .35
    x = lfilter([a], [1, -(1 - a)], x, axis=0)
    x /= np.max(np.abs(x)) * 1.12
    return x

def main():
    out = sys.argv[1]
    x = render()
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())
    print(out, round(len(x) / SR, 1), 's')

if __name__ == '__main__':
    main()
