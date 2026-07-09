---

Design a web dashboard for a laboratory oscilloscope control interface.

Context  
 Scientists use this app to remotely control LAN-connected oscilloscopes, capture waveforms, take screenshots, and archive data to a scientific data management system (OpenBIS). The
UI must feel precise and professional — closer to a lab instrument GUI than a consumer app. Dark theme required (reduces eye strain in lab environments).

---

Pages to design

1. Device List (home)

- Header with app name, logged-in user, and logout button
- Grid of device cards. Each card shows:
  - Device label and ID
  - Status badge: ONLINE (green), LOCKED (amber), OFFLINE (grey), ERROR (red)
  - IP address in small monospace text
  - "Open" button (disabled if OFFLINE)
- Empty state for no devices  


2. Oscilloscope Control (main workspace)  
   Layout: left sidebar | center waveform area | right settings panel  


Left sidebar — Device & Acquisition

- Device name + status badge
- Lock toggle button ("Acquire Lock" / "Release Lock") with session owner shown when locked by another user
- RUN / STOP buttons (large, prominent — green RUN, red STOP)
- SINGLE trigger button
- Force Trigger button
- Capture Screenshot button (camera icon)  


Center — Waveform Display

- Large waveform plot area (dark background, grid lines, oscilloscope-style)
- Up to 4 channel traces in distinct colors (CH1 yellow, CH2 cyan, CH3 magenta, CH4 green — standard oscilloscope convention)
- X-axis: time (auto-scaled with unit prefix: ns, µs, ms, s)
- Y-axis: voltage (V)
- Trigger level indicator line (dashed horizontal)
- Timebase and sample rate readout overlaid bottom-left (monospace)
- Channel scale readouts overlaid per channel (e.g. "CH1 1.00 V/div")
- Toolbar above plot: zoom in/out, pan, reset view, download CSV, download HDF5  


Right settings panel — tabbed

Channels tab

- One collapsible section per channel (CH1–CH4)
- Each section: Enable toggle, vertical scale selector (V/div), offset input (V), coupling selector (AC / DC / GND), probe attenuation selector (1× / 10× / 100×)

Timebase tab

- Horizontal scale selector (s/div, with 1-2-5 steps from 5 ns to 50 s)
- Horizontal offset input (s)
- Acquisition mode selector (Normal / Average / Peak / High Resolution)
- Memory depth selector  


Trigger tab

- Mode: AUTO / NORMAL / SINGLE
- Type: EDGE (show only edge controls for now)
- Source: CH1 / CH2 / CH3 / CH4 / EXT
- Slope: Rising edge / Falling edge / Either
- Level input (V) with up/down nudge buttons  


3. Buffer / Data Archive panel (slide-over or separate page)

- Table of captured artifacts: timestamp, device, type (waveform CSV / screenshot PNG / HDF5), channel, file size
- Row actions: Download, Flag for OpenBIS upload, Delete
- Bulk select + bulk upload to OpenBIS button
- Upload status indicator (pending / uploading / done / error)  


---

Visual style

- Dark background: #0D0F14
- Panel background: #161A22
- Border / divider: #252B36
- Accent / interactive: #3B82F6 (blue)
- Success / RUN: #22C55E
- Danger / STOP: #EF4444
- Warning / LOCKED: #F59E0B
- Text primary: #F1F5F9
- Text secondary: #94A3B8
- Monospace font for all numeric readouts (e.g. JetBrains Mono or IBM Plex Mono)
- Sans-serif UI font (Inter)
- Tight, dense layout — this is a power-user tool, not a marketing page  


Components to build as reusable

- StatusBadge (ONLINE / OFFLINE / LOCKED / ERROR)
- SegmentedControl (for coupling, slope, mode selectors)
- NumericInput with unit label and nudge arrows
- DeviceCard
- WaveformPlot frame (with grid overlay)
- ArtifactRow
