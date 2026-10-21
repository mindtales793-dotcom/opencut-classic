# DarkCut audio core

Dependency-free Rust DSP, compiled to WebAssembly for the browser and Electron.

Rebuild and run the signal tests:

```
rustup target add wasm32-unknown-unknown
node rust/darkcut-audio/build.mjs
```

The browser decodes imported media through Web Audio. The silence detector runs
in a dedicated worker, measuring 10 ms RMS windows independently per channel.
It preserves short pauses, adds adjustable margins, and refuses to remove a
recording with no audible windows. This is amplitude detection, not speech
recognition; audible music or background noise can prevent a silence match.

The UI adapter composes existing split/delete/move commands from end to start.
It captures a scene snapshot, checks that the timeline did not change during
analysis, moves all lanes and bookmarks, and supports one undo/redo operation.
The original media files remain untouched. The Windows smoke test imports a
synthetic three-second WAV with a one-second pause, verifies the cut and absence
of a timeline gap, then undoes it.

Music helpers calculate volume envelopes, peak normalization and loop lengths.
Normalization is sample-peak normalization, not LUFS or true-peak mastering.
Ducking follows narration clip intervals (after silence cuts, voice fragments),
with editable volume keyframes. Loop replaces the A2 contents with repetitions
of its first clip; undo restores the previous track.

Narration jobs are a local Node/Electron platform feature. Completed MP3s and
job metadata are stored in Electron user data; API keys are not written into
job files. Changing tabs preserves running work. On Windows, closing a window with active
tasks hides it to the system tray and keeps processing; the tray menu can
explicitly stop and quit. Reopening can recover complete
jobs or restart an interrupted request using the saved script. It does not
resume midway through a Fish API request; an interrupted upstream request may
need to be generated again. Export does not resume after the process exits.
