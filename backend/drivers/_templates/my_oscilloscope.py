"""
Custom oscilloscope driver stub.

Copy this file, rename the class, and fill in each TODO section with
your instrument-specific SCPI commands or PyMeasure calls.

Register your driver in config/oscilloscopes.yaml:
    driver: "drivers.my_oscilloscope.MyOscilloscope"
"""

from app.instruments.base_driver import (
    BaseOscilloscopeDriver,
    ChannelConfig,
    InstrumentInfo,
    TimebaseConfig,
    TriggerConfig,
    WaveformData,
)


class MyOscilloscope(BaseOscilloscopeDriver):
    """
    Custom driver for <Your Oscilloscope Model>.

    Uses LAN/TCP SCPI communication.  Replace the TODO stubs with
    your instrument's actual command set.

    Optional extras (see the sections at the bottom of this class):
    ``single()``, ``force_trigger()`` and ``autoscale()`` add capabilities,
    and ``report_progress()`` / ``raise_if_cancelled()`` in a block-wise read
    add progress events and the "cancel" button for full-memory reads.
    """

    #: Number of analog input channels (default 4).
    channel_count = 4

    #: Set to True once acquire_waveform() calls raise_if_cancelled() between
    #: the blocks of a max_samples read. Adds the "cancel_acquire" capability.
    supports_cancel_acquire = False

    def __init__(self, ip: str, port: int = 5025) -> None:
        """Initialize the driver with the instrument's network address.

        Args:
            ip: IP address of the oscilloscope.
            port: TCP port number. Defaults to ``5025`` (standard LXI/SCPI port).
        """
        super().__init__(ip, port)
        self._resource = None  # e.g. a PyMeasure Instrument instance

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    def connect(self) -> None:
        """Open a VISA / socket connection to the oscilloscope."""
        # TODO: open connection, e.g.:
        #   import pyvisa
        #   rm = pyvisa.ResourceManager()
        #   self._resource = rm.open_resource(f"TCPIP::{self.ip}::INSTR")
        #   self._resource.timeout = 10_000
        raise NotImplementedError("connect() not implemented")

    def disconnect(self) -> None:
        """Close the instrument connection."""
        # TODO: close self._resource
        raise NotImplementedError("disconnect() not implemented")

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    def identify(self) -> InstrumentInfo:
        """Query *IDN? and return InstrumentInfo."""
        # TODO: idn = self._resource.query("*IDN?").strip()
        raise NotImplementedError("identify() not implemented")

    # ------------------------------------------------------------------
    # Acquisition control
    # ------------------------------------------------------------------

    def run(self) -> None:
        """Start continuous acquisition."""
        # TODO: self._resource.write(":RUN")
        raise NotImplementedError("run() not implemented")

    def stop(self) -> None:
        """Stop acquisition."""
        # TODO: self._resource.write(":STOP")
        raise NotImplementedError("stop() not implemented")

    # ------------------------------------------------------------------
    # Waveform
    # ------------------------------------------------------------------

    def acquire_waveform(self, channel: int, max_samples: bool = False) -> WaveformData:
        """
        Transfer waveform from the given channel and return WaveformData.

        Typical SCPI flow:
          1. Select source channel
          2. Query preamble for scale factors
          3. Transfer raw waveform data
          4. Convert raw bytes → float arrays using preamble
        """
        # TODO: implement waveform readout
        #
        # Example (Keysight):
        #   self._resource.write(f":WAV:SOUR CHAN{channel}")
        #   self._resource.write(":WAV:FORM BYTE")
        #   preamble = self._resource.query(":WAV:PRE?").split(",")
        #   xinc  = float(preamble[4])
        #   xorig = float(preamble[5])
        #   yinc  = float(preamble[7])
        #   yorig = float(preamble[8])
        #   yref  = float(preamble[9])
        #   raw = self._resource.query_binary_values(":WAV:DATA?", datatype="B")
        #   import numpy as np
        #   v = (np.array(raw) - yref - yorig) * yinc
        #   t = np.arange(len(raw)) * xinc + xorig
        #   return WaveformData(channel=channel, time_array=t, voltage_array=v,
        #                       sample_rate=1/xinc, record_length=len(raw))
        raise NotImplementedError("acquire_waveform() not implemented")

    # ------------------------------------------------------------------
    # Screenshot
    # ------------------------------------------------------------------

    def get_screenshot(self) -> bytes:
        """
        Capture a screen image and return PNG bytes.

        Typical SCPI flow:
          :DISP:DATA? PNG  (or instrument-specific command)
        """
        # TODO: implement screen capture
        raise NotImplementedError("get_screenshot() not implemented")

    # ------------------------------------------------------------------
    # Settings queries
    # ------------------------------------------------------------------

    def get_channel_config(self, channel: int) -> ChannelConfig:
        """Return current config for the given channel."""
        # TODO: query :CHAN<n>:DISP?, :CHAN<n>:SCAL?, :CHAN<n>:OFFS?,
        #             :CHAN<n>:COUP?, :CHAN<n>:PROB?
        raise NotImplementedError("get_channel_config() not implemented")

    def get_timebase(self) -> TimebaseConfig:
        """Return current timebase settings."""
        # TODO: query :TIM:SCAL?, :TIM:POS?, :ACQ:SRAT?
        raise NotImplementedError("get_timebase() not implemented")

    def get_trigger(self) -> TriggerConfig:
        """Return current trigger configuration."""
        # TODO: query :TRIG:SOUR?, :TRIG:LEV?, :TRIG:SLOP?, :TRIG:SWE?
        raise NotImplementedError("get_trigger() not implemented")

    # ------------------------------------------------------------------
    # OPTIONAL: extra capabilities
    #
    # Delete what your instrument cannot do. Every method you override is
    # advertised in GET /devices/{id} "capabilities" and unlocks the matching
    # button in the UI; methods you do not override answer 400 "not_supported".
    # ------------------------------------------------------------------

    def single(self) -> None:
        """Arm a single acquisition (capability ``single``)."""
        # TODO: self._resource.write(":SING")
        raise NotImplementedError("single() not implemented")

    def force_trigger(self) -> None:
        """Force a trigger event now (capability ``force_trigger``)."""
        # TODO: self._resource.write(":TFOR")
        raise NotImplementedError("force_trigger() not implemented")

    def autoscale(self) -> None:
        """Run Auto-Setup (capability ``autoscale``).

        Block until the instrument has settled, e.g. by polling ``*OPC?``
        (tolerate timeouts while it is busy), so the next read sees the new
        scales.
        """
        # TODO: self._resource.write(":AUT"); then poll "*OPC?" until it returns 1
        raise NotImplementedError("autoscale() not implemented")

    # ------------------------------------------------------------------
    # OPTIONAL: progress and cancel for full-memory reads
    #
    # Inside acquire_waveform(channel, max_samples=True), read the record in
    # blocks and after EACH block call:
    #
    #     self.report_progress(points_done, points_total)   # SSE progress bar
    #     self.raise_if_cancelled()                         # user pressed "cancel"
    #
    # Both are no-ops when nobody is listening. Put the read in try/finally and
    # restore the instrument (RUN, key lock) in the finally block, because a
    # cancel aborts the read with AcquisitionCancelledError. Then set
    # supports_cancel_acquire = True above. See RigolDS1000Driver for a
    # complete example.
    # ------------------------------------------------------------------
