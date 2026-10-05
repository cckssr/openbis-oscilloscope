#
# This file is part of the PyMeasure package.
#
# Copyright (c) 2013-2025 PyMeasure Developers
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
#

import numpy as np
import time
from pymeasure.instruments import Instrument, Channel, SCPIMixin
from pymeasure.instruments.validators import (
    truncated_discrete_set,
    truncated_range,
    strict_discrete_set,
)


class OscilloscopeChannel(Channel):
    """Represents a single channel of an oscilloscope."""

    bandwidth = Instrument.control(
        get_command=":CHANnel{ch}:BWLimit?",
        set_command=":CHANnel{ch}:BWLimit %s",
        docs="""Control the bandwidth limit of the channel.
        
        Valid values are OFF and 20M. The 20 MHz limit attenuates high-frequency components.""",
        validator=strict_discrete_set,
        values=["OFF", "20M"],
    )

    coupling = Instrument.control(
        get_command=":CHANnel{ch}:COUPling?",
        set_command=":CHANnel{ch}:COUPling %s",
        docs="""Control the coupling mode of the channel.
        
        Valid values are:
        - AC: DC components are blocked.
        - DC: DC and AC components are allowed.
        - GND: DC and AC components are blocked, channel output is grounded.""",
        validator=strict_discrete_set,
        values=["AC", "DC", "GND"],
    )

    is_enabled = Instrument.control(
        get_command=":CHANnel{ch}:DISPlay?",
        set_command=":CHANnel{ch}:DISPlay %d",
        docs="""Control if the channel is enabled (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    is_inverted = Instrument.control(
        get_command=":CHANnel{ch}:INVert?",
        set_command=":CHANnel{ch}:INVert %d",
        docs="""Control if the waveform of the channel is inverted (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    offset = Instrument.control(
        get_command=":CHANnel{ch}:OFFSet?",
        set_command=":CHANnel{ch}:OFFSet %f",
        docs="""Control the vertical offset of the channel in volts (float).
        
        The valid range depends on the vertical scale and probe ratio. With the default setting of
        10x probe and a vertical scale of:
        - < 5 V/div: -20 V to 20 V
        - >= 5 V/div: -1000 V to 1000 V.""",
        validator=truncated_range,
        values=(-20.0, 20.0),
        dynamic=False,  # TODO: implement dynamic range based on vertical scale and probe ratio
        # https://pymeasure.readthedocs.io/en/latest/dev/adding_instruments/properties.html#dynamic-validity-range
    )

    range = Instrument.control(
        get_command=":CHANnel{ch}:RANGe?",
        set_command=":CHANnel{ch}:RANGe %f",
        docs="""Control the vertical range of the channel in volts (float).
        
        The valid range depends on the probe ratio. With the default setting of 10x probe, valid
        values are between 0.08 V and 800 V. 
        The command sets the vertical scale to range / 8 (volts / div).""",
        validator=truncated_range,
        values=(0.08, 800.0),
        dynamic=False,  # TODO: implement dynamic range based on probe ratio
        # https://pymeasure.readthedocs.io/en/latest/dev/adding_instruments/properties.html#dynamic-validity-range
        # When the probe ratio is 1X: 8mV to 80V When the probe ratio is 10X: 80mV to 800V
    )

    delay_calibration = Instrument.control(
        get_command=":CHANnel{ch}:TCAL?",
        set_command=":CHANnel{ch}:TCAL %e",
        docs="""Control the delay calibration time of the channel in seconds (float).

        The time is used to calibrate the zero time offset of the channel. Valid values are between
        -100 ns (-1e-7) and 100 ns (1e-7). The allowed increments depend on the horizontal scale,
        normally 1 / 50 th of the horizontal scale. For the timebase 1 us to 10 us, valid increments
        are 20 ns (2e-8).""",
        validator=truncated_range,
        values=(-1e-7, 1e-7),
        dynamic=False,  # TODO: implement dynamic increments based on horizontal scale
        # https://pymeasure.readthedocs.io/en/latest/dev/adding_instruments/properties.html#dynamic-validity-range
    )

    scale = Instrument.control(
        get_command=":CHANnel{ch}:SCALe?",
        set_command=":CHANnel{ch}:SCALe %f",
        docs="""Control the vertical scale of the channel in volts per division (float).

        The valid range depends on the probe ratio. With the default setting of 10x probe, valid
        values are between 0.01 V/div and 100 V/div. The command sets the vertical range to
        scale * 8 volts.""",
        validator=truncated_range,
        values=(0.01, 100.0),
        dynamic=False,  # TODO: implement dynamic range based on probe ratio
        # https://pymeasure.readthedocs.io/en/latest/dev/adding_instruments/properties.html#dynamic-validity-range
        # When the probe ratio is 1X: 1mV/div to 10V/div
        # When the probe ratio is 10X: 10mV/div to 100V/div
    )

    probe_ratio = Instrument.control(
        get_command=":CHANnel{ch}:PROBe?",
        set_command=":CHANnel{ch}:PROBe %f",
        docs="""Control the probe attenuation ratio of the channel (float).

        Valid values are 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500,
        and 1000. The probe ratio affects the vertical scale and offset ranges.""",
        validator=truncated_discrete_set,
        values=[
            0.01,
            0.02,
            0.05,
            0.1,
            0.2,
            0.5,
            1,
            2,
            5,
            10,
            20,
            50,
            100,
            200,
            500,
            1000,
        ],
    )

    units = Instrument.control(
        get_command=":CHANnel{ch}:UNITs?",
        set_command=":CHANnel{ch}:UNITs %s",
        docs="""Control the amplitude display units of the channel.

        Valid values are:
        - VOLT: Voltage (V)
        - WATT: Power (W)
        - AMP: Current (A)
        - UNKN: Unknown units""",
        validator=strict_discrete_set,
        values=["VOLT", "WATT", "AMP", "UNKN"],
    )

    vernier_enabled = Instrument.control(
        get_command=":CHANnel{ch}:VERNier?",
        set_command=":CHANnel{ch}:VERNier %d",
        docs="""Control if fine adjustment (vernier) is enabled for the channel (bool).

        When enabled, allows fine adjustment of the vertical scale and timebase scale
        with finer granularity.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )


class RigolDS1000ZSeries(SCPIMixin, Instrument):
    """Represents the Rigol DS1000Z series of oscilloscopes.

    Supports DS1054Z, DS1074Z, DS1104Z, DS1074Z-S, DS1104Z-S,
    MSO1074Z, MSO1104Z, MSO1074Z-S, MSO1104Z-S and Plus variants.

    Connection to the instrument is made through a VISA adapter, typically
    over USB or LAN (TCP/IP).

    .. code-block:: python

        scope = RigolDS1000ZSeries("TCPIP::192.168.1.100::INSTR")
        scope.ch1.scale = 1.0         # 1 V/div
        scope.ch1.coupling = "DC"
        scope.timebase_scale = 1e-3   # 1 ms/div
        scope.trigger_edge_level = 0.5
        scope.run()
    """

    _ANALOG_CHANNELS = ["CHAN1", "CHAN2", "CHAN3", "CHAN4"]
    _DIGITAL_CHANNELS = [
        "D0",
        "D1",
        "D2",
        "D3",
        "D4",
        "D5",
        "D6",
        "D7",
        "D8",
        "D9",
        "D10",
        "D11",
        "D12",
        "D13",
        "D14",
        "D15",
    ]
    _GROUP_CHANNELS = ["GRO1", "GRO2", "GRO3", "GRO4"]
    _CHANNEL_LIST = _ANALOG_CHANNELS + _DIGITAL_CHANNELS
    _CHANNEL_LIST_EXT = _CHANNEL_LIST + ["EXT", "EXT5", "ACL"]
    _CHANNEL_LIST_MATH = _CHANNEL_LIST + ["MATH"]
    _CHANNEL_LIST_WAVEFORM = _CHANNEL_LIST + [
        "MATH",
        "REF1",
        "REF2",
        "REF3",
        "REF4",
        "REF5",
        "REF6",
        "REF7",
        "REF8",
        "REF9",
        "REF10",
    ]
    _CHANNEL_LIST_DGROUPS = _DIGITAL_CHANNELS + _GROUP_CHANNELS + ["NONE"]

    ch1: OscilloscopeChannel = Instrument.ChannelCreator(OscilloscopeChannel, "1")  # type: ignore[assignment]
    ch2: OscilloscopeChannel = Instrument.ChannelCreator(OscilloscopeChannel, "2")  # type: ignore[assignment]
    ch3: OscilloscopeChannel = Instrument.ChannelCreator(OscilloscopeChannel, "3")  # type: ignore[assignment]
    ch4: OscilloscopeChannel = Instrument.ChannelCreator(OscilloscopeChannel, "4")  # type: ignore[assignment]

    def __init__(self, adapter, name="Rigol DS1000Z Series", **kwargs):
        super().__init__(adapter, name, **kwargs)

    def autoscale(self):
        """Set the waveform auto setting."""
        self.write(":AUToscale")

    def run(self):
        """Set the oscilloscope to run mode."""
        self.write(":RUN")

    def stop(self):
        """Set the oscilloscope to stop mode."""
        self.write(":STOP")

    def force_trigger(self):
        """Force a trigger event."""
        self.write(":TFORce")

    # ##################
    # IEEE488.2 commands
    # ##################

    def clear_registers(self):
        """Clear the status registers of the oscilloscope."""
        self.write("*CLS")

    # #################
    # Acquire Subsystem
    # #################
    acq_averages = Instrument.control(
        get_command=":ACQuire:AVERages?",
        set_command=":ACQuire:AVERages %d",
        docs="""Control the number of averages (int) used in acquisition.
        
        Valid values are 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024 (2^n with n=1..10).
        Only works if acquisition mode (acq_mode = 'AVERAGES') is set to AVERAGES.""",
        validator=truncated_discrete_set,
        values=[2, 4, 8, 16, 32, 64, 128, 256, 512, 1024],
    )

    acq_memory_depth = Instrument.control(
        get_command=":ACQuire:MDEPth?",
        set_command=":ACQuire:MDEPth %s",
        docs="""Control the memory depth (int) of the acquisition.
        
        Valid values are AUTO and between 12k and 24M. The actual valid range depends on the count 
        of channels enabled, if the channel is analog or digital, and the sample rate:
        - Analog channels:
            - 1 channel: 12k to 24M
            - 2 channels: 6k to 12M
            - 4 channels: 3k to 6M
        - Digital channels:
            - 8 channels: 12k to 24M
            - 16 channels: 6k to 12M""",
        validator=strict_discrete_set,
        values=[
            "AUTO",
            3_000,
            6_000,
            12_000,
            30_000,
            60_000,
            120_000,
            300_000,
            600_000,
            1_200_000,
            3_000_000,
            6_000_000,
            12_000_000,
            24_000_000,
        ],
    )

    acq_mode = Instrument.control(
        get_command=":ACQuire:TYPE?",
        set_command=":ACQuire:TYPE %s",
        docs="""Control the acquisition mode.
        
        Valid values are:
        - NORMAL: Signal is sampled at equal intervals.
        - AVERAGES: Signal is averaged over samples set by acq_averages.
        - PEAK: Signal maximum and minimum values within sample interval.
        - HRESOLUTION: Ultra-sampling with neighboring averages.""",
        validator=strict_discrete_set,
        values={
            "NORMAL": "NORM",
            "AVERAGES": "AVER",
            "PEAK": "PEAK",
            "HRESOLUTION": "HRES",
        },
    )

    acq_sample_rate = Instrument.measurement(
        get_command="ACQuire:SRATe?",
        docs="""Get the current sample rate in Samples / s (float).
        
        The sample rate is returned in scientific notation.""",
    )

    # #####################
    # Calibration Subsystem
    # #####################
    def cal_start(self):
        """Control the start of the oscilloscope calibration process.

        The calibration process can improve the working state of the oscilloscope.
        Every channels must be disconnected."""
        self.write(":CALibrate:STARt")

    def cal_stop(self):
        """Control the stop of the oscilloscope calibration process."""
        self.write(":CALibrate:QUIT")

    # ##################
    # Timebase Subsystem
    # ##################
    timebase_offset = Instrument.control(
        get_command=":TIMebase:MAIN:OFFSet?",
        set_command=":TIMebase:MAIN:OFFSet %f",
        docs="""Control the timebase offset (delay) in seconds (float).

        The offset represents the time between the trigger point and the screen center. Valid values
        depend on the timebase scale. The range is typically -screen_width/2 to 1000*screen_width.""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
        dynamic=False,  # TODO: implement dynamic range based on timebase scale
        # https://pymeasure.readthedocs.io/en/latest/dev/adding_instruments/properties.html#dynamic-validity-range
    )

    timebase_scale = Instrument.control(
        get_command=":TIMebase:MAIN:SCALe?",
        set_command=":TIMebase:MAIN:SCALe %e",
        docs="""Control the timebase scale in seconds per division (float).

        Valid values range from 5 ns/div (5e-9) to 50 s/div (50), with 1-2-5 sequence steps.
        The command affects the horizontal display range.""",
        validator=strict_discrete_set,
        values=[
            5e-9,
            10e-9,
            20e-9,
            50e-9,
            100e-9,
            200e-9,
            500e-9,
            1e-6,
            2e-6,
            5e-6,
            10e-6,
            20e-6,
            50e-6,
            100e-6,
            200e-6,
            500e-6,
            1e-3,
            2e-3,
            5e-3,
            10e-3,
            20e-3,
            50e-3,
            100e-3,
            200e-3,
            500e-3,
            1.0,
            2.0,
            5.0,
            10.0,
            20.0,
            50.0,
        ],
    )

    timebase_mode = Instrument.control(
        get_command=":TIMebase:MODE?",
        set_command=":TIMebase:MODE %s",
        docs="""Control the timebase mode.

        Valid values are:
        - MAIN: Normal timebase mode
        - XY: XY display mode (channel 1 vs channel 2)
        - ROLL: Roll mode for slow timebase (>= 200 ms/div)""",
        validator=strict_discrete_set,
        values=["MAIN", "XY", "ROLL"],
    )

    timebase_delay_enabled = Instrument.control(
        get_command=":TIMebase:DELay:ENABle?",
        set_command=":TIMebase:DELay:ENABle %d",
        docs="""Control if the delayed timebase is enabled (bool).

        When enabled, allows zoomed viewing of a portion of the waveform.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    timebase_delay_offset = Instrument.control(
        get_command=":TIMebase:DELay:OFFSet?",
        set_command=":TIMebase:DELay:OFFSet %f",
        docs="""Control the delayed timebase offset in seconds (float).

        The offset represents the time from the trigger point to the delayed timebase reference.
        Valid range depends on the main timebase scale.""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
        dynamic=False,  # TODO: implement dynamic range based on main timebase scale
        # https://pymeasure.readthedocs.io/en/latest/dev/adding_instruments/properties.html#dynamic-validity-range
    )

    timebase_delay_scale = Instrument.control(
        get_command=":TIMebase:DELay:SCALe?",
        set_command=":TIMebase:DELay:SCALe %e",
        docs="""Control the delayed timebase scale in seconds per division (float).

        Valid values range from 5 ns/div (5e-9) to main timebase scale. The delayed timebase scale
        must be less than or equal to the main timebase scale.""",
        validator=strict_discrete_set,
        values=[
            5e-9,
            10e-9,
            20e-9,
            50e-9,
            100e-9,
            200e-9,
            500e-9,
            1e-6,
            2e-6,
            5e-6,
            10e-6,
            20e-6,
            50e-6,
            100e-6,
            200e-6,
            500e-6,
            1e-3,
            2e-3,
            5e-3,
            10e-3,
            20e-3,
            50e-3,
            100e-3,
            200e-3,
            500e-3,
            1.0,
            2.0,
            5.0,
            10.0,
            20.0,
            50.0,
        ],
    )

    # Trigger Subsystem - Common Settings
    trigger_mode = Instrument.control(
        get_command=":TRIGger:MODE?",
        set_command=":TRIGger:MODE %s",
        docs="""Control the trigger mode.

        Valid values are:
        - EDGE: Edge trigger
        - PULS: Pulse width trigger
        - RUNT: Runt pulse trigger
        - WINDOWS: Windows trigger
        - NEDGE: Nth edge trigger
        - SLOPE: Slope trigger
        - VIDEO: Video trigger
        - PATTERN: Pattern trigger
        - DELAY: Delay trigger
        - TIMEOUT: Timeout trigger
        - DURATION: Duration trigger
        - SHOL: Setup/Hold trigger
        - RS232: RS232 trigger
        - IIC: I2C trigger
        - SPI: SPI trigger""",
        validator=strict_discrete_set,
        values=[
            "EDGE",
            "PULS",
            "RUNT",
            "WIND",
            "NEDG",
            "SLOP",
            "VID",
            "PATT",
            "DEL",
            "TIM",
            "DUR",
            "SHOL",
            "RS232",
            "IIC",
            "SPI",
        ],
    )

    trigger_coupling = Instrument.control(
        get_command=":TRIGger:COUPling?",
        set_command=":TRIGger:COUPling %s",
        docs="""Control the trigger coupling mode.

        Valid values are:
        - AC: AC coupling, blocks DC components
        - DC: DC coupling, allows DC and AC components
        - LFReject: Low frequency reject, attenuates frequencies below ~8 kHz
        - HFReject: High frequency reject, attenuates frequencies above ~150 kHz""",
        validator=strict_discrete_set,
        values=["AC", "DC", "LFR", "HFR"],
    )

    trigger_status = Instrument.measurement(
        get_command=":TRIGger:STATus?",
        docs="""Get the current trigger status (read-only).

        Possible values are:
        - TD: Triggered
        - WAIT: Waiting for trigger
        - RUN: Running in auto mode
        - AUTO: Auto trigger mode active
        - STOP: Stopped""",
    )

    trigger_sweep = Instrument.control(
        get_command=":TRIGger:SWEep?",
        set_command=":TRIGger:SWEep %s",
        docs="""Control the trigger sweep mode.

        Valid values are:
        - AUTO: Automatic trigger, will auto-trigger if no event within timeout
        - NORM: Normal trigger, waits for valid trigger event
        - SING: Single trigger, stops after one trigger event""",
        validator=strict_discrete_set,
        values=["AUTO", "NORM", "SING"],
    )

    trigger_holdoff = Instrument.control(
        get_command=":TRIGger:HOLDoff?",
        set_command=":TRIGger:HOLDoff %e",
        docs="""Control the trigger holdoff time in seconds (float).

        The holdoff time is the minimum time before the trigger circuit can re-arm after a trigger
        event. Valid range is 500 ns (5e-7) to 10 s (10.0).""",
        validator=truncated_range,
        values=(500e-9, 10.0),
    )

    trigger_noise_reject = Instrument.control(
        get_command=":TRIGger:NREJect?",
        set_command=":TRIGger:NREJect %d",
        docs="""Control if trigger noise rejection is enabled (bool).

        When enabled, reduces sensitivity to noise on the trigger signal.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    # Trigger Subsystem - Edge Trigger
    trigger_edge_source = Instrument.control(
        get_command=":TRIGger:EDGe:SOURce?",
        set_command=":TRIGger:EDGe:SOURce %s",
        docs="""Control the edge trigger source.

        Valid values are CHANnel1, CHANnel2, CHANnel3, CHANnel4, EXT, EXTernal5, ACLine, D0-D15
        (for digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST_EXT,
    )

    trigger_edge_slope = Instrument.control(
        get_command=":TRIGger:EDGe:SLOPe?",
        set_command=":TRIGger:EDGe:SLOPe %s",
        docs="""Control the edge trigger slope.

        Valid values are:
        - POSitive: Trigger on rising edge
        - NEGative: Trigger on falling edge
        - RFAL: Trigger on rising or falling edge (either edge)""",
        validator=strict_discrete_set,
        values=["POS", "NEG", "RFAL"],
    )

    trigger_edge_level = Instrument.control(
        get_command=":TRIGger:EDGe:LEVel?",
        set_command=":TRIGger:EDGe:LEVel %f",
        docs="""Control the edge trigger level in volts (float).

        The trigger level is the voltage threshold that the signal must cross to generate a trigger
        event. Valid range depends on the vertical scale and offset of the trigger source.""",
        validator=truncated_range,
        values=(-100.0, 100.0),
        dynamic=False,  # TODO: implement dynamic range based on source channel vertical settings https://pymeasure.readthedocs.io/en/latest/dev/adding_instruments/properties.html#dynamic-validity-range
    )

    # Waveform Subsystem
    waveform_source = Instrument.control(
        get_command=":WAVeform:SOURce?",
        set_command=":WAVeform:SOURce %s",
        docs="""Control the waveform data source.

        Valid values are CHANnel1-4, MATH, D0-D15 (digital channels on MSO models), and REF1-10
        (reference waveforms).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST_WAVEFORM,
    )

    waveform_mode = Instrument.control(
        get_command=":WAVeform:MODE?",
        set_command=":WAVeform:MODE %s",
        docs="""Control the waveform reading mode.

        Valid values are:
        - NORM: Normal mode, reads displayed data points
        - MAX: Maximum mode, reads maximum number of data points
        - RAW: Raw mode, reads data from internal memory""",
        validator=strict_discrete_set,
        values=["NORM", "MAX", "RAW"],
    )

    waveform_format = Instrument.control(
        get_command=":WAVeform:FORMat?",
        set_command=":WAVeform:FORMat %s",
        docs="""Control the format of waveform data transmission.

        Valid values are:
        - WORD: 16-bit binary data (2 bytes per point)
        - BYTE: 8-bit binary data (1 byte per point)
        - ASCii: ASCII format (comma-separated values)""",
        validator=strict_discrete_set,
        values=["WORD", "BYTE", "ASC"],
    )

    waveform_start = Instrument.control(
        get_command=":WAVeform:STARt?",
        set_command=":WAVeform:STARt %d",
        docs="""Control the starting point for waveform data reading (int).

        Valid range is 1 to the number of points in the waveform memory.""",
        validator=truncated_range,
        values=(1, 250_000_000),
    )

    waveform_stop = Instrument.control(
        get_command=":WAVeform:STOP?",
        set_command=":WAVeform:STOP %d",
        docs="""Control the stopping point for waveform data reading (int).

        Valid range is 1 to the number of points in the waveform memory. Must be greater than
        or equal to waveform_start.""",
        validator=truncated_range,
        values=(1, 250_000_000),
    )

    waveform_xincrement = Instrument.measurement(
        get_command=":WAVeform:XINCrement?",
        docs="""Get the time difference between two adjacent waveform points in seconds (float).

        This value is used to calculate the time coordinate of each data point.""",
    )

    waveform_xorigin = Instrument.measurement(
        get_command=":WAVeform:XORigin?",
        docs="""Get the time offset of the first waveform point in seconds (float).

        This is the time between the trigger point and the first data point.""",
    )

    waveform_xreference = Instrument.measurement(
        get_command=":WAVeform:XREFerence?",
        docs="""Get the reference time of the waveform in seconds (float).

        This is typically 0 and represents the trigger point.""",
    )

    waveform_yincrement = Instrument.measurement(
        get_command=":WAVeform:YINCrement?",
        docs="""Get the voltage difference per vertical division in volts (float).

        Used to convert raw waveform data values to voltage:
        voltage = (value - yreference) * yincrement + yorigin""",
    )

    waveform_yorigin = Instrument.measurement(
        get_command=":WAVeform:YORigin?",
        docs="""Get the voltage offset of the waveform in volts (float).

        Used in the voltage conversion formula:
        voltage = (value - yreference) * yincrement + yorigin""",
    )

    waveform_yreference = Instrument.measurement(
        get_command=":WAVeform:YREFerence?",
        docs="""Get the reference position in the vertical direction (int).

        Typically represents the vertical center position. Used in the voltage conversion formula:
        voltage = (value - yreference) * yincrement + yorigin""",
    )

    def get_waveform_preamble(self):
        """Get all waveform preamble parameters as a dictionary.

        Returns a dictionary containing:
        - format: The waveform data format
        - type: The acquisition type
        - points: Number of waveform points
        - count: Number of averages (for average mode)
        - xincrement: Time between points (s)
        - xorigin: Time of first point (s)
        - xreference: Reference time (s)
        - yincrement: Voltage per code (V)
        - yorigin: Voltage offset (V)
        - yreference: Reference code value
        """
        preamble = self.ask(":WAVeform:PREamble?")
        values = preamble.split(",")
        return {
            "format": int(values[0]),
            "type": int(values[1]),
            "points": int(values[2]),
            "count": int(values[3]),
            "xincrement": float(values[4]),
            "xorigin": float(values[5]),
            "xreference": float(values[6]),
            "yincrement": float(values[7]),
            "yorigin": float(values[8]),
            "yreference": float(values[9]),
        }

    def get_waveform_data(self, raw=False, return_preamble=False):
        """Retrieve waveform data from the oscilloscope in batches if necessary.

        The Rigol DS1000Z can only transfer a maximum of 250,000 points per request.
        This method automatically handles larger waveforms by fetching them in batches
        and reassembling the complete data.

        Args:
            raw: If True, returns raw binary data. If False (default), converts to voltage values
                 using the preamble parameters.
            return_preamble: If True, returns both the waveform data and the preamble parameters.

        Returns:
            If raw=True: bytes object containing raw waveform data
            If raw=False: numpy array of voltage values (requires numpy)
            If return_preamble=True: tuple of (waveform_data, preamble)
        """
        # Get preamble first to determine total points
        preamble = self.get_waveform_preamble()
        total_points = preamble["points"]
        max_points_per_batch = 250_000

        if total_points <= max_points_per_batch:
            # Single batch — fetch directly
            self.waveform_start = 1
            self.write(":WAVeform:DATA?")
            raw_response: bytes = self.adapter.connection.read_raw()
            all_data_bytes = self._parse_tmc_response(raw_response)
        else:
            # Multiple batches: fetch sequentially without buffering
            # This is more reliable than pipelining with some VISA implementations
            num_batches = (
                total_points + max_points_per_batch - 1
            ) // max_points_per_batch

            print(
                f"Fetching {total_points} points in {num_batches} batches "
                f"(max {max_points_per_batch} per batch)..."
            )

            chunks = []
            for batch_idx in range(num_batches):
                start_point = batch_idx * max_points_per_batch + 1  # 1-indexed
                end_point = min((batch_idx + 1) * max_points_per_batch, total_points)

                # Set waveform start/stop for this batch
                self.waveform_start = start_point
                self.waveform_stop = end_point

                # Request and read immediately (no buffering)
                self.write(":WAVeform:DATA?")
                raw_response: bytes = self.adapter.connection.read_raw()
                batch_data = self._parse_tmc_response(raw_response)
                chunks.append(batch_data)

                print(
                    f"  Batch {batch_idx + 1}/{num_batches}: "
                    f"points {start_point}-{end_point} ({len(batch_data)} bytes)"
                )
            all_data_bytes = b"".join(chunks)

        if raw:
            return all_data_bytes

        # Convert raw bytes to numeric samples
        if self.waveform_format == "BYTE":
            values = np.frombuffer(all_data_bytes, dtype=np.uint8)
        elif self.waveform_format == "WORD":
            values = np.frombuffer(all_data_bytes, dtype=np.uint16)
        else:  # ASCII — safe to decode as text
            values = np.array(
                [float(v) for v in all_data_bytes.decode("ascii").split(",")]
            )

        # Convert ADC counts → volts
        voltages = (values - preamble["yreference"]) * preamble[
            "yincrement"
        ] + preamble["yorigin"]
        if return_preamble:
            return voltages, preamble
        return voltages

    def _parse_tmc_response(self, raw_response: bytes) -> bytes:
        """Parse IEEE 488.2 / TMC block format response.

        Format: #<N><LLL…><data bytes><terminator>
        - '#'        – literal pound sign (0x23)
        - <N>        – single ASCII digit: number of decimal digits in length field
        - <LLL…>     – <N> ASCII decimal digits giving the byte count of <data>
        - <data>     – raw payload bytes
        - <terminator> – trailing '\n' (0x0A)

        Args:
            raw_response: Raw VISA response bytes

        Returns:
            Extracted data bytes (without header and terminator)
        """
        n_digits = raw_response[1] - ord("0")  # e.g. b'4' → 4
        header_len = 2 + n_digits  # '#' + N-char + length digits
        data_bytes = raw_response[header_len:].rstrip(b"\n\r")
        return data_bytes

    # Display Subsystem
    def display_clear(self):
        """Clear all waveforms on the screen."""
        self.write(":DISPlay:CLEar")

    display_type = Instrument.control(
        get_command=":DISPlay:TYPE?",
        set_command=":DISPlay:TYPE %s",
        docs="""Control the display connection type for waveform points.

        Valid values are:
        - VECTors: Connect waveform points with vectors (lines)
        - DOTS: Display waveform points as dots only""",
        validator=strict_discrete_set,
        values=["VECT", "DOTS"],
    )

    display_grading_time = Instrument.control(
        get_command=":DISPlay:GRADing:TIME?",
        set_command=":DISPlay:GRADing:TIME %f",
        docs="""Control the persistence time in seconds (float).

        Sets how long waveform data persists on screen. Valid values are 0.1 to 10 seconds,
        or special values MIN (minimum persistence) and INFinite (infinite persistence).""",
        validator=truncated_range,
        values=(0.1, 10.0),
    )

    display_waveform_brightness = Instrument.control(
        get_command=":DISPlay:WBRightness?",
        set_command=":DISPlay:WBRightness %d",
        docs="""Control the waveform brightness as a percentage (int).

        Valid range is 0 to 100 percent.""",
        validator=truncated_range,
        values=(0, 100),
    )

    display_grid = Instrument.control(
        get_command=":DISPlay:GRID?",
        set_command=":DISPlay:GRID %s",
        docs="""Control the grid display mode.

        Valid values are:
        - FULL: Full grid lines
        - HALF: Half grid (only center lines)
        - NONE: No grid""",
        validator=strict_discrete_set,
        values=["FULL", "HALF", "NONE"],
    )

    display_grid_brightness = Instrument.control(
        get_command=":DISPlay:GBRightness?",
        set_command=":DISPlay:GBRightness %d",
        docs="""Control the grid brightness as a percentage (int).

        Valid range is 0 to 100 percent.""",
        validator=truncated_range,
        values=(0, 100),
    )

    def get_display_data(self):
        """Retrieve a screenshot of the oscilloscope display.

        Returns a bytes object containing image data in the format specified by
        storage_image_type (BMP, BMP8, PNG, or JPEG). The data can be saved directly
        to a file or processed further.

        Example:
            screenshot = scope.get_display_data()
            with open('screenshot.png', 'wb') as f:
                f.write(screenshot)
        """
        self.write(":DISPlay:DATA?")

        # Read binary data directly to avoid unicode decoding errors
        # For VISA connections, use read_raw() to get bytes without decoding
        if hasattr(self.adapter, "connection") and hasattr(
            self.adapter.connection, "read_raw"
        ):
            data_bytes = self.adapter.connection.read_raw()
        else:
            # Fallback: try to read as string and encode
            data = self.read()
            data_bytes = data.encode("latin-1")

        # TMC (Test & Measurement Class) data format: #<digit><length><data>
        # First character is '#', second is number of digits in length field
        if data_bytes[0:1] == b"#":
            header_len = int(chr(data_bytes[1])) + 2
            image_data = data_bytes[header_len:-1]  # Remove header and trailing newline
            return image_data
        return data_bytes

    # Measurement Subsystem
    measure_source = Instrument.control(
        get_command=":MEASure:SOURce?",
        set_command=":MEASure:SOURce %s",
        docs="""Control the source for single-item measurements.

        Valid values are CHANnel1-4, MATH, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST_MATH,
    )

    measure_counter_source = Instrument.control(
        get_command=":MEASure:COUNter:SOURce?",
        set_command=":MEASure:COUNter:SOURce %s",
        docs="""Control the source for frequency counter measurements.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    measure_counter_value = Instrument.measurement(
        get_command=":MEASure:COUNter:VALue?",
        docs="""Get the frequency counter measurement value in Hz (float).""",
    )

    def measure_clear(self):
        """Clear all measurements from the display."""
        self.write(":MEASure:CLEar ALL")

    def measure_recover(self):
        """Recover the last cleared measurement."""
        self.write(":MEASure:RECOver")

    measure_all_display = Instrument.control(
        get_command=":MEASure:ADISplay?",
        set_command=":MEASure:ADISplay %d",
        docs="""Control if all 5 measurement items are displayed simultaneously (bool).

        When enabled, shows all configured measurement items on screen.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    measure_all_source = Instrument.control(
        get_command=":MEASure:AMSource?",
        set_command=":MEASure:AMSource %s",
        docs="""Control the source for all-measurement mode.

        Valid values are CHANnel1-4, MATH, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST_MATH,
    )

    measure_setup_max = Instrument.control(
        get_command=":MEASure:SETup:MAX?",
        set_command=":MEASure:SETup:MAX %d",
        docs="""Control the upper threshold percentage for measurements (int).

        Valid range is 7 to 95 percent. Used for rise time, fall time, and other measurements
        that require threshold levels.""",
        validator=truncated_range,
        values=(7, 95),
    )

    measure_setup_mid = Instrument.control(
        get_command=":MEASure:SETup:MID?",
        set_command=":MEASure:SETup:MID %d",
        docs="""Control the middle threshold percentage for measurements (int).

        Valid range is 7 to 95 percent. Must be between MIN and MAX thresholds.""",
        validator=truncated_range,
        values=(7, 95),
    )

    measure_setup_min = Instrument.control(
        get_command=":MEASure:SETup:MIN?",
        set_command=":MEASure:SETup:MIN %d",
        docs="""Control the lower threshold percentage for measurements (int).

        Valid range is 5 to 93 percent. Used for rise time, fall time, and other measurements
        that require threshold levels.""",
        validator=truncated_range,
        values=(5, 93),
    )

    measure_phase_source_a = Instrument.control(
        get_command=":MEASure:SETup:PSA?",
        set_command=":MEASure:SETup:PSA %s",
        docs="""Control source A for phase measurements.

        Valid values are CHANnel1-4.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4"],
    )

    measure_phase_source_b = Instrument.control(
        get_command=":MEASure:SETup:PSB?",
        set_command=":MEASure:SETup:PSB %s",
        docs="""Control source B for phase measurements.

        Valid values are CHANnel1-4.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4"],
    )

    measure_delay_source_a = Instrument.control(
        get_command=":MEASure:SETup:DSA?",
        set_command=":MEASure:SETup:DSA %s",
        docs="""Control source A for delay measurements.

        Valid values are CHANnel1-4.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4"],
    )

    measure_delay_source_b = Instrument.control(
        get_command=":MEASure:SETup:DSB?",
        set_command=":MEASure:SETup:DSB %s",
        docs="""Control source B for delay measurements.

        Valid values are CHANnel1-4.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4"],
    )

    measure_statistic_display = Instrument.control(
        get_command=":MEASure:STATistic:DISPlay?",
        set_command=":MEASure:STATistic:DISPlay %d",
        docs="""Control if measurement statistics are displayed (bool).

        When enabled, shows min, max, mean, and standard deviation for measurements.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    measure_statistic_mode = Instrument.control(
        get_command=":MEASure:STATistic:MODE?",
        set_command=":MEASure:STATistic:MODE %s",
        docs="""Control the statistics calculation mode.

        Valid values are:
        - DIFF: Difference mode, calculates statistics on differences between measurements
        - EXTR: Extremum mode, shows minimum and maximum values""",
        validator=strict_discrete_set,
        values=["DIFF", "EXTR"],
    )

    def measure_statistic_reset(self):
        """Reset measurement statistics calculations."""
        self.write(":MEASure:STATistic:RESet")

    def measure_item(self, item, source=None):
        """Measure a specific item.

        Args:
            item: Measurement item name (e.g., "VMAX", "VMIN", "VPP", "FREQ", "PER", etc.)
            source: Optional source channel (e.g., "CHAN1"). If not provided, uses current
                   measure_source setting.

        Returns:
            Measurement value as float

        Common measurement items:
            Voltage: VMAX, VMIN, VPP, VTOP, VBASe, VAMP, VAVG, VRMS, OVERshoot, PREShoot
            Time: PER (period), FREQ (frequency), RTIMe (rise), FTIMe (fall), PWIDth, NWIDth
            Delay: +WID (positive width), -WID (negative width), DUTYcycle, PDUTy (negative duty)
            Others: AREA, MAREa (area), PERiod
        """
        if source:
            old_source = self.measure_source
            self.measure_source = source
            try:
                result = self.ask(f":MEASure:ITEM? {item}")
                return float(result)
            finally:
                self.measure_source = old_source
        else:
            result = self.ask(f":MEASure:ITEM? {item}")
            return float(result)

    def measure_item_statistic(self, item, source=None):
        """Get statistics for a specific measurement item.

        Args:
            item: Measurement item name
            source: Optional source channel

        Returns:
            Dictionary with keys: current, average, min, max, deviation
        """
        old_source = None
        if source:
            old_source = self.measure_source
            self.measure_source = source

        try:
            current = self.ask(f":MEASure:ITEM? {item},CURR")
            average = self.ask(f":MEASure:ITEM? {item},AVER")
            minimum = self.ask(f":MEASure:ITEM? {item},MIN")
            maximum = self.ask(f":MEASure:ITEM? {item},MAX")
            deviation = self.ask(f":MEASure:ITEM? {item},DEV")

            return {
                "current": float(current),
                "average": float(average),
                "min": float(minimum),
                "max": float(maximum),
                "deviation": float(deviation),
            }
        finally:
            if old_source is not None:
                self.measure_source = old_source

    # ################
    # Cursor Subsystem
    # ################
    cursor_mode = Instrument.control(
        get_command=":CURSor:MODE?",
        set_command=":CURSor:MODE %s",
        docs="""Control the cursor measurement mode.

        Valid values are:
        - OFF: Cursors disabled
        - MAN: Manual cursor mode (user-positioned cursors)
        - TRAC: Track cursor mode (cursors follow waveform)
        - AUTO: Auto cursor mode (automatic measurements)
        - XY: XY cursor mode (for XY display)""",
        validator=strict_discrete_set,
        values=["OFF", "MAN", "TRAC", "AUTO", "XY"],
    )

    # Manual Cursor Mode
    cursor_manual_type = Instrument.control(
        get_command=":CURSor:MANual:TYPE?",
        set_command=":CURSor:MANual:TYPE %s",
        docs="""Control the manual cursor type.

        Valid values are:
        - X: Horizontal cursors (time measurements)
        - Y: Vertical cursors (voltage measurements)
        - XY: Both horizontal and vertical cursors""",
        validator=strict_discrete_set,
        values=["X", "Y", "XY"],
    )

    cursor_manual_source = Instrument.control(
        get_command=":CURSor:MANual:SOURce?",
        set_command=":CURSor:MANual:SOURce %s",
        docs="""Control the source for manual cursor measurements.

        Valid values are CHANnel1-4, MATH.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4", "MATH"],
    )

    cursor_manual_time_unit = Instrument.control(
        get_command=":CURSor:MANual:TUNit?",
        set_command=":CURSor:MANual:TUNit %s",
        docs="""Control the time unit for manual cursor X measurements.

        Valid values are:
        - S: Seconds
        - HZ: Hertz (frequency)
        - DEGR: Degrees (phase)
        - PERC: Percent (duty cycle)""",
        validator=strict_discrete_set,
        values=["S", "HZ", "DEGR", "PERC"],
    )

    cursor_manual_voltage_unit = Instrument.control(
        get_command=":CURSor:MANual:VUNit?",
        set_command=":CURSor:MANual:VUNit %s",
        docs="""Control the voltage unit for manual cursor Y measurements.

        Valid values depend on the channel units setting (VOLT, WATT, AMP, UNKN).""",
        validator=strict_discrete_set,
        values=["VOLT", "WATT", "AMP", "UNKN"],
    )

    cursor_manual_ax = Instrument.control(
        get_command=":CURSor:MANual:AX?",
        set_command=":CURSor:MANual:AX %f",
        docs="""Control the X position of cursor A in seconds (float).

        Valid range depends on the timebase settings.""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
    )

    cursor_manual_bx = Instrument.control(
        get_command=":CURSor:MANual:BX?",
        set_command=":CURSor:MANual:BX %f",
        docs="""Control the X position of cursor B in seconds (float).

        Valid range depends on the timebase settings.""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
    )

    cursor_manual_ay = Instrument.control(
        get_command=":CURSor:MANual:AY?",
        set_command=":CURSor:MANual:AY %f",
        docs="""Control the Y position of cursor A in volts (float).

        Valid range depends on the vertical scale and offset of the source.""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
    )

    cursor_manual_by = Instrument.control(
        get_command=":CURSor:MANual:BY?",
        set_command=":CURSor:MANual:BY %f",
        docs="""Control the Y position of cursor B in volts (float).

        Valid range depends on the vertical scale and offset of the source.""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
    )

    cursor_manual_axvalue = Instrument.measurement(
        get_command=":CURSor:MANual:AXV?",
        docs="""Get the X value at cursor A position in current time units (float).""",
    )

    cursor_manual_bxvalue = Instrument.measurement(
        get_command=":CURSor:MANual:BXV?",
        docs="""Get the X value at cursor B position in current time units (float).""",
    )

    cursor_manual_ayvalue = Instrument.measurement(
        get_command=":CURSor:MANual:AYV?",
        docs="""Get the Y value at cursor A position in current voltage units (float).""",
    )

    cursor_manual_byvalue = Instrument.measurement(
        get_command=":CURSor:MANual:BYV?",
        docs="""Get the Y value at cursor B position in current voltage units (float).""",
    )

    cursor_manual_xdelta = Instrument.measurement(
        get_command=":CURSor:MANual:XDE?",
        docs="""Get the difference between X-cursor A and B in current time units (float).""",
    )

    cursor_manual_inverse_xdelta = Instrument.measurement(
        get_command=":CURSor:MANual:IXD?",
        docs="""Get the reciprocal of X delta (1/delta) in current units (float).

        Useful for frequency measurements when cursors measure period.""",
    )

    cursor_manual_ydelta = Instrument.measurement(
        get_command=":CURSor:MANual:YDE?",
        docs="""Get the difference between Y-cursor A and B in current voltage units (float).""",
    )

    # Track Cursor Mode
    cursor_track_source_a = Instrument.control(
        get_command=":CURSor:TRACk:SOUA?",
        set_command=":CURSor:TRACk:SOUA %s",
        docs="""Control the source for track cursor A.

        Valid values are CHANnel1-4, MATH.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4", "MATH"],
    )

    cursor_track_source_b = Instrument.control(
        get_command=":CURSor:TRACk:SOUB?",
        set_command=":CURSor:TRACk:SOUB %s",
        docs="""Control the source for track cursor B.

        Valid values are CHANnel1-4, MATH.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4", "MATH"],
    )

    cursor_track_time_unit = Instrument.control(
        get_command=":CURSor:TRACk:TUNit?",
        set_command=":CURSor:TRACk:TUNit %s",
        docs="""Control the time unit for track cursor X measurements.

        Valid values are:
        - S: Seconds
        - HZ: Hertz (frequency)
        - DEGR: Degrees (phase)
        - PERC: Percent (duty cycle)""",
        validator=strict_discrete_set,
        values=["S", "HZ", "DEGR", "PERC"],
    )

    cursor_track_voltage_unit_a = Instrument.control(
        get_command=":CURSor:TRACk:VUNA?",
        set_command=":CURSor:TRACk:VUNA %s",
        docs="""Control the voltage unit for track cursor A Y measurements.

        Valid values depend on the source channel units setting.""",
        validator=strict_discrete_set,
        values=["VOLT", "WATT", "AMP", "UNKN"],
    )

    cursor_track_voltage_unit_b = Instrument.control(
        get_command=":CURSor:TRACk:VUNB?",
        set_command=":CURSor:TRACk:VUNB %s",
        docs="""Control the voltage unit for track cursor B Y measurements.

        Valid values depend on the source channel units setting.""",
        validator=strict_discrete_set,
        values=["VOLT", "WATT", "AMP", "UNKN"],
    )

    cursor_track_ax = Instrument.control(
        get_command=":CURSor:TRACk:AX?",
        set_command=":CURSor:TRACk:AX %f",
        docs="""Control the X position of track cursor A in seconds (float).

        The cursor tracks the waveform at this X position.""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
    )

    cursor_track_bx = Instrument.control(
        get_command=":CURSor:TRACk:BX?",
        set_command=":CURSor:TRACk:BX %f",
        docs="""Control the X position of track cursor B in seconds (float).

        The cursor tracks the waveform at this X position.""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
    )

    cursor_track_axvalue = Instrument.measurement(
        get_command=":CURSor:TRACk:AXV?",
        docs="""Get the X value at track cursor A in current time units (float).""",
    )

    cursor_track_bxvalue = Instrument.measurement(
        get_command=":CURSor:TRACk:BXV?",
        docs="""Get the X value at track cursor B in current time units (float).""",
    )

    cursor_track_ayvalue = Instrument.measurement(
        get_command=":CURSor:TRACk:AYV?",
        docs="""Get the Y value at track cursor A in current voltage units (float).""",
    )

    cursor_track_byvalue = Instrument.measurement(
        get_command=":CURSor:TRACk:BYV?",
        docs="""Get the Y value at track cursor B in current voltage units (float).""",
    )

    cursor_track_xdelta = Instrument.measurement(
        get_command=":CURSor:TRACk:XDE?",
        docs="""Get the difference between X-track A and B in current time units (float).""",
    )

    cursor_track_inverse_xdelta = Instrument.measurement(
        get_command=":CURSor:TRACk:IXD?",
        docs="""Get the reciprocal of track X delta (1/delta) in current units (float).""",
    )

    cursor_track_ydelta = Instrument.measurement(
        get_command=":CURSor:TRACk:YDE?",
        docs="""Get the difference between Y-track A and B in current voltage units (float).""",
    )

    # Auto Cursor Mode
    cursor_auto_item = Instrument.control(
        get_command=":CURSor:AUTO:ITEM?",
        set_command=":CURSor:AUTO:ITEM %s",
        docs="""Control which measurement item the auto cursor displays.

        Valid measurement items include: VMAX, VMIN, VPP, VTOP, VBASe, VAMP, VAVG, VRMS,
        OVERshoot, PREShoot, MARea, MPERiod, FREQ, RTIMe, FTIMe, PWIDth, NWIDth, PDUTy, NDUTy,
        TVMAX, TVMIN, PSLEWrate, NSLEWrate, VUPper, VMID, VLOWer, VARIance, PVRMS.""",
        validator=strict_discrete_set,
        values=[
            "VMAX",
            "VMIN",
            "VPP",
            "VTOP",
            "VBAS",
            "VAMP",
            "VAVG",
            "VRMS",
            "OVER",
            "PRES",
            "MAR",
            "MPER",
            "FREQ",
            "RTIM",
            "FTIM",
            "PWID",
            "NWID",
            "PDUT",
            "NDUT",
            "TVMA",
            "TVMI",
            "PSL",
            "NSL",
            "VUPP",
            "VMID",
            "VLOW",
            "VAR",
            "PVRM",
        ],
    )

    cursor_auto_source = Instrument.control(
        get_command=":CURSor:AUTO:SOUR?",
        set_command=":CURSor:AUTO:SOUR %s",
        docs="""Control the source for auto cursor measurements.

        Valid values are CHANnel1-4, MATH.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4", "MATH"],
    )

    cursor_auto_time_unit = Instrument.control(
        get_command=":CURSor:AUTO:TUN?",
        set_command=":CURSor:AUTO:TUN %s",
        docs="""Control the time unit for auto cursor X measurements.

        Valid values are:
        - S: Seconds
        - HZ: Hertz
        - DEGR: Degrees
        - PERC: Percent""",
        validator=strict_discrete_set,
        values=["S", "HZ", "DEGR", "PERC"],
    )

    cursor_auto_voltage_unit = Instrument.control(
        get_command=":CURSor:AUTO:VUN?",
        set_command=":CURSor:AUTO:VUN %s",
        docs="""Control the voltage unit for auto cursor Y measurements.

        Valid values depend on the source channel units setting.""",
        validator=strict_discrete_set,
        values=["VOLT", "WATT", "AMP", "UNKN"],
    )

    cursor_auto_axvalue = Instrument.measurement(
        get_command=":CURSor:AUTO:AXV?",
        docs="""Get the X value at auto cursor A in current time units (float).""",
    )

    cursor_auto_bxvalue = Instrument.measurement(
        get_command=":CURSor:AUTO:BXV?",
        docs="""Get the X value at auto cursor B in current time units (float).""",
    )

    cursor_auto_ayvalue = Instrument.measurement(
        get_command=":CURSor:AUTO:AYV?",
        docs="""Get the Y value at auto cursor A in current voltage units (float).""",
    )

    cursor_auto_byvalue = Instrument.measurement(
        get_command=":CURSor:AUTO:BYV?",
        docs="""Get the Y value at auto cursor B in current voltage units (float).""",
    )

    cursor_auto_xdelta = Instrument.measurement(
        get_command=":CURSor:AUTO:XDE?",
        docs="""Get the difference between auto cursor A and B X positions (float).""",
    )

    # XY Cursor Mode
    cursor_xy_ax = Instrument.control(
        get_command=":CURSor:XY:AX?",
        set_command=":CURSor:XY:AX %f",
        docs="""Control the X position of XY cursor A in volts (float).

        In XY mode, X represents the horizontal channel (typically channel 1).""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
    )

    cursor_xy_bx = Instrument.control(
        get_command=":CURSor:XY:BX?",
        set_command=":CURSor:XY:BX %f",
        docs="""Control the X position of XY cursor B in volts (float).

        In XY mode, X represents the horizontal channel (typically channel 1).""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
    )

    cursor_xy_ay = Instrument.control(
        get_command=":CURSor:XY:AY?",
        set_command=":CURSor:XY:AY %f",
        docs="""Control the Y position of XY cursor A in volts (float).

        In XY mode, Y represents the vertical channel (typically channel 2).""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
    )

    cursor_xy_by = Instrument.control(
        get_command=":CURSor:XY:BY?",
        set_command=":CURSor:XY:BY %f",
        docs="""Control the Y position of XY cursor B in volts (float).

        In XY mode, Y represents the vertical channel (typically channel 2).""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
    )

    cursor_xy_axvalue = Instrument.measurement(
        get_command=":CURSor:XY:AXV?",
        docs="""Get the X value at XY cursor A in volts (float).""",
    )

    cursor_xy_bxvalue = Instrument.measurement(
        get_command=":CURSor:XY:BXV?",
        docs="""Get the X value at XY cursor B in volts (float).""",
    )

    cursor_xy_ayvalue = Instrument.measurement(
        get_command=":CURSor:XY:AYV?",
        docs="""Get the Y value at XY cursor A in volts (float).""",
    )

    cursor_xy_byvalue = Instrument.measurement(
        get_command=":CURSor:XY:BYV?",
        docs="""Get the Y value at XY cursor B in volts (float).""",
    )

    # Math Subsystem - Basic Operations
    math_display = Instrument.control(
        get_command=":MATH:DISPlay?",
        set_command=":MATH:DISPlay %d",
        docs="""Control if the math waveform is displayed (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    math_operator = Instrument.control(
        get_command=":MATH:OPERator?",
        set_command=":MATH:OPERator %s",
        docs="""Control the math operation type.

        Valid values are:
        - ADD: Source1 + Source2
        - SUBTract: Source1 - Source2
        - MULT: Source1 * Source2
        - DIV: Source1 / Source2
        - AND: Source1 AND Source2 (logical)
        - OR: Source1 OR Source2 (logical)
        - XOR: Source1 XOR Source2 (logical)
        - NOT: NOT Source1 (logical)
        - FFT: FFT of Source1
        - INTG: Integration of Source1
        - DIFF: Differentiation of Source1
        - SQRT: Square root of Source1
        - LOG: Logarithm of Source1
        - LN: Natural logarithm of Source1
        - EXP: Exponential of Source1
        - ABS: Absolute value of Source1
        - FILTer: Filter operation
        - SMOothing: Smoothing operation""",
        validator=strict_discrete_set,
        values=[
            "ADD",
            "SUBT",
            "MULT",
            "DIV",
            "AND",
            "OR",
            "XOR",
            "NOT",
            "FFT",
            "INTG",
            "DIFF",
            "SQRT",
            "LOG",
            "LN",
            "EXP",
            "ABS",
            "FILT",
            "SMO",
        ],
    )

    math_source1 = Instrument.control(
        get_command=":MATH:SOURce1?",
        set_command=":MATH:SOURce1 %s",
        docs="""Control the first source for math operations.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    math_source2 = Instrument.control(
        get_command=":MATH:SOURce2?",
        set_command=":MATH:SOURce2 %s",
        docs="""Control the second source for math operations.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).
        Used for binary operations (ADD, SUBTRACT, MULT, DIV, AND, OR, XOR).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    math_logic_source1 = Instrument.control(
        get_command=":MATH:LSOUrce1?",
        set_command=":MATH:LSOUrce1 %s",
        docs="""Control the first source for logical math operations.

        Valid values are D0-D15 (digital channels on MSO models only).""",
        validator=strict_discrete_set,
        values=_DIGITAL_CHANNELS,
    )

    math_logic_source2 = Instrument.control(
        get_command=":MATH:LSOUrce2?",
        set_command=":MATH:LSOUrce2 %s",
        docs="""Control the second source for logical math operations.

        Valid values are D0-D15 (digital channels on MSO models only).""",
        validator=strict_discrete_set,
        values=_DIGITAL_CHANNELS,
    )

    math_scale = Instrument.control(
        get_command=":MATH:SCALe?",
        set_command=":MATH:SCALe %f",
        docs="""Control the vertical scale of the math waveform in units per division (float).

        Valid range depends on the math operation and source signals.""",
        validator=truncated_range,
        values=(1e-12, 1e12),
    )

    math_offset = Instrument.control(
        get_command=":MATH:OFFSet?",
        set_command=":MATH:OFFSet %f",
        docs="""Control the vertical offset of the math waveform (float).

        The offset is in the same units as the math result.""",
        validator=truncated_range,
        values=(-1e12, 1e12),
    )

    math_invert = Instrument.control(
        get_command=":MATH:INVert?",
        set_command=":MATH:INVert %d",
        docs="""Control if the math waveform is inverted (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    def math_reset(self):
        """Reset the math waveform to default settings."""
        self.write(":MATH:RESet")

    # Math Subsystem - FFT Settings
    math_fft_source = Instrument.control(
        get_command=":MATH:FFT:SOURce?",
        set_command=":MATH:FFT:SOURce %s",
        docs="""Control the source for FFT operations.

        Valid values are CHANnel1-4.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4"],
    )

    math_fft_window = Instrument.control(
        get_command=":MATH:FFT:WINDow?",
        set_command=":MATH:FFT:WINDow %s",
        docs="""Control the FFT window function.

        Valid values are:
        - RECT: Rectangular window (best frequency resolution)
        - BLACkman: Blackman window
        - HANNing: Hanning window (good all-purpose)
        - HAMMing: Hamming window
        - FLATtop: Flattop window (best amplitude accuracy)
        - TRIangle: Triangle window""",
        validator=strict_discrete_set,
        values=["RECT", "BLAC", "HANN", "HAMM", "FLAT", "TRI"],
    )

    math_fft_split = Instrument.control(
        get_command=":MATH:FFT:SPLit?",
        set_command=":MATH:FFT:SPLit %d",
        docs="""Control if FFT display is split screen (bool).

        When enabled, shows both time domain and frequency domain.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    math_fft_unit = Instrument.control(
        get_command=":MATH:FFT:UNIT?",
        set_command=":MATH:FFT:UNIT %s",
        docs="""Control the FFT vertical unit.

        Valid values are:
        - DB: Decibels (dB)
        - VRMS: Volts RMS""",
        validator=strict_discrete_set,
        values=["DB", "VRMS"],
    )

    math_fft_horizontal_scale = Instrument.control(
        get_command=":MATH:FFT:HSCale?",
        set_command=":MATH:FFT:HSCale %f",
        docs="""Control the FFT horizontal scale in Hz per division (float).

        Valid range depends on the sample rate and FFT settings.""",
        validator=truncated_range,
        values=(1.0, 1e9),
    )

    math_fft_horizontal_center = Instrument.control(
        get_command=":MATH:FFT:HCENter?",
        set_command=":MATH:FFT:HCENter %f",
        docs="""Control the FFT horizontal center frequency in Hz (float).

        Valid range is 0 to Nyquist frequency (sample_rate / 2).""",
        validator=truncated_range,
        values=(0.0, 1e9),
    )

    math_fft_mode = Instrument.control(
        get_command=":MATH:FFT:MODE?",
        set_command=":MATH:FFT:MODE %s",
        docs="""Control the FFT display mode.

        Valid values are:
        - AMPL: Amplitude spectrum
        - PSD: Power spectral density""",
        validator=strict_discrete_set,
        values=["AMPL", "PSD"],
    )

    # Math Subsystem - Filter Settings
    math_filter_type = Instrument.control(
        get_command=":MATH:FILTer:TYPE?",
        set_command=":MATH:FILTer:TYPE %s",
        docs="""Control the filter type.

        Valid values are:
        - LPASs: Low pass filter
        - HPASs: High pass filter
        - BPASs: Band pass filter
        - BSTop: Band stop filter""",
        validator=strict_discrete_set,
        values=["LPAS", "HPAS", "BPAS", "BST"],
    )

    math_filter_w1 = Instrument.control(
        get_command=":MATH:FILTer:W1?",
        set_command=":MATH:FILTer:W1 %f",
        docs="""Control the filter cutoff frequency 1 in Hz (float).

        For low/high pass: the cutoff frequency.
        For band pass/stop: the lower cutoff frequency.""",
        validator=truncated_range,
        values=(1.0, 1e9),
    )

    math_filter_w2 = Instrument.control(
        get_command=":MATH:FILTer:W2?",
        set_command=":MATH:FILTer:W2 %f",
        docs="""Control the filter cutoff frequency 2 in Hz (float).

        Only used for band pass and band stop filters (upper cutoff frequency).""",
        validator=truncated_range,
        values=(1.0, 1e9),
    )

    # Mask Testing Subsystem
    mask_enable = Instrument.control(
        get_command=":MASK:ENABle?",
        set_command=":MASK:ENABle %d",
        docs="""Control if pass/fail mask testing is enabled (bool).

        When enabled, the oscilloscope compares the waveform against a mask and reports
        pass/fail status.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    mask_source = Instrument.control(
        get_command=":MASK:SOURce?",
        set_command=":MASK:SOURce %s",
        docs="""Control the source for mask testing.

        Valid values are CHANnel1-4.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4"],
    )

    mask_operate = Instrument.control(
        get_command=":MASK:OPERate?",
        set_command=":MASK:OPERate %s",
        docs="""Control the mask test operation mode.

        Valid values are:
        - RUN: Start mask testing
        - STOP: Stop mask testing""",
        validator=strict_discrete_set,
        values=["RUN", "STOP"],
    )

    mask_message_display = Instrument.control(
        get_command=":MASK:MDISplay?",
        set_command=":MASK:MDISplay %d",
        docs="""Control if mask test results are displayed on screen (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    mask_stop_on_fail = Instrument.control(
        get_command=":MASK:SOOutput?",
        set_command=":MASK:SOOutput %d",
        docs="""Control if testing stops when mask test fails (bool).

        When enabled, the oscilloscope stops acquisition on the first mask failure.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    mask_sound_output = Instrument.control(
        get_command=":MASK:OUTPut?",
        set_command=":MASK:OUTPut %d",
        docs="""Control if a sound is played on mask test failure (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    mask_x = Instrument.control(
        get_command=":MASK:X?",
        set_command=":MASK:X %f",
        docs="""Control the horizontal (time) adjustment of the mask (float).

        Valid range is typically 0.02 to 1.00 divisions. Expands/contracts mask horizontally.""",
        validator=truncated_range,
        values=(0.02, 1.0),
    )

    mask_y = Instrument.control(
        get_command=":MASK:Y?",
        set_command=":MASK:Y %f",
        docs="""Control the vertical (voltage) adjustment of the mask (float).

        Valid range is typically 0.04 to 1.00 divisions. Expands/contracts mask vertically.""",
        validator=truncated_range,
        values=(0.04, 1.0),
    )

    def mask_create(self):
        """Create a mask from the current waveform.

        The mask is automatically generated based on the displayed waveform of the source channel,
        with margins defined by mask_x and mask_y settings."""
        self.write(":MASK:CREate")

    mask_passed = Instrument.measurement(
        get_command=":MASK:PASSed?",
        docs="""Get the number of passed mask tests (int).""",
    )

    mask_failed = Instrument.measurement(
        get_command=":MASK:FAILed?",
        docs="""Get the number of failed mask tests (int).""",
    )

    mask_total = Instrument.measurement(
        get_command=":MASK:TOTAL?",
        docs="""Get the total number of mask tests performed (int).""",
    )

    def mask_reset(self):
        """Reset mask test statistics (passed, failed, total counts)."""
        self.write(":MASK:RESet")

    # Trigger Subsystem - Pulse Trigger
    trigger_pulse_source = Instrument.control(
        get_command=":TRIGger:PULSe:SOURce?",
        set_command=":TRIGger:PULSe:SOURce %s",
        docs="""Control the pulse trigger source.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    trigger_pulse_when = Instrument.control(
        get_command=":TRIGger:PULSe:WHEN?",
        set_command=":TRIGger:PULSe:WHEN %s",
        docs="""Control the pulse width condition for triggering.

        Valid values are:
        - PGReater: Pulse width greater than specified
        - PLESs: Pulse width less than specified
        - PGLess: Pulse width between lower and upper limits""",
        validator=strict_discrete_set,
        values=["PGR", "PLES", "PGL"],
    )

    trigger_pulse_width = Instrument.control(
        get_command=":TRIGger:PULSe:WIDTh?",
        set_command=":TRIGger:PULSe:WIDTh %e",
        docs="""Control the pulse width for trigger in seconds (float).

        Used when trigger_pulse_when is PGReater or PLESs. Valid range is 8 ns to 10 s.""",
        validator=truncated_range,
        values=(8e-9, 10.0),
    )

    trigger_pulse_upper_width = Instrument.control(
        get_command=":TRIGger:PULSe:UWIDth?",
        set_command=":TRIGger:PULSe:UWIDth %e",
        docs="""Control the upper pulse width limit in seconds (float).

        Used when trigger_pulse_when is PGLess. Valid range is 16 ns to 10 s.""",
        validator=truncated_range,
        values=(16e-9, 10.0),
    )

    trigger_pulse_lower_width = Instrument.control(
        get_command=":TRIGger:PULSe:LWIDth?",
        set_command=":TRIGger:PULSe:LWIDth %e",
        docs="""Control the lower pulse width limit in seconds (float).

        Used when trigger_pulse_when is PGLess. Valid range is 8 ns to 10 s.""",
        validator=truncated_range,
        values=(8e-9, 10.0),
    )

    trigger_pulse_level = Instrument.control(
        get_command=":TRIGger:PULSe:LEVel?",
        set_command=":TRIGger:PULSe:LEVel %f",
        docs="""Control the pulse trigger threshold level in volts (float).

        Valid range depends on the vertical scale of the trigger source.""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    # Trigger Subsystem - Slope Trigger
    trigger_slope_source = Instrument.control(
        get_command=":TRIGger:SLOPe:SOURce?",
        set_command=":TRIGger:SLOPe:SOURce %s",
        docs="""Control the slope trigger source.

        Valid values are CHANnel1-4.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4"],
    )

    trigger_slope_when = Instrument.control(
        get_command=":TRIGger:SLOPe:WHEN?",
        set_command=":TRIGger:SLOPe:WHEN %s",
        docs="""Control the slope time condition for triggering.

        Valid values are:
        - PGReater: Positive slope time greater than specified
        - PLESs: Positive slope time less than specified
        - PGLess: Positive slope time between lower and upper limits
        - NGReater: Negative slope time greater than specified
        - NLESs: Negative slope time less than specified
        - NGLess: Negative slope time between lower and upper limits""",
        validator=strict_discrete_set,
        values=["PGR", "PLES", "PGL", "NGR", "NLES", "NGL"],
    )

    trigger_slope_time = Instrument.control(
        get_command=":TRIGger:SLOPe:TIME?",
        set_command=":TRIGger:SLOPe:TIME %e",
        docs="""Control the slope time for trigger in seconds (float).

        Used when trigger_slope_when is PGReater, PLESs, NGReater, or NLESs.
        Valid range is 8 ns to 10 s.""",
        validator=truncated_range,
        values=(8e-9, 10.0),
    )

    trigger_slope_time_upper = Instrument.control(
        get_command=":TRIGger:SLOPe:TUPPer?",
        set_command=":TRIGger:SLOPe:TUPPer %e",
        docs="""Control the upper slope time limit in seconds (float).

        Used when trigger_slope_when is PGLess or NGLess. Valid range is 16 ns to 10 s.""",
        validator=truncated_range,
        values=(16e-9, 10.0),
    )

    trigger_slope_time_lower = Instrument.control(
        get_command=":TRIGger:SLOPe:TLOWer?",
        set_command=":TRIGger:SLOPe:TLOWer %e",
        docs="""Control the lower slope time limit in seconds (float).

        Used when trigger_slope_when is PGLess or NGLess. Valid range is 8 ns to 10 s.""",
        validator=truncated_range,
        values=(8e-9, 10.0),
    )

    trigger_slope_window = Instrument.control(
        get_command=":TRIGger:SLOPe:WINDow?",
        set_command=":TRIGger:SLOPe:WINDow %s",
        docs="""Control the slope trigger window type.

        Valid values are:
        - TA: Trigger on slope between level A and B (rising)
        - TB: Trigger on slope between level B and A (falling)
        - TAB: Trigger on slope entering window (either direction)""",
        validator=strict_discrete_set,
        values=["TA", "TB", "TAB"],
    )

    trigger_slope_level_a = Instrument.control(
        get_command=":TRIGger:SLOPe:ALEVel?",
        set_command=":TRIGger:SLOPe:ALEVel %f",
        docs="""Control slope trigger level A in volts (float).

        Level A is typically the lower threshold for rising slope measurements.""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    trigger_slope_level_b = Instrument.control(
        get_command=":TRIGger:SLOPe:BLEVel?",
        set_command=":TRIGger:SLOPe:BLEVel %f",
        docs="""Control slope trigger level B in volts (float).

        Level B is typically the upper threshold for rising slope measurements.""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    # Trigger Subsystem - Video Trigger
    trigger_video_source = Instrument.control(
        get_command=":TRIGger:VIDeo:SOURce?",
        set_command=":TRIGger:VIDeo:SOURce %s",
        docs="""Control the video trigger source.

        Valid values are CHANnel1-4.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4"],
    )

    trigger_video_polarity = Instrument.control(
        get_command=":TRIGger:VIDeo:POLarity?",
        set_command=":TRIGger:VIDeo:POLarity %s",
        docs="""Control the video sync polarity.

        Valid values are:
        - POSitive: Positive sync (standard video)
        - NEGative: Negative sync (inverted video)""",
        validator=strict_discrete_set,
        values=["POS", "NEG"],
    )

    trigger_video_mode = Instrument.control(
        get_command=":TRIGger:VIDeo:MODE?",
        set_command=":TRIGger:VIDeo:MODE %s",
        docs="""Control the video trigger mode.

        Valid values are:
        - ODDfield: Trigger on odd field
        - EVENfield: Trigger on even field
        - LINE: Trigger on specified line number
        - ALINes: Trigger on all lines""",
        validator=strict_discrete_set,
        values=["ODDF", "EVEN", "LINE", "ALIN"],
    )

    trigger_video_line = Instrument.control(
        get_command=":TRIGger:VIDeo:LINE?",
        set_command=":TRIGger:VIDeo:LINE %d",
        docs="""Control the video line number for triggering (int).

        Used when trigger_video_mode is LINE. Valid range depends on video standard.""",
        validator=truncated_range,
        values=(1, 1200),
    )

    trigger_video_standard = Instrument.control(
        get_command=":TRIGger:VIDeo:STANdard?",
        set_command=":TRIGger:VIDeo:STANdard %s",
        docs="""Control the video standard.

        Valid values are:
        - PALSecam: PAL or SECAM (625 lines, 50 Hz)
        - NTSC: NTSC (525 lines, 60 Hz)
        - 480P: 480p progressive scan
        - 576P: 576p progressive scan""",
        validator=strict_discrete_set,
        values=["PALS", "NTSC", "480P", "576P"],
    )

    trigger_video_level = Instrument.control(
        get_command=":TRIGger:VIDeo:LEVel?",
        set_command=":TRIGger:VIDeo:LEVel %f",
        docs="""Control the video trigger level in volts (float).

        Valid range depends on the vertical scale of the trigger source.""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    # Trigger Subsystem - Pattern Trigger
    trigger_pattern_pattern = Instrument.control(
        get_command=":TRIGger:PATTern:PATTern?",
        set_command=":TRIGger:PATTern:PATTern %s",
        docs="""Control the pattern for pattern triggering.

        The pattern is a string representing the logic levels for up to 20 channels
        (4 analog + 16 digital). Each character can be:
        - H: High level
        - L: Low level
        - X: Don't care
        - R: Rising edge
        - F: Falling edge
        Example: \"HLXXRFXX\" for 8 channels.""",
        validator=strict_discrete_set,
        values=[
            "H",
            "L",
            "X",
            "R",
            "F",
        ],  # This is simplified; actual implementation more complex
    )

    trigger_pattern_level = Instrument.control(
        get_command=":TRIGger:PATTern:LEVel?",
        set_command=":TRIGger:PATTern:LEVel %s,%f",
        docs="""Control the threshold level for a specific channel in pattern trigger.

        Command format requires channel and level: e.g., "CHAN1,1.5" """,
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    # Trigger Subsystem - Duration Trigger
    trigger_duration_source = Instrument.control(
        get_command=":TRIGger:DURATion:SOURce?",
        set_command=":TRIGger:DURATion:SOURce %s",
        docs="""Control the duration trigger source.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    trigger_duration_type = Instrument.control(
        get_command=":TRIGger:DURATion:TYPe?",
        set_command=":TRIGger:DURATion:TYPe %s",
        docs="""Control the duration trigger polarity type.

        Valid values are:
        - PGReater: Positive pulse duration greater than time
        - PLESs: Positive pulse duration less than time
        - PGLess: Positive pulse duration between lower and upper
        - NGReater: Negative pulse duration greater than time
        - NLESs: Negative pulse duration less than time
        - NGLess: Negative pulse duration between lower and upper""",
        validator=strict_discrete_set,
        values=["PGR", "PLES", "PGL", "NGR", "NLES", "NGL"],
    )

    trigger_duration_when = Instrument.control(
        get_command=":TRIGger:DURATion:WHEN?",
        set_command=":TRIGger:DURATion:WHEN %s",
        docs="""Control when to trigger on duration.

        Valid values are:
        - TIME: Trigger when time condition is met
        - TIMeout: Trigger on timeout""",
        validator=strict_discrete_set,
        values=["TIME", "TIM"],
    )

    trigger_duration_time_upper = Instrument.control(
        get_command=":TRIGger:DURATion:TUPPer?",
        set_command=":TRIGger:DURATion:TUPPer %e",
        docs="""Control the upper duration time limit in seconds (float).

        Used when trigger_duration_type includes 'GLess'. Valid range is 16 ns to 10 s.""",
        validator=truncated_range,
        values=(16e-9, 10.0),
    )

    trigger_duration_time_lower = Instrument.control(
        get_command=":TRIGger:DURATion:TLOWer?",
        set_command=":TRIGger:DURATion:TLOWer %e",
        docs="""Control the lower duration time limit in seconds (float).

        Used when trigger_duration_type includes 'GLess'. Valid range is 8 ns to 10 s.""",
        validator=truncated_range,
        values=(8e-9, 10.0),
    )

    # Trigger Subsystem - Timeout Trigger (Option)
    trigger_timeout_source = Instrument.control(
        get_command=":TRIGger:TIMeout:SOURce?",
        set_command=":TRIGger:TIMeout:SOURce %s",
        docs="""Control the timeout trigger source.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    trigger_timeout_slope = Instrument.control(
        get_command=":TRIGger:TIMeout:SLOPe?",
        set_command=":TRIGger:TIMeout:SLOPe %s",
        docs="""Control the edge slope for timeout trigger.

        Valid values are:
        - POSitive: Start timeout on rising edge
        - NEGative: Start timeout on falling edge
        - RFAL: Start timeout on either edge""",
        validator=strict_discrete_set,
        values=["POS", "NEG", "RFAL"],
    )

    trigger_timeout_time = Instrument.control(
        get_command=":TRIGger:TIMeout:TIMe?",
        set_command=":TRIGger:TIMeout:TIMe %e",
        docs="""Control the timeout time in seconds (float).

        Triggers when the signal stays idle (no edge) for longer than this time.
        Valid range is 16 ns to 10 s.""",
        validator=truncated_range,
        values=(16e-9, 10.0),
    )

    # Trigger Subsystem - Runt Trigger (Option)
    trigger_runt_source = Instrument.control(
        get_command=":TRIGger:RUNT:SOURce?",
        set_command=":TRIGger:RUNT:SOURce %s",
        docs="""Control the runt trigger source.

        Valid values are CHANnel1-4.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4"],
    )

    trigger_runt_polarity = Instrument.control(
        get_command=":TRIGger:RUNT:POLarity?",
        set_command=":TRIGger:RUNT:POLarity %s",
        docs="""Control the runt pulse polarity.

        Valid values are:
        - POSitive: Positive runt pulse (starts rising but doesn't reach upper threshold)
        - NEGative: Negative runt pulse (starts falling but doesn't reach lower threshold)""",
        validator=strict_discrete_set,
        values=["POS", "NEG"],
    )

    trigger_runt_when = Instrument.control(
        get_command=":TRIGger:RUNT:WHEN?",
        set_command=":TRIGger:RUNT:WHEN %s",
        docs="""Control the runt time qualifying condition.

        Valid values are:
        - NONE: No time qualification
        - PGReater: Runt width greater than specified
        - PLESs: Runt width less than specified
        - PGLess: Runt width between lower and upper limits""",
        validator=strict_discrete_set,
        values=["NONE", "PGR", "PLES", "PGL"],
    )

    trigger_runt_width = Instrument.control(
        get_command=":TRIGger:RUNT:WIDTh?",
        set_command=":TRIGger:RUNT:WIDTh %e",
        docs="""Control the runt pulse width for time qualification in seconds (float).

        Used when trigger_runt_when is PGReater or PLESs. Valid range is 8 ns to 10 s.""",
        validator=truncated_range,
        values=(8e-9, 10.0),
    )

    trigger_runt_upper_width = Instrument.control(
        get_command=":TRIGger:RUNT:WUPPer?",
        set_command=":TRIGger:RUNT:WUPPer %e",
        docs="""Control the upper runt width limit in seconds (float).

        Used when trigger_runt_when is PGLess. Valid range is 16 ns to 10 s.""",
        validator=truncated_range,
        values=(16e-9, 10.0),
    )

    trigger_runt_lower_width = Instrument.control(
        get_command=":TRIGger:RUNT:WLOWer?",
        set_command=":TRIGger:RUNT:WLOWer %e",
        docs="""Control the lower runt width limit in seconds (float).

        Used when trigger_runt_when is PGLess. Valid range is 8 ns to 10 s.""",
        validator=truncated_range,
        values=(8e-9, 10.0),
    )

    trigger_runt_level_upper = Instrument.control(
        get_command=":TRIGger:RUNT:ALEVel?",
        set_command=":TRIGger:RUNT:ALEVel %f",
        docs="""Control the upper threshold level for runt trigger in volts (float).

        The runt pulse must cross the lower but not reach this upper level.""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    trigger_runt_level_lower = Instrument.control(
        get_command=":TRIGger:RUNT:BLEVel?",
        set_command=":TRIGger:RUNT:BLEVel %f",
        docs="""Control the lower threshold level for runt trigger in volts (float).""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    # Trigger Subsystem - Windows Trigger (Option)
    trigger_windows_source = Instrument.control(
        get_command=":TRIGger:WINDows:SOURce?",
        set_command=":TRIGger:WINDows:SOURce %s",
        docs="""Control the windows trigger source.

        Valid values are CHANnel1-4.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4"],
    )

    trigger_windows_slope = Instrument.control(
        get_command=":TRIGger:WINDows:SLOPe?",
        set_command=":TRIGger:WINDows:SLOPe %s",
        docs="""Control the windows trigger slope condition.

        Valid values are:
        - POSitive: Trigger when signal enters window with positive slope
        - NEGative: Trigger when signal enters window with negative slope
        - RFAL: Trigger when signal enters window with either slope""",
        validator=strict_discrete_set,
        values=["POS", "NEG", "RFAL"],
    )

    trigger_windows_position = Instrument.control(
        get_command=":TRIGger:WINDows:POSition?",
        set_command=":TRIGger:WINDows:POSition %s",
        docs="""Control the windows position condition.

        Valid values are:
        - EXIT: Trigger when signal exits the window
        - ENTER: Trigger when signal enters the window
        - TIMe: Trigger when signal stays in window for specified time""",
        validator=strict_discrete_set,
        values=["EXIT", "ENTER", "TIM"],
    )

    trigger_windows_time = Instrument.control(
        get_command=":TRIGger:WINDows:TIMe?",
        set_command=":TRIGger:WINDows:TIMe %e",
        docs="""Control the time qualification for windows trigger in seconds (float).

        Used when trigger_windows_position is TIMe. Valid range is 8 ns to 10 s.""",
        validator=truncated_range,
        values=(8e-9, 10.0),
    )

    trigger_windows_level_upper = Instrument.control(
        get_command=":TRIGger:WINDows:ALEVel?",
        set_command=":TRIGger:WINDows:ALEVel %f",
        docs="""Control the upper window threshold level in volts (float).""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    trigger_windows_level_lower = Instrument.control(
        get_command=":TRIGger:WINDows:BLEVel?",
        set_command=":TRIGger:WINDows:BLEVel %f",
        docs="""Control the lower window threshold level in volts (float).""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    # Trigger Subsystem - Delay Trigger (Option)
    trigger_delay_source_a = Instrument.control(
        get_command=":TRIGger:DELay:SA?",
        set_command=":TRIGger:DELay:SA %s",
        docs="""Control source A for delay trigger.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    trigger_delay_source_b = Instrument.control(
        get_command=":TRIGger:DELay:SB?",
        set_command=":TRIGger:DELay:SB %s",
        docs="""Control source B for delay trigger.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    trigger_delay_slope_a = Instrument.control(
        get_command=":TRIGger:DELay:SLOPA?",
        set_command=":TRIGger:DELay:SLOPA %s",
        docs="""Control the edge slope for source A in delay trigger.

        Valid values are:
        - POSitive: Rising edge
        - NEGative: Falling edge""",
        validator=strict_discrete_set,
        values=["POS", "NEG"],
    )

    trigger_delay_slope_b = Instrument.control(
        get_command=":TRIGger:DELay:SLOPB?",
        set_command=":TRIGger:DELay:SLOPB %s",
        docs="""Control the edge slope for source B in delay trigger.

        Valid values are:
        - POSitive: Rising edge
        - NEGative: Falling edge""",
        validator=strict_discrete_set,
        values=["POS", "NEG"],
    )

    trigger_delay_type = Instrument.control(
        get_command=":TRIGger:DELay:TYPe?",
        set_command=":TRIGger:DELay:TYPe %s",
        docs="""Control the delay type condition.

        Valid values are:
        - GREater: Delay greater than specified time
        - LESS: Delay less than specified time
        - GLESs: Delay between lower and upper time limits
        - GOUT: Delay outside lower and upper time limits""",
        validator=strict_discrete_set,
        values=["GRE", "LESS", "GLES", "GOUT"],
    )

    trigger_delay_time_upper = Instrument.control(
        get_command=":TRIGger:DELay:TUPPer?",
        set_command=":TRIGger:DELay:TUPPer %e",
        docs="""Control the upper delay time limit in seconds (float).

        Used when trigger_delay_type is GLESs or GOUT. Valid range is 16 ns to 10 s.""",
        validator=truncated_range,
        values=(16e-9, 10.0),
    )

    trigger_delay_time_lower = Instrument.control(
        get_command=":TRIGger:DELay:TLOWer?",
        set_command=":TRIGger:DELay:TLOWer %e",
        docs="""Control the lower delay time limit in seconds (float).

        Used when trigger_delay_type is GLESs or GOUT. Valid range is 8 ns to 10 s.""",
        validator=truncated_range,
        values=(8e-9, 10.0),
    )

    # Trigger Subsystem - Setup/Hold Trigger (Option)
    trigger_shol_data_source = Instrument.control(
        get_command=":TRIGger:SHOLd:DS?",
        set_command=":TRIGger:SHOLd:DS %s",
        docs="""Control the data source for setup/hold trigger.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    trigger_shol_clock_source = Instrument.control(
        get_command=":TRIGger:SHOLd:CS?",
        set_command=":TRIGger:SHOLd:CS %s",
        docs="""Control the clock source for setup/hold trigger.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    trigger_shol_slope = Instrument.control(
        get_command=":TRIGger:SHOLd:SLOPe?",
        set_command=":TRIGger:SHOLd:SLOPe %s",
        docs="""Control the clock edge slope for setup/hold trigger.

        Valid values are:
        - POSitive: Rising edge
        - NEGative: Falling edge""",
        validator=strict_discrete_set,
        values=["POS", "NEG"],
    )

    trigger_shol_pattern = Instrument.control(
        get_command=":TRIGger:SHOLd:PATTern?",
        set_command=":TRIGger:SHOLd:PATTern %s",
        docs="""Control the data pattern for setup/hold trigger.

        Valid values are:
        - H: High level
        - L: Low level""",
        validator=strict_discrete_set,
        values=["H", "L"],
    )

    trigger_shol_type = Instrument.control(
        get_command=":TRIGger:SHOLd:TYPe?",
        set_command=":TRIGger:SHOLd:TYPe %s",
        docs="""Control the setup/hold type.

        Valid values are:
        - SETup: Setup time violation
        - HOLd: Hold time violation
        - SETHOLd: Setup or hold time violation""",
        validator=strict_discrete_set,
        values=["SET", "HOL", "SETHOL"],
    )

    trigger_shol_setup_time = Instrument.control(
        get_command=":TRIGger:SHOLd:STIMe?",
        set_command=":TRIGger:SHOLd:STIMe %e",
        docs="""Control the setup time in seconds (float).

        The minimum time data must be stable before the clock edge. Valid range is 8 ns to 1 s.""",
        validator=truncated_range,
        values=(8e-9, 1.0),
    )

    trigger_shol_hold_time = Instrument.control(
        get_command=":TRIGger:SHOLd:HTIMe?",
        set_command=":TRIGger:SHOLd:HTIMe %e",
        docs="""Control the hold time in seconds (float).

        The minimum time data must be stable after the clock edge. Valid range is 8 ns to 1 s.""",
        validator=truncated_range,
        values=(8e-9, 1.0),
    )

    # Trigger Subsystem - Nth Edge Trigger (Option)
    trigger_nedge_source = Instrument.control(
        get_command=":TRIGger:NEDGe:SOURce?",
        set_command=":TRIGger:NEDGe:SOURce %s",
        docs="""Control the Nth edge trigger source.

        Valid values are CHANnel1-4.""",
        validator=strict_discrete_set,
        values=["CHAN1", "CHAN2", "CHAN3", "CHAN4"],
    )

    trigger_nedge_slope = Instrument.control(
        get_command=":TRIGger:NEDGe:SLOPe?",
        set_command=":TRIGger:NEDGe:SLOPe %s",
        docs="""Control the edge slope for Nth edge trigger.

        Valid values are:
        - POSitive: Trigger on Nth rising edge
        - NEGative: Trigger on Nth falling edge""",
        validator=strict_discrete_set,
        values=["POS", "NEG"],
    )

    trigger_nedge_idle = Instrument.control(
        get_command=":TRIGger:NEDGe:IDLE?",
        set_command=":TRIGger:NEDGe:IDLE %e",
        docs="""Control the idle time before edge counting starts in seconds (float).

        Valid range is 16 ns to 10 s.""",
        validator=truncated_range,
        values=(16e-9, 10.0),
    )

    trigger_nedge_edge = Instrument.control(
        get_command=":TRIGger:NEDGe:EDGE?",
        set_command=":TRIGger:NEDGe:EDGE %d",
        docs="""Control which edge number to trigger on (int).

        Valid range is 1 to 65535.""",
        validator=truncated_range,
        values=(1, 65535),
    )

    trigger_nedge_level = Instrument.control(
        get_command=":TRIGger:NEDGe:LEVel?",
        set_command=":TRIGger:NEDGe:LEVel %f",
        docs="""Control the threshold level for Nth edge trigger in volts (float).

        Valid range depends on the vertical scale of the trigger source.""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    # Trigger Subsystem - RS232/UART Trigger (Option)
    trigger_rs232_source = Instrument.control(
        get_command=":TRIGger:RS232:SOURce?",
        set_command=":TRIGger:RS232:SOURce %s",
        docs="""Control the RS232 trigger data source.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    trigger_rs232_when = Instrument.control(
        get_command=":TRIGger:RS232:WHEN?",
        set_command=":TRIGger:RS232:WHEN %s",
        docs="""Control when to trigger on RS232 data.

        Valid values are:
        - STARt: Trigger on start bit
        - ERRor: Trigger on frame error
        - PARity: Trigger on parity error
        - DATA: Trigger on specific data value""",
        validator=strict_discrete_set,
        values=["STAR", "ERR", "PAR", "DATA"],
    )

    trigger_rs232_parity = Instrument.control(
        get_command=":TRIGger:RS232:PARity?",
        set_command=":TRIGger:RS232:PARity %s",
        docs="""Control the RS232 parity mode.

        Valid values are:
        - NONE: No parity
        - EVEN: Even parity
        - ODD: Odd parity""",
        validator=strict_discrete_set,
        values=["NONE", "EVEN", "ODD"],
    )

    trigger_rs232_stop_bits = Instrument.control(
        get_command=":TRIGger:RS232:STOP?",
        set_command=":TRIGger:RS232:STOP %s",
        docs="""Control the number of stop bits in RS232 frame.

        Valid values are 1, 2 stop bits.""",
        validator=strict_discrete_set,
        values=[1, 2],
    )

    trigger_rs232_data_width = Instrument.control(
        get_command=":TRIGger:RS232:DATA?",
        set_command=":TRIGger:RS232:DATA %d",
        docs="""Control the length of data in the RS232 trigger frame (int).

        Valid values are 0 to 2^n - 1, where n is the current number of data bits (5, 6, 7, 8). 
        Default is 90.""",
        validator=truncated_range,
        values=(0, 255),
    )

    trigger_rs232_data_bits = Instrument.control(
        get_command=":TRIGger:RS232:WIDTh?",
        set_command=":TRIGger:RS232:WIDTh %d",
        docs="""Control the number of data bits in the RS232 trigger frame (int).

        Defines how many bits are in the data portion of the RS232 frame. 
        This affects the valid range for trigger_rs232_data_width.
        Valid values are 5, 6, 7, 8 bits.""",
        validator=strict_discrete_set,
        values=[5, 6, 7, 8],
    )

    trigger_rs232_baud = Instrument.control(
        get_command=":TRIGger:RS232:BAUD?",
        set_command=":TRIGger:RS232:BAUD %s",
        docs="""Control the RS232 baud rate in bits per second (int).

        Common values are 2400, 4800, 9600, 19200, 38400, 57600, 115200, etc.
        Can also be set to USER for custom baud rate, controlled via trigger_rs232_user_baud.""",
        validator=strict_discrete_set,
        values=[
            2400,
            4800,
            9600,
            19200,
            38400,
            57600,
            115200,
            230400,
            460800,
            921600,
            1000000,
            "USER",
        ],
    )

    trigger_rs232_user_baud = Instrument.control(
        get_command=":TRIGger:RS232:BUSer?",
        set_command=":TRIGger:RS232:BUSer %s",
        docs="""Control the user-defined RS232 baud rate in bits per second (int).

        Used when trigger_rs232_baud is set to USER. Valid range is 110 to 1 000 000 bps.""",
        validator=truncated_range,
        values=(110, 1_000_000),
    )

    trigger_rs232_level = Instrument.control(
        get_command=":TRIGger:RS232:LEVel?",
        set_command=":TRIGger:RS232:LEVel %f",
        docs="""Control the RS232 trigger threshold level in volts (float).

        Valid range depends on the vertical scale of the trigger source.""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    # Trigger Subsystem - I2C Trigger (Option)
    trigger_i2c_clock_source = Instrument.control(
        get_command=":TRIGger:IIC:SCL?",
        set_command=":TRIGger:IIC:SCL %s",
        docs="""Control the I2C clock (SCL) source.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    trigger_i2c_data_source = Instrument.control(
        get_command=":TRIGger:IIC:SDA?",
        set_command=":TRIGger:IIC:SDA %s",
        docs="""Control the I2C data (SDA) source.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    trigger_i2c_when = Instrument.control(
        get_command=":TRIGger:IIC:WHEN?",
        set_command=":TRIGger:IIC:WHEN %s",
        docs="""Control when to trigger on I2C bus.

        Valid values are:
        - STARt: Trigger on start condition
        - RESTart: Trigger on repeated start condition
        - STOP: Trigger on stop condition
        - NACKnowledge: Trigger on missing acknowledge
        - ADDRess: Trigger on address match
        - DATA: Trigger on data match
        - ADATa: Trigger on address and data match""",
        validator=strict_discrete_set,
        values=["STAR", "REST", "STOP", "NACK", "ADDR", "DATA", "ADAT"],
    )

    trigger_i2c_awidth = Instrument.control(
        get_command=":TRIGger:IIC:AWIDth?",
        set_command=":TRIGger:IIC:AWIDth %d",
        docs="""Control the I2C address width in bits (int).

        Valid values are 7, 8 or 10 bits. Used when trigger_i2c_when is ADDRess or ADATa.""",
        validator=strict_discrete_set,
        values=[7, 8, 10],
    )

    trigger_i2c_address = Instrument.control(
        get_command=":TRIGger:IIC:ADDRess?",
        set_command=":TRIGger:IIC:ADDRess %d",
        docs="""Control the I2C address to trigger on (int).

        Valid range depends on the address width (0 to 2^n - 1 with n address width):
        7-bit: 0-127, 8-bit: 0-255, 10-bit: 0-1023.
        Used when trigger_i2c_when is ADDRess or ADATa.""",
        validator=truncated_range,
        values=(0, 1023),
    )

    trigger_i2c_direction = Instrument.control(
        get_command=":TRIGger:IIC:DIRection?",
        set_command=":TRIGger:IIC:DIRection %s",
        docs="""Control the I2C transfer direction for triggering.

        Valid values are:
        - READ: Trigger on read transfers (R/W bit = 1)
        - WRITe: Trigger on write transfers (R/W bit = 0)
        - RWRite: Trigger on either direction""",
        validator=strict_discrete_set,
        values=["READ", "WRIT", "RWR"],
    )

    trigger_i2c_data = Instrument.control(
        get_command=":TRIGger:IIC:DATA?",
        set_command=":TRIGger:IIC:DATA %e",
        docs="""Control the I2C data value to trigger on (int).

        Valid range is 0 to 5 bytes (40 bits) of data: 0 to 2^40 - 1 (1099511627775).
        Used when trigger_i2c_when is DATA or ADATa.""",
        validator=truncated_range,
        values=(0, 2**40 - 1),
    )

    trigger_i2c_clock_level = Instrument.control(
        get_command=":TRIGger:IIC:SCLKL?",
        set_command=":TRIGger:IIC:SCLKL %f",
        docs="""Control the I2C clock (SCL) threshold level in volts (float).

        Valid range depends on the vertical scale of the clock source.""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    trigger_i2c_data_level = Instrument.control(
        get_command=":TRIGger:IIC:SDAL?",
        set_command=":TRIGger:IIC:SDAL %f",
        docs="""Control the I2C data (SDA) threshold level in volts (float).

        Valid range depends on the vertical scale of the data source.""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    # Trigger Subsystem - SPI Trigger (Option)
    trigger_spi_clock_source = Instrument.control(
        get_command=":TRIGger:SPI:SCL?",
        set_command=":TRIGger:SPI:SCL %s",
        docs="""Control the SPI clock (SCL/SCK) source.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    trigger_spi_data_source = Instrument.control(
        get_command=":TRIGger:SPI:DATA?",
        set_command=":TRIGger:SPI:DATA %s",
        docs="""Control the SPI data (MOSI/MISO) source.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    trigger_spi_timeout = Instrument.control(
        get_command=":TRIGger:SPI:TIMeout?",
        set_command=":TRIGger:SPI:TIMeout %d",
        docs="""Control if SPI timeout detection is enabled (bool).

        When enabled, treats CS inactive period as frame boundary.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    trigger_spi_when = Instrument.control(
        get_command=":TRIGger:SPI:WHEN?",
        set_command=":TRIGger:SPI:WHEN %s",
        docs="""Control when to trigger on SPI bus.

        Valid values are:
        - CS: Trigger on chip select edge
        - TIMeout: Trigger when timeout occurs
        - DATA: Trigger on specific data value""",
        validator=strict_discrete_set,
        values=["CS", "TIM", "DATA"],
    )

    trigger_spi_width = Instrument.control(
        get_command=":TRIGger:SPI:WIDTh?",
        set_command=":TRIGger:SPI:WIDTh %d",
        docs="""Control the SPI data width in bits (int).

        Valid values are 4 to 32 bits.""",
        validator=truncated_range,
        values=(4, 32),
    )

    trigger_spi_data_value = Instrument.control(
        get_command=":TRIGger:SPI:DVAL?",
        set_command=":TRIGger:SPI:DVAL %s",
        docs="""Control the SPI data value to trigger on (hex string).

        Format: hex value matching the configured width. Used when trigger_spi_when is DATA.""",
        validator=strict_discrete_set,
        values=["00"],  # Placeholder - accepts any hex string
    )

    trigger_spi_clock_slope = Instrument.control(
        get_command=":TRIGger:SPI:SLOPe?",
        set_command=":TRIGger:SPI:SLOPe %s",
        docs="""Control the SPI clock edge for data sampling.

        Valid values are:
        - POSitive: Sample data on rising edge
        - NEGative: Sample data on falling edge""",
        validator=strict_discrete_set,
        values=["POS", "NEG"],
    )

    trigger_spi_cs_source = Instrument.control(
        get_command=":TRIGger:SPI:CS?",
        set_command=":TRIGger:SPI:CS %s",
        docs="""Control the SPI chip select (CS) source.

        Valid values are CHANnel1-4, D0-D15 (digital channels on MSO models).""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    trigger_spi_cs_polarity = Instrument.control(
        get_command=":TRIGger:SPI:CSP?",
        set_command=":TRIGger:SPI:CSP %s",
        docs="""Control the SPI chip select polarity.

        Valid values are:
        - POSitive: CS active high
        - NEGative: CS active low""",
        validator=strict_discrete_set,
        values=["POS", "NEG"],
    )

    trigger_spi_clock_level = Instrument.control(
        get_command=":TRIGger:SPI:SCLL?",
        set_command=":TRIGger:SPI:SCLL %f",
        docs="""Control the SPI clock threshold level in volts (float).

        Valid range depends on the vertical scale of the clock source.""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    trigger_spi_data_level = Instrument.control(
        get_command=":TRIGger:SPI:DATAL?",
        set_command=":TRIGger:SPI:DATAL %f",
        docs="""Control the SPI data threshold level in volts (float).

        Valid range depends on the vertical scale of the data source.""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    trigger_spi_cs_level = Instrument.control(
        get_command=":TRIGger:SPI:CSL?",
        set_command=":TRIGger:SPI:CSL %f",
        docs="""Control the SPI chip select threshold level in volts (float).

        Valid range depends on the vertical scale of the CS source.""",
        validator=truncated_range,
        values=(-100.0, 100.0),
    )

    # ########################################################################
    # Math Options Subsystem
    # ########################################################################

    math_option_start = Instrument.control(
        get_command=":MATH:OPTion:STARt?",
        set_command=":MATH:OPTion:STARt %d",
        docs="""Control the start point for math operations (int).

        Valid range is 0 to (end point - 1).""",
        validator=truncated_range,
        values=(0, 1198),
    )

    math_option_end = Instrument.control(
        get_command=":MATH:OPTion:END?",
        set_command=":MATH:OPTion:END %d",
        docs="""Control the end point for math operations (int).

        Valid range is (start point + 1) to 1199.""",
        validator=truncated_range,
        values=(1, 1199),
    )

    math_option_invert = Instrument.control(
        get_command=":MATH:OPTion:INVert?",
        set_command=":MATH:OPTion:INVert %d",
        docs="""Control if math option inversion is enabled (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    math_option_sensitivity = Instrument.control(
        get_command=":MATH:OPTion:SENSitivity?",
        set_command=":MATH:OPTion:SENSitivity %f",
        docs="""Control the sensitivity for math differentiation (float).

        Valid range is 0 to 0.96, in steps of 0.08.""",
        validator=truncated_range,
        values=(0.0, 0.96),
    )

    math_option_distance = Instrument.control(
        get_command=":MATH:OPTion:DIStance?",
        set_command=":MATH:OPTion:DIStance %d",
        docs="""Control the smoothing window width for math operations (int).

        Valid range is 3 to 201.""",
        validator=truncated_range,
        values=(3, 201),
    )

    math_option_auto_scale = Instrument.control(
        get_command=":MATH:OPTion:ASCale?",
        set_command=":MATH:OPTion:ASCale %d",
        docs="""Control if auto scale is enabled for math operations (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    math_option_threshold1 = Instrument.control(
        get_command=":MATH:OPTion:THReshold1?",
        set_command=":MATH:OPTion:THReshold1 %f",
        docs="""Control the threshold 1 for logic math operations in volts (float).

        The valid range depends on the vertical scale and offset of the source channel.""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
    )

    math_option_threshold2 = Instrument.control(
        get_command=":MATH:OPTion:THReshold2?",
        set_command=":MATH:OPTion:THReshold2 %f",
        docs="""Control the threshold 2 for logic math operations in volts (float).

        The valid range depends on the vertical scale and offset of the source channel.""",
        validator=truncated_range,
        values=(-1000.0, 1000.0),
    )

    math_option_fx_source1 = Instrument.control(
        get_command=":MATH:OPTion:FX:SOURce1?",
        set_command=":MATH:OPTion:FX:SOURce1 %s",
        docs="""Control the source 1 for f(x) math operations.

        Valid values are CHANnel1-4.""",
        validator=strict_discrete_set,
        values=_ANALOG_CHANNELS,
    )

    math_option_fx_source2 = Instrument.control(
        get_command=":MATH:OPTion:FX:SOURce2?",
        set_command=":MATH:OPTion:FX:SOURce2 %s",
        docs="""Control the source 2 for f(x) math operations.

        Valid values are CHANnel1-4.""",
        validator=strict_discrete_set,
        values=_ANALOG_CHANNELS,
    )

    math_option_fx_operator = Instrument.control(
        get_command=":MATH:OPTion:FX:OPERator?",
        set_command=":MATH:OPTion:FX:OPERator %s",
        docs="""Control the operator for f(x) math operations.

        Valid values are:
        - ADD: Addition
        - SUBT: Subtraction (SUBTract)
        - MULT: Multiplication (MULTiply)
        - DIV: Division (DIVision)""",
        validator=strict_discrete_set,
        values=["ADD", "SUBT", "MULT", "DIV"],
    )

    # ########################################################################
    # Storage Subsystem
    # ########################################################################

    storage_image_type = Instrument.control(
        get_command=":STORage:IMAGe:TYPE?",
        set_command=":STORage:IMAGe:TYPE %s",
        docs="""Control the image storage format.

        Valid values are:
        - PNG: PNG format
        - BMP8: 8-bit bitmap
        - BMP24: 24-bit bitmap
        - JPEG: JPEG format
        - TIFF: TIFF format""",
        validator=strict_discrete_set,
        values=["PNG", "BMP8", "BMP24", "JPEG", "TIFF"],
    )

    storage_image_invert = Instrument.control(
        get_command=":STORage:IMAGe:INVERT?",
        set_command=":STORage:IMAGe:INVERT %d",
        docs="""Control if the stored image colors are inverted (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    storage_image_color = Instrument.control(
        get_command=":STORage:IMAGe:COLor?",
        set_command=":STORage:IMAGe:COLor %s",
        docs="""Control if the stored image is in color or intensity-graded.

        Valid values are ON (color) or OFF (intensity graded).""",
        validator=strict_discrete_set,
        values=["ON", "OFF"],
    )

    # ########################################################################
    # System Subsystem
    # ########################################################################

    system_autoscale_enabled = Instrument.control(
        get_command=":SYSTem:AUToscale?",
        set_command=":SYSTem:AUToscale %d",
        docs="""Control if the autoscale function is enabled (bool).

        When disabled, the autoscale button on the front panel is inactive.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    system_beeper = Instrument.control(
        get_command=":SYSTem:BEEPer?",
        set_command=":SYSTem:BEEPer %d",
        docs="""Control if the beeper is enabled (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    system_error = Instrument.measurement(
        get_command=":SYSTem:ERRor?",
        docs="""Get the last system error as a tuple of (error_code, error_message).

        Returns a tuple of (int, str), e.g. (0, "No error") when no error has occurred.
        A non-zero error_code indicates an error condition.""",
        cast=lambda v: (
            int(v.split(",", 1)[0].strip()),
            v.split(",", 1)[1].strip().strip('"'),
        ),
    )

    system_gam = Instrument.measurement(
        get_command=":SYSTem:GAM?",
        docs="""Get the number of analog channels available (int). Always returns 12.""",
    )

    system_language = Instrument.control(
        get_command=":SYSTem:LANGuage?",
        set_command=":SYSTem:LANGuage %s",
        docs="""Control the display language.

        Valid values are SCHinese, TCHinese, ENGLish, PORTuguese, GERMan, POLish,
        KORean, JAPAnese, FRENch, RUSSian.""",
        validator=strict_discrete_set,
        values=[
            "SCH",
            "TCH",
            "ENGL",
            "PORT",
            "GERM",
            "POL",
            "KOR",
            "JAPA",
            "FREN",
            "RUSS",
        ],
    )

    system_locked = Instrument.control(
        get_command=":SYSTem:LOCKed?",
        set_command=":SYSTem:LOCKed %d",
        docs="""Control if the front panel keyboard is locked (bool).

        When locked, all keys and knobs on the front panel are disabled.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    system_power_on_setting = Instrument.control(
        get_command=":SYSTem:PON?",
        set_command=":SYSTem:PON %s",
        docs="""Control the power-on configuration.

        Valid values are:
        - LAT: Restore last settings (LATest)
        - DEF: Use default settings (DEFault)""",
        validator=strict_discrete_set,
        values=["LAT", "DEF"],
    )

    system_ram = Instrument.measurement(
        get_command=":SYSTem:RAM?",
        docs="""Get the system RAM size information (int). Always returns 4.""",
    )

    def system_option_install(self, license_key: str) -> None:
        """Install an option using a 28-character license key.

        Args:
            license_key: The license key string (uppercase letters and digits,
                28 characters, no hyphens).
        """
        self.write(f":SYSTem:OPTion:INSTall {license_key}")

    def system_option_uninstall(self) -> None:
        """Uninstall all installed options."""
        self.write(":SYSTem:OPTion:UNINSTall")

    # ########################################################################
    # Digital / Logic Analyzer Subsystem (MSO models only)
    # ########################################################################

    la_state = Instrument.control(
        get_command=":LA:STATe?",
        set_command=":LA:STATe %d",
        docs="""Control if the logic analyzer is enabled (bool).

        Only available on MSO models.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    la_active = Instrument.control(
        get_command=":LA:ACTive?",
        set_command=":LA:ACTive %s",
        docs="""Control the active digital channel or group.

        Valid values are D0-D15 (individual channels), GROUP1-GROUP4,
        or NONE.""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST_DGROUPS,
    )

    la_autosort = Instrument.setting(
        set_command=":LA:AUTosort %d",
        docs="""Set the auto sort mode for digital channels (bool).

        When enabled (1), digital channels are automatically sorted.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    la_size = Instrument.control(
        get_command=":LA:SIZE?",
        set_command=":LA:SIZE %s",
        docs="""Control the display size of digital channels.

        Valid values are:
        - SMAL: Small display
        - LARG: Large display""",
        validator=strict_discrete_set,
        values=["SMAL", "LARG"],
    )

    la_time_calibration = Instrument.control(
        get_command=":LA:TCALibrate?",
        set_command=":LA:TCALibrate %e",
        docs="""Control the time calibration offset for digital channels in seconds (float).

        Valid range is -100 ns to 100 ns.""",
        validator=truncated_range,
        values=(-100e-9, 100e-9),
    )

    la_pod1_display = Instrument.control(
        get_command=":LA:POD1:DISPlay?",
        set_command=":LA:POD1:DISPlay %d",
        docs="""Control if POD1 (D0-D7) is displayed (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    la_pod2_display = Instrument.control(
        get_command=":LA:POD2:DISPlay?",
        set_command=":LA:POD2:DISPlay %d",
        docs="""Control if POD2 (D8-D15) is displayed (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    la_pod1_threshold = Instrument.control(
        get_command=":LA:POD1:THReshold?",
        set_command=":LA:POD1:THReshold %f",
        docs="""Control the threshold voltage for POD1 (D0-D7) in volts (float).

        Valid range is -15.0 V to 15.0 V.""",
        validator=truncated_range,
        values=(-15.0, 15.0),
    )

    la_pod2_threshold = Instrument.control(
        get_command=":LA:POD2:THReshold?",
        set_command=":LA:POD2:THReshold %f",
        docs="""Control the threshold voltage for POD2 (D8-D15) in volts (float).

        Valid range is -15.0 V to 15.0 V.""",
        validator=truncated_range,
        values=(-15.0, 15.0),
    )

    def la_digital_display(self, channel: int, enabled: bool) -> None:
        """Control if a specific digital channel is displayed.

        Args:
            channel: Digital channel number (0-15).
            enabled: True to enable display, False to disable.
        """
        value = 1 if enabled else 0
        self.write(f":LA:DIGital{channel}:DISPlay {value}")

    def la_digital_display_get(self, channel: int) -> bool:
        """Get if a specific digital channel is displayed.

        Args:
            channel: Digital channel number (0-15).

        Returns:
            True if displayed, False otherwise.
        """
        return bool(int(self.ask(f":LA:DIGital{channel}:DISPlay?")))

    def la_digital_position(self, channel: int, position: int) -> None:
        """Set the display position of a specific digital channel.

        Args:
            channel: Digital channel number (0-15).
            position: Display position (0-15 in small mode, 0-7 in large mode).
        """
        self.write(f":LA:DIGital{channel}:POSition {position}")

    def la_digital_position_get(self, channel: int) -> int:
        """Get the display position of a specific digital channel.

        Args:
            channel: Digital channel number (0-15).

        Returns:
            The display position.
        """
        return int(self.ask(f":LA:DIGital{channel}:POSition?"))

    def la_digital_label(self, channel: int, label: str) -> None:
        """Set the label for a specific digital channel.

        Args:
            channel: Digital channel number (0-15).
            label: Label string (max 4 characters, A-Z and 0-9).
        """
        self.write(f":LA:DIGital{channel}:LABel {label}")

    def la_digital_label_get(self, channel: int) -> str:
        """Get the label for a specific digital channel.

        Args:
            channel: Digital channel number (0-15).

        Returns:
            The label string.
        """
        return self.ask(f":LA:DIGital{channel}:LABel?")

    # ########################################################################
    # Reference Waveform Subsystem
    # ########################################################################

    reference_display = Instrument.control(
        get_command=":REFerence:DISPlay?",
        set_command=":REFerence:DISPlay %d",
        docs="""Control if reference waveform display is globally enabled (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    def reference_enable(self, ref: int, enabled: bool) -> None:
        """Enable or disable a specific reference waveform.

        Args:
            ref: Reference number (1-10).
            enabled: True to enable, False to disable.
        """
        value = 1 if enabled else 0
        self.write(f":REFerence{ref}:ENABle {value}")

    def reference_enable_get(self, ref: int) -> bool:
        """Get if a specific reference waveform is enabled.

        Args:
            ref: Reference number (1-10).

        Returns:
            True if enabled, False otherwise.
        """
        return bool(int(self.ask(f":REFerence{ref}:ENABle?")))

    def reference_source(self, ref: int, source: str) -> None:
        """Set the source for a reference waveform.

        Args:
            ref: Reference number (1-10).
            source: Source channel (CHANnel1-4, MATH, D0-D15).
        """
        self.write(f":REFerence{ref}:SOURce {source}")

    def reference_source_get(self, ref: int) -> str:
        """Get the source for a reference waveform.

        Args:
            ref: Reference number (1-10).

        Returns:
            The source channel string.
        """
        return self.ask(f":REFerence{ref}:SOURce?")

    def reference_vscale(self, ref: int, scale: float) -> None:
        """Set the vertical scale of a reference waveform.

        Args:
            ref: Reference number (1-10).
            scale: Vertical scale in V/div (1 mV to 10 V for 1X probe,
                10 mV to 100 V for 10X probe).
        """
        self.write(f":REFerence{ref}:VSCale {scale}")

    def reference_vscale_get(self, ref: int) -> float:
        """Get the vertical scale of a reference waveform.

        Args:
            ref: Reference number (1-10).

        Returns:
            The vertical scale in V/div.
        """
        return float(self.ask(f":REFerence{ref}:VSCale?"))

    def reference_voffset(self, ref: int, offset: float) -> None:
        """Set the vertical offset of a reference waveform.

        Args:
            ref: Reference number (1-10).
            offset: Vertical offset in volts. Valid range is
                -10 * VScale to 10 * VScale.
        """
        self.write(f":REFerence{ref}:VOFFset {offset}")

    def reference_voffset_get(self, ref: int) -> float:
        """Get the vertical offset of a reference waveform.

        Args:
            ref: Reference number (1-10).

        Returns:
            The vertical offset in volts.
        """
        return float(self.ask(f":REFerence{ref}:VOFFset?"))

    def reference_reset(self, ref: int) -> None:
        """Reset a reference waveform to default settings.

        Args:
            ref: Reference number (1-10).
        """
        self.write(f":REFerence{ref}:RESet")

    def reference_save(self, ref: int) -> None:
        """Save the current waveform to a reference slot.

        Args:
            ref: Reference number (1-10).
        """
        self.write(f":REFerence{ref}:SAVe")

    def reference_current(self, ref: int) -> None:
        """Set the reference waveform data to the current waveform.

        Args:
            ref: Reference number (1-10).
        """
        self.write(f":REFerence{ref}:CURRent")

    def reference_color(self, ref: int, color: str) -> None:
        """Set the display color of a reference waveform.

        Args:
            ref: Reference number (1-10).
            color: Color name (GRAY, GREEn, LBLue, MAGenta, ORANge).
        """
        self.write(f":REFerence{ref}:COLor {color}")

    def reference_color_get(self, ref: int) -> str:
        """Get the display color of a reference waveform.

        Args:
            ref: Reference number (1-10).

        Returns:
            The color string.
        """
        return self.ask(f":REFerence{ref}:COLor?")

    # ########################################################################
    # Waveform Record Subsystem (Option)
    # ########################################################################

    wrecord_enable = Instrument.control(
        get_command=":FUNCtion:WRECord:ENABle?",
        set_command=":FUNCtion:WRECord:ENABle %d",
        docs="""Control if waveform recording is enabled (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    wrecord_end_frame = Instrument.control(
        get_command=":FUNCtion:WRECord:FEND?",
        set_command=":FUNCtion:WRECord:FEND %d",
        docs="""Control the end frame number for waveform recording (int).

        Valid range is 1 to the maximum number of frames recordable.""",
        validator=truncated_range,
        values=(1, 100000),
    )

    wrecord_max_frames = Instrument.measurement(
        get_command=":FUNCtion:WRECord:FMAX?",
        docs="""Get the maximum number of frames that can be recorded (int).""",
    )

    wrecord_interval = Instrument.control(
        get_command=":FUNCtion:WRECord:FINTerval?",
        set_command=":FUNCtion:WRECord:FINTerval %e",
        docs="""Control the frame recording interval in seconds (float).

        Valid range is 100 ns to 10 s.""",
        validator=truncated_range,
        values=(100e-9, 10.0),
    )

    wrecord_prompt = Instrument.control(
        get_command=":FUNCtion:WRECord:PROMpt?",
        set_command=":FUNCtion:WRECord:PROMpt %d",
        docs="""Control if recording status prompt is displayed (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    wrecord_operate = Instrument.control(
        get_command=":FUNCtion:WRECord:OPERate?",
        set_command=":FUNCtion:WRECord:OPERate %s",
        docs="""Control the waveform recording operation.

        Valid values are:
        - RUN: Start recording
        - STOP: Stop recording""",
        validator=strict_discrete_set,
        values=["RUN", "STOP"],
    )

    # ########################################################################
    # Waveform Replay/Playback Subsystem (Option)
    # ########################################################################

    wreplay_start_frame = Instrument.control(
        get_command=":FUNCtion:WREPlay:FSTart?",
        set_command=":FUNCtion:WREPlay:FSTart %d",
        docs="""Control the start frame number for replay (int).""",
        validator=truncated_range,
        values=(1, 100000),
    )

    wreplay_end_frame = Instrument.control(
        get_command=":FUNCtion:WREPlay:FEND?",
        set_command=":FUNCtion:WREPlay:FEND %d",
        docs="""Control the end frame number for replay (int).""",
        validator=truncated_range,
        values=(1, 100000),
    )

    wreplay_max_frames = Instrument.measurement(
        get_command=":FUNCtion:WREPlay:FMAX?",
        docs="""Get the maximum number of frames available for replay (int).""",
    )

    wreplay_interval = Instrument.control(
        get_command=":FUNCtion:WREPlay:FINTerval?",
        set_command=":FUNCtion:WREPlay:FINTerval %e",
        docs="""Control the frame replay interval in seconds (float).

        Valid range is 100 ns to 10 s.""",
        validator=truncated_range,
        values=(100e-9, 10.0),
    )

    wreplay_mode = Instrument.control(
        get_command=":FUNCtion:WREPlay:MODE?",
        set_command=":FUNCtion:WREPlay:MODE %s",
        docs="""Control the playback mode.

        Valid values are:
        - REP: Repeat playback continuously
        - SING: Single playback""",
        validator=strict_discrete_set,
        values=["REP", "SING"],
    )

    wreplay_direction = Instrument.control(
        get_command=":FUNCtion:WREPlay:DIRection?",
        set_command=":FUNCtion:WREPlay:DIRection %s",
        docs="""Control the playback direction.

        Valid values are:
        - FORW: Forward playback
        - BACK: Backward playback""",
        validator=strict_discrete_set,
        values=["FORW", "BACK"],
    )

    wreplay_operate = Instrument.control(
        get_command=":FUNCtion:WREPlay:OPERate?",
        set_command=":FUNCtion:WREPlay:OPERate %s",
        docs="""Control the playback operation.

        Valid values are:
        - PLAY: Start playback
        - PAUS: Pause playback
        - STOP: Stop playback""",
        validator=strict_discrete_set,
        values=["PLAY", "PAUS", "STOP"],
    )

    wreplay_current_frame = Instrument.control(
        get_command=":FUNCtion:WREPlay:FCURrent?",
        set_command=":FUNCtion:WREPlay:FCURrent %d",
        docs="""Control the current frame number during playback (int).""",
        validator=truncated_range,
        values=(1, 100000),
    )

    # ########################################################################
    # Source / Function Generator Subsystem (Option, -S models)
    # ########################################################################

    source_output = Instrument.control(
        get_command=":SOURce1:OUTPut1:STATe?",
        set_command=":SOURce1:OUTPut1:STATe %d",
        docs="""Control if the source output 1 is enabled (bool).

        Only available on models with built-in function generator (-S models).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    source_output2 = Instrument.control(
        get_command=":SOURce2:OUTPut2:STATe?",
        set_command=":SOURce2:OUTPut2:STATe %d",
        docs="""Control if the source output 2 is enabled (bool).

        Only available on models with two source outputs.""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    source_impedance = Instrument.control(
        get_command=":SOURce1:OUTPut1:IMPedance?",
        set_command=":SOURce1:OUTPut1:IMPedance %s",
        docs="""Control the output impedance of source 1.

        Valid values are:
        - OMEG: High impedance (open)
        - FIFT: 50 ohm""",
        validator=strict_discrete_set,
        values=["OMEG", "FIFT"],
    )

    source_frequency = Instrument.control(
        get_command=":SOURce1:FREQuency?",
        set_command=":SOURce1:FREQuency %e",
        docs="""Control the output frequency of source 1 in Hz (float).

        Valid range depends on the waveform function:
        - Sine: 0.1 Hz to 25 MHz
        - Square: 0.1 Hz to 15 MHz
        - Pulse: 0.1 Hz to 1 MHz
        - Ramp: 0.1 Hz to 100 kHz
        - Arbitrary: 0.1 Hz to 10 MHz""",
        validator=truncated_range,
        values=(0.1, 25e6),
    )

    source_phase = Instrument.control(
        get_command=":SOURce1:PHASe?",
        set_command=":SOURce1:PHASe %f",
        docs="""Control the start phase of source 1 in degrees (float).

        Valid range is 0 to 360.""",
        validator=truncated_range,
        values=(0.0, 360.0),
    )

    def source_phase_init(self) -> None:
        """Initialize the phase of source 1, aligning it with source 2."""
        self.write(":SOURce1:PHASe:INITiate")

    source_function = Instrument.control(
        get_command=":SOURce1:FUNCtion?",
        set_command=":SOURce1:FUNCtion %s",
        docs="""Control the waveform function of source 1.

        Valid values are:
        - SIN: Sinusoidal wave
        - SQU: Square wave
        - RAMP: Ramp wave
        - PULS: Pulse wave
        - NOIS: Noise
        - DC: DC voltage
        - SINC: Sinc waveform
        - EXPR: Exponential rise
        - EXPF: Exponential fall
        - ECG: Electrocardiogram
        - GAUS: Gaussian
        - LOR: Lorentz
        - HAV: Haversine""",
        validator=strict_discrete_set,
        values=[
            "SIN",
            "SQU",
            "RAMP",
            "PULS",
            "NOIS",
            "DC",
            "SINC",
            "EXPR",
            "EXPF",
            "ECG",
            "GAUS",
            "LOR",
            "HAV",
        ],
    )

    source_ramp_symmetry = Instrument.control(
        get_command=":SOURce1:FUNCtion:RAMP:SYMMetry?",
        set_command=":SOURce1:FUNCtion:RAMP:SYMMetry %f",
        docs="""Control the symmetry of the ramp waveform in percent (float).

        Valid range is 0 to 100. Only relevant when source_function is RAMP.""",
        validator=truncated_range,
        values=(0.0, 100.0),
    )

    source_voltage = Instrument.control(
        get_command=":SOURce1:VOLTage?",
        set_command=":SOURce1:VOLTage %f",
        docs="""Control the output voltage amplitude of source 1 in Vpp (float).

        Valid range depends on the output impedance:
        - High impedance: 20 mVpp to 5 Vpp
        - 50 ohm: 10 mVpp to 2.5 Vpp""",
        validator=truncated_range,
        values=(0.01, 5.0),
    )

    source_voltage_offset = Instrument.control(
        get_command=":SOURce1:VOLTage:OFFSet?",
        set_command=":SOURce1:VOLTage:OFFSet %f",
        docs="""Control the DC offset of the source output in VDC (float).

        The valid range depends on the impedance and amplitude settings.""",
        validator=truncated_range,
        values=(-2.5, 2.5),
    )

    source_pulse_duty = Instrument.control(
        get_command=":SOURce1:PULSe:DCYCle?",
        set_command=":SOURce1:PULSe:DCYCle %f",
        docs="""Control the duty cycle of the pulse waveform in percent (float).

        Valid range is 10 to 90. Only relevant when source_function is PULS.""",
        validator=truncated_range,
        values=(10.0, 90.0),
    )

    source_mod_state = Instrument.control(
        get_command=":SOURce1:MOD:STATe?",
        set_command=":SOURce1:MOD:STATe %d",
        docs="""Control if modulation is enabled for source 1 (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    source_mod_type = Instrument.control(
        get_command=":SOURce1:MOD:TYPe?",
        set_command=":SOURce1:MOD:TYPe %s",
        docs="""Control the modulation type.

        Valid values are:
        - AM: Amplitude modulation
        - FM: Frequency modulation""",
        validator=strict_discrete_set,
        values=["AM", "FM"],
    )

    source_mod_am_depth = Instrument.control(
        get_command=":SOURce1:MOD:AM:DEPTh?",
        set_command=":SOURce1:MOD:AM:DEPTh %f",
        docs="""Control the AM modulation depth in percent (float).

        Valid range is 0 to 120.""",
        validator=truncated_range,
        values=(0.0, 120.0),
    )

    source_mod_am_frequency = Instrument.control(
        get_command=":SOURce1:MOD:AM:INTernal:FREQuency?",
        set_command=":SOURce1:MOD:AM:INTernal:FREQuency %e",
        docs="""Control the AM modulation frequency in Hz (float).

        Valid range is 1 Hz to 50 kHz.""",
        validator=truncated_range,
        values=(1.0, 50e3),
    )

    source_mod_am_function = Instrument.control(
        get_command=":SOURce1:MOD:AM:INTernal:FUNCtion?",
        set_command=":SOURce1:MOD:AM:INTernal:FUNCtion %s",
        docs="""Control the AM modulation waveform.

        Valid values are:
        - SIN: Sinusoidal
        - SQU: Square
        - TRI: Triangle
        - NOIS: Noise""",
        validator=strict_discrete_set,
        values=["SIN", "SQU", "TRI", "NOIS"],
    )

    source_mod_fm_deviation = Instrument.control(
        get_command=":SOURce1:MOD:FM:DEVIation?",
        set_command=":SOURce1:MOD:FM:DEVIation %e",
        docs="""Control the FM frequency deviation in Hz (float).

        Valid range is 0 Hz to the carrier frequency.""",
        validator=truncated_range,
        values=(0.0, 25e6),
    )

    source_mod_fm_frequency = Instrument.control(
        get_command=":SOURce1:MOD:FM:INTernal:FREQuency?",
        set_command=":SOURce1:MOD:FM:INTernal:FREQuency %e",
        docs="""Control the FM modulation frequency in Hz (float).

        Valid range is 1 Hz to 50 kHz.""",
        validator=truncated_range,
        values=(1.0, 50e3),
    )

    source_mod_fm_function = Instrument.control(
        get_command=":SOURce1:MOD:FM:INTernal:FUNCtion?",
        set_command=":SOURce1:MOD:FM:INTernal:FUNCtion %s",
        docs="""Control the FM modulation waveform.

        Valid values are:
        - SIN: Sinusoidal
        - SQU: Square
        - TRI: Triangle
        - NOIS: Noise""",
        validator=strict_discrete_set,
        values=["SIN", "SQU", "TRI", "NOIS"],
    )

    source_apply = Instrument.measurement(
        get_command=":SOURce1:APPLy?",
        docs="""Get the current source configuration as a comma-separated string.

        Returns: '<waveform>,<frequency>,<amplitude>,<offset>,<phase>'.""",
    )

    def source_apply_sinusoid(
        self,
        frequency: float = 1e3,
        amplitude: float = 5.0,
        offset: float = 0.0,
        phase: float = 0.0,
    ) -> None:
        """Apply a sinusoidal waveform to source 1.

        Args:
            frequency: Frequency in Hz (0.1 Hz to 25 MHz).
            amplitude: Amplitude in Vpp.
            offset: DC offset in VDC.
            phase: Start phase in degrees (0-360).
        """
        self.write(f":SOURce1:APPLy:SINusoid {frequency},{amplitude},{offset},{phase}")

    def source_apply_square(
        self,
        frequency: float = 1e3,
        amplitude: float = 5.0,
        offset: float = 0.0,
        phase: float = 0.0,
    ) -> None:
        """Apply a square waveform to source 1.

        Args:
            frequency: Frequency in Hz (0.1 Hz to 15 MHz).
            amplitude: Amplitude in Vpp.
            offset: DC offset in VDC.
            phase: Start phase in degrees (0-360).
        """
        self.write(f":SOURce1:APPLy:SQUare {frequency},{amplitude},{offset},{phase}")

    def source_apply_ramp(
        self,
        frequency: float = 1e3,
        amplitude: float = 5.0,
        offset: float = 0.0,
        phase: float = 0.0,
    ) -> None:
        """Apply a ramp waveform to source 1.

        Args:
            frequency: Frequency in Hz (0.1 Hz to 100 kHz).
            amplitude: Amplitude in Vpp.
            offset: DC offset in VDC.
            phase: Start phase in degrees (0-360).
        """
        self.write(f":SOURce1:APPLy:RAMP {frequency},{amplitude},{offset},{phase}")

    def source_apply_pulse(
        self,
        frequency: float = 1e3,
        amplitude: float = 5.0,
        offset: float = 0.0,
        phase: float = 0.0,
    ) -> None:
        """Apply a pulse waveform to source 1.

        Args:
            frequency: Frequency in Hz (0.1 Hz to 1 MHz).
            amplitude: Amplitude in Vpp.
            offset: DC offset in VDC.
            phase: Start phase in degrees (0-360).
        """
        self.write(f":SOURce1:APPLy:PULSe {frequency},{amplitude},{offset},{phase}")

    def source_apply_noise(
        self,
        amplitude: float = 5.0,
        offset: float = 0.0,
    ) -> None:
        """Apply a noise waveform to source 1.

        Args:
            amplitude: Amplitude in Vpp.
            offset: DC offset in VDC.
        """
        self.write(f":SOURce1:APPLy:NOISe {amplitude},{offset}")

    def source_apply_user(
        self,
        frequency: float = 1e3,
        amplitude: float = 5.0,
        offset: float = 0.0,
        phase: float = 0.0,
    ) -> None:
        """Apply an arbitrary user waveform to source 1.

        Args:
            frequency: Frequency in Hz (0.1 Hz to 10 MHz).
            amplitude: Amplitude in Vpp.
            offset: DC offset in VDC.
            phase: Start phase in degrees (0-360).
        """
        self.write(f":SOURce1:APPLy:USER {frequency},{amplitude},{offset},{phase}")

    # ########################################################################
    # Decoder Subsystem (Option)
    # ########################################################################

    # --- Common Decoder Settings (Decoder 1) ---

    decoder1_mode = Instrument.control(
        get_command=":DECoder1:MODE?",
        set_command=":DECoder1:MODE %s",
        docs="""Control the protocol decoder 1 mode.

        Valid values are:
        - PAR: Parallel
        - UART: UART/RS232
        - SPI: SPI
        - IIC: I2C""",
        validator=strict_discrete_set,
        values=["PAR", "UART", "SPI", "IIC"],
    )

    decoder1_display = Instrument.control(
        get_command=":DECoder1:DISPlay?",
        set_command=":DECoder1:DISPlay %d",
        docs="""Control if decoder 1 results are displayed (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    decoder1_format = Instrument.control(
        get_command=":DECoder1:FORMat?",
        set_command=":DECoder1:FORMat %s",
        docs="""Control the display format for decoder 1.

        Valid values are:
        - HEX: Hexadecimal
        - ASC: ASCII
        - DEC: Decimal
        - BIN: Binary
        - LINE: Line format""",
        validator=strict_discrete_set,
        values=["HEX", "ASC", "DEC", "BIN", "LINE"],
    )

    decoder1_position = Instrument.control(
        get_command=":DECoder1:POSition?",
        set_command=":DECoder1:POSition %d",
        docs="""Control the vertical position of decoder 1 display (int).

        Valid range is 50 to 350.""",
        validator=truncated_range,
        values=(50, 350),
    )

    decoder1_threshold_auto = Instrument.control(
        get_command=":DECoder1:THREshold:AUTO?",
        set_command=":DECoder1:THREshold:AUTO %d",
        docs="""Control if automatic threshold detection is enabled for decoder 1 (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    decoder1_config_label = Instrument.control(
        get_command=":DECoder1:CONFig:LABel?",
        set_command=":DECoder1:CONFig:LABel %d",
        docs="""Control if labels are displayed for decoder 1 (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    decoder1_config_line = Instrument.control(
        get_command=":DECoder1:CONFig:LINE?",
        set_command=":DECoder1:CONFig:LINE %d",
        docs="""Control if bus lines are displayed for decoder 1 (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    decoder1_config_format = Instrument.control(
        get_command=":DECoder1:CONFig:FORMat?",
        set_command=":DECoder1:CONFig:FORMat %d",
        docs="""Control if format display is enabled for decoder 1 (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    decoder1_config_endian = Instrument.control(
        get_command=":DECoder1:CONFig:ENDian?",
        set_command=":DECoder1:CONFig:ENDian %d",
        docs="""Control if MSB-first (big endian) display is enabled for decoder 1 (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    decoder1_config_width = Instrument.control(
        get_command=":DECoder1:CONFig:WIDth?",
        set_command=":DECoder1:CONFig:WIDth %d",
        docs="""Control if data width display is enabled for decoder 1 (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    decoder1_config_sample_rate = Instrument.measurement(
        get_command=":DECoder1:CONFig:SRATe?",
        docs="""Get the decoder 1 sample rate.""",
    )

    # --- Decoder 1 UART settings ---

    decoder1_uart_tx = Instrument.control(
        get_command=":DECoder1:UART:TX?",
        set_command=":DECoder1:UART:TX %s",
        docs="""Control the UART TX source for decoder 1.

        Valid values are CHANnel1-4, D0-D15, or OFF.""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST + ["OFF"],
    )

    decoder1_uart_rx = Instrument.control(
        get_command=":DECoder1:UART:RX?",
        set_command=":DECoder1:UART:RX %s",
        docs="""Control the UART RX source for decoder 1.

        Valid values are CHANnel1-4, D0-D15, or OFF.""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST + ["OFF"],
    )

    decoder1_uart_polarity = Instrument.control(
        get_command=":DECoder1:UART:POLarity?",
        set_command=":DECoder1:UART:POLarity %s",
        docs="""Control the UART signal polarity for decoder 1.

        Valid values are:
        - NEG: Negative polarity (inverted)
        - POS: Positive polarity (normal)""",
        validator=strict_discrete_set,
        values=["NEG", "POS"],
    )

    decoder1_uart_endian = Instrument.control(
        get_command=":DECoder1:UART:ENDian?",
        set_command=":DECoder1:UART:ENDian %s",
        docs="""Control the UART bit order for decoder 1.

        Valid values are:
        - LSB: Least significant bit first
        - MSB: Most significant bit first""",
        validator=strict_discrete_set,
        values=["LSB", "MSB"],
    )

    decoder1_uart_baud = Instrument.control(
        get_command=":DECoder1:UART:BAUD?",
        set_command=":DECoder1:UART:BAUD %d",
        docs="""Control the UART baud rate for decoder 1 in bps (int).

        Valid range is 110 to 20000000.""",
        validator=truncated_range,
        values=(110, 20000000),
    )

    decoder1_uart_width = Instrument.control(
        get_command=":DECoder1:UART:WIDTh?",
        set_command=":DECoder1:UART:WIDTh %d",
        docs="""Control the UART data width for decoder 1 (int).

        Valid range is 5 to 8 bits.""",
        validator=strict_discrete_set,
        values=[5, 6, 7, 8],
    )

    decoder1_uart_stop = Instrument.control(
        get_command=":DECoder1:UART:STOP?",
        set_command=":DECoder1:UART:STOP %s",
        docs="""Control the UART stop bit configuration for decoder 1.

        Valid values are 1, 1.5, or 2 stop bits.""",
        validator=strict_discrete_set,
        values=["1", "1.5", "2"],
    )

    decoder1_uart_parity = Instrument.control(
        get_command=":DECoder1:UART:PARity?",
        set_command=":DECoder1:UART:PARity %s",
        docs="""Control the UART parity for decoder 1.

        Valid values are:
        - NONE: No parity
        - EVEN: Even parity
        - ODD: Odd parity""",
        validator=strict_discrete_set,
        values=["NONE", "EVEN", "ODD"],
    )

    # --- Decoder 1 IIC (I2C) settings ---

    decoder1_iic_clock = Instrument.control(
        get_command=":DECoder1:IIC:CLK?",
        set_command=":DECoder1:IIC:CLK %s",
        docs="""Control the I2C clock source for decoder 1.

        Valid values are CHANnel1-4, D0-D15.""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    decoder1_iic_data = Instrument.control(
        get_command=":DECoder1:IIC:DATA?",
        set_command=":DECoder1:IIC:DATA %s",
        docs="""Control the I2C data source for decoder 1.

        Valid values are CHANnel1-4, D0-D15.""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    decoder1_iic_address = Instrument.control(
        get_command=":DECoder1:IIC:ADDRess?",
        set_command=":DECoder1:IIC:ADDRess %s",
        docs="""Control the I2C address mode for decoder 1.

        Valid values are:
        - NORM: Normal address display
        - RW: Include R/W bit in address""",
        validator=strict_discrete_set,
        values=["NORM", "RW"],
    )

    # --- Decoder 1 SPI settings ---

    decoder1_spi_clock = Instrument.control(
        get_command=":DECoder1:SPI:CLK?",
        set_command=":DECoder1:SPI:CLK %s",
        docs="""Control the SPI clock source for decoder 1.

        Valid values are CHANnel1-4, D0-D15.""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    decoder1_spi_miso = Instrument.control(
        get_command=":DECoder1:SPI:MISO?",
        set_command=":DECoder1:SPI:MISO %s",
        docs="""Control the SPI MISO source for decoder 1.

        Valid values are CHANnel1-4, D0-D15, or OFF.""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST + ["OFF"],
    )

    decoder1_spi_mosi = Instrument.control(
        get_command=":DECoder1:SPI:MOSI?",
        set_command=":DECoder1:SPI:MOSI %s",
        docs="""Control the SPI MOSI source for decoder 1.

        Valid values are CHANnel1-4, D0-D15, or OFF.""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST + ["OFF"],
    )

    decoder1_spi_cs = Instrument.control(
        get_command=":DECoder1:SPI:CS?",
        set_command=":DECoder1:SPI:CS %s",
        docs="""Control the SPI chip select source for decoder 1.

        Valid values are CHANnel1-4, D0-D15.""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST,
    )

    decoder1_spi_select = Instrument.control(
        get_command=":DECoder1:SPI:SELect?",
        set_command=":DECoder1:SPI:SELect %s",
        docs="""Control the SPI chip select polarity for decoder 1.

        Valid values are:
        - NCS: Active low (inverted)
        - CS: Active high""",
        validator=strict_discrete_set,
        values=["NCS", "CS"],
    )

    decoder1_spi_mode = Instrument.control(
        get_command=":DECoder1:SPI:MODE?",
        set_command=":DECoder1:SPI:MODE %s",
        docs="""Control the SPI framing mode for decoder 1.

        Valid values are:
        - CS: Use chip select for frame boundaries
        - TIM: Use timeout for frame boundaries""",
        validator=strict_discrete_set,
        values=["CS", "TIM"],
    )

    decoder1_spi_timeout = Instrument.control(
        get_command=":DECoder1:SPI:TIMeout?",
        set_command=":DECoder1:SPI:TIMeout %e",
        docs="""Control the SPI timeout value for decoder 1 in seconds (float).

        Used when spi_mode is TIM. Must be greater than max clock pulse width
        and less than idle time between frames.""",
        validator=truncated_range,
        values=(1e-9, 1.0),
    )

    decoder1_spi_polarity = Instrument.control(
        get_command=":DECoder1:SPI:POLarity?",
        set_command=":DECoder1:SPI:POLarity %s",
        docs="""Control the SPI clock polarity (CPOL) for decoder 1.

        Valid values are:
        - NEG: Negative (idle low)
        - POS: Positive (idle high)""",
        validator=strict_discrete_set,
        values=["NEG", "POS"],
    )

    decoder1_spi_edge = Instrument.control(
        get_command=":DECoder1:SPI:EDGE?",
        set_command=":DECoder1:SPI:EDGE %s",
        docs="""Control the SPI clock edge (CPHA) for decoder 1.

        Valid values are:
        - RISE: Data sampled on rising edge
        - FALL: Data sampled on falling edge""",
        validator=strict_discrete_set,
        values=["RISE", "FALL"],
    )

    decoder1_spi_endian = Instrument.control(
        get_command=":DECoder1:SPI:ENDian?",
        set_command=":DECoder1:SPI:ENDian %s",
        docs="""Control the SPI bit order for decoder 1.

        Valid values are:
        - LSB: Least significant bit first
        - MSB: Most significant bit first""",
        validator=strict_discrete_set,
        values=["LSB", "MSB"],
    )

    decoder1_spi_width = Instrument.control(
        get_command=":DECoder1:SPI:WIDTh?",
        set_command=":DECoder1:SPI:WIDTh %d",
        docs="""Control the SPI data width for decoder 1 (int).

        Valid range is 8 to 32 bits.""",
        validator=truncated_range,
        values=(8, 32),
    )

    # --- Decoder 1 Parallel settings ---

    decoder1_parallel_clock = Instrument.control(
        get_command=":DECoder1:PARallel:CLK?",
        set_command=":DECoder1:PARallel:CLK %s",
        docs="""Control the parallel decoder 1 clock source.

        Valid values are CHANnel1-4, D0-D15, or OFF.""",
        validator=strict_discrete_set,
        values=_CHANNEL_LIST + ["OFF"],
    )

    decoder1_parallel_edge = Instrument.control(
        get_command=":DECoder1:PARallel:EDGE?",
        set_command=":DECoder1:PARallel:EDGE %s",
        docs="""Control the clock edge for parallel decoder 1.

        Valid values are:
        - RISE: Rising edge
        - FALL: Falling edge
        - BOTH: Both edges""",
        validator=strict_discrete_set,
        values=["RISE", "FALL", "BOTH"],
    )

    decoder1_parallel_width = Instrument.control(
        get_command=":DECoder1:PARallel:WIDTh?",
        set_command=":DECoder1:PARallel:WIDTh %d",
        docs="""Control the data width for parallel decoder 1 (int).

        Valid range is 1 to 16 bits.""",
        validator=truncated_range,
        values=(1, 16),
    )

    decoder1_parallel_polarity = Instrument.control(
        get_command=":DECoder1:PARallel:POLarity?",
        set_command=":DECoder1:PARallel:POLarity %s",
        docs="""Control the data polarity for parallel decoder 1.

        Valid values are:
        - NEG: Negative polarity (inverted)
        - POS: Positive polarity (normal)""",
        validator=strict_discrete_set,
        values=["NEG", "POS"],
    )

    decoder1_parallel_noise_reject = Instrument.control(
        get_command=":DECoder1:PARallel:NREJect?",
        set_command=":DECoder1:PARallel:NREJect %d",
        docs="""Control if noise rejection is enabled for parallel decoder 1 (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    decoder1_parallel_nr_time = Instrument.control(
        get_command=":DECoder1:PARallel:NRTime?",
        set_command=":DECoder1:PARallel:NRTime %e",
        docs="""Control the noise rejection time for parallel decoder 1 in seconds (float).

        Valid range is 0 to 100 ms.""",
        validator=truncated_range,
        values=(0.0, 0.1),
    )

    decoder1_parallel_clock_compensation = Instrument.control(
        get_command=":DECoder1:PARallel:CCOMpensation?",
        set_command=":DECoder1:PARallel:CCOMpensation %e",
        docs="""Control the clock compensation for parallel decoder 1 in seconds (float).

        Valid range is -100 ms to 100 ms.""",
        validator=truncated_range,
        values=(-0.1, 0.1),
    )

    decoder1_parallel_plot = Instrument.control(
        get_command=":DECoder1:PARallel:PLOT?",
        set_command=":DECoder1:PARallel:PLOT %d",
        docs="""Control if analog plot is enabled for parallel decoder 1 (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    # --- Decoder 2 (common settings only, protocol-specific follow same pattern) ---

    decoder2_mode = Instrument.control(
        get_command=":DECoder2:MODE?",
        set_command=":DECoder2:MODE %s",
        docs="""Control the protocol decoder 2 mode.

        Valid values are:
        - PAR: Parallel
        - UART: UART/RS232
        - SPI: SPI
        - IIC: I2C""",
        validator=strict_discrete_set,
        values=["PAR", "UART", "SPI", "IIC"],
    )

    decoder2_display = Instrument.control(
        get_command=":DECoder2:DISPlay?",
        set_command=":DECoder2:DISPlay %d",
        docs="""Control if decoder 2 results are displayed (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    decoder2_format = Instrument.control(
        get_command=":DECoder2:FORMat?",
        set_command=":DECoder2:FORMat %s",
        docs="""Control the display format for decoder 2.

        Valid values are HEX, ASC, DEC, BIN, LINE.""",
        validator=strict_discrete_set,
        values=["HEX", "ASC", "DEC", "BIN", "LINE"],
    )

    decoder2_position = Instrument.control(
        get_command=":DECoder2:POSition?",
        set_command=":DECoder2:POSition %d",
        docs="""Control the vertical position of decoder 2 display (int).

        Valid range is 50 to 350.""",
        validator=truncated_range,
        values=(50, 350),
    )

    decoder2_threshold_auto = Instrument.control(
        get_command=":DECoder2:THREshold:AUTO?",
        set_command=":DECoder2:THREshold:AUTO %d",
        docs="""Control if automatic threshold detection is enabled for decoder 2 (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    # ########################################################################
    # Event Table Subsystem (for decoder output)
    # ########################################################################

    etable1_display = Instrument.control(
        get_command=":ETABle1:DISP?",
        set_command=":ETABle1:DISP %d",
        docs="""Control if event table 1 is displayed (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    etable1_format = Instrument.control(
        get_command=":ETABle1:FORMat?",
        set_command=":ETABle1:FORMat %s",
        docs="""Control the event table 1 data format.

        Valid values are:
        - HEX: Hexadecimal
        - ASC: ASCII
        - DEC: Decimal""",
        validator=strict_discrete_set,
        values=["HEX", "ASC", "DEC"],
    )

    etable1_view = Instrument.control(
        get_command=":ETABle1:VIEW?",
        set_command=":ETABle1:VIEW %s",
        docs="""Control the event table 1 view mode.

        Valid values are:
        - PACK: Package view
        - DET: Detail view
        - PAYL: Payload view""",
        validator=strict_discrete_set,
        values=["PACK", "DET", "PAYL"],
    )

    etable1_sort = Instrument.control(
        get_command=":ETABle1:SORT?",
        set_command=":ETABle1:SORT %s",
        docs="""Control the event table 1 sort order.

        Valid values are:
        - ASC: Ascending
        - DESC: Descending""",
        validator=strict_discrete_set,
        values=["ASC", "DESC"],
    )

    etable1_row = Instrument.control(
        get_command=":ETABle1:ROW?",
        set_command=":ETABle1:ROW %d",
        docs="""Control the current row in event table 1 (int).""",
        validator=truncated_range,
        values=(1, 10000),
    )

    etable1_data = Instrument.measurement(
        get_command=":ETABle1:DATA?",
        docs="""Get the event table 1 data as a TMC binary data block.""",
    )

    etable2_display = Instrument.control(
        get_command=":ETABle2:DISP?",
        set_command=":ETABle2:DISP %d",
        docs="""Control if event table 2 is displayed (bool).""",
        validator=strict_discrete_set,
        values={True: 1, False: 0},
        map_values=True,
    )

    etable2_format = Instrument.control(
        get_command=":ETABle2:FORMat?",
        set_command=":ETABle2:FORMat %s",
        docs="""Control the event table 2 data format.

        Valid values are HEX, ASC, DEC.""",
        validator=strict_discrete_set,
        values=["HEX", "ASC", "DEC"],
    )

    etable2_view = Instrument.control(
        get_command=":ETABle2:VIEW?",
        set_command=":ETABle2:VIEW %s",
        docs="""Control the event table 2 view mode.

        Valid values are PACK, DET, PAYL.""",
        validator=strict_discrete_set,
        values=["PACK", "DET", "PAYL"],
    )

    etable2_sort = Instrument.control(
        get_command=":ETABle2:SORT?",
        set_command=":ETABle2:SORT %s",
        docs="""Control the event table 2 sort order.

        Valid values are ASC, DESC.""",
        validator=strict_discrete_set,
        values=["ASC", "DESC"],
    )
