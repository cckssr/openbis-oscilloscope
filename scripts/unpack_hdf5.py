"""
#!/usr/bin/env python3
unpack_hdf5.py — Extract all waveform channels from an oscilloscope HDF5 bundle to CSV.

Usage:
    python unpack_hdf5.py <export.h5> [--output-dir <dir>]

Requires: h5py  (pip install h5py)
Standard library: csv, pathlib, argparse

This script is bundled with HDF5 exports from the OpenBIS Oscilloscope service.
"""

import argparse
import csv
import pathlib
import sys


def unpack(h5_path: pathlib.Path, output_dir: pathlib.Path) -> None:
    """Extract all waveform groups from an HDF5 export file to individual CSV files.

    Each top-level group in the HDF5 file is expected to contain ``time_s`` and
    ``voltage_V`` datasets. Groups missing either dataset are skipped with a
    warning. Scalar metadata attributes on each group are written as ``# key: value``
    comment lines at the top of the corresponding CSV.

    Args:
        h5_path: Path to the input ``.h5`` file to read.
        output_dir: Directory where the extracted CSV files will be written.
            Created if it does not exist.

    Raises:
        SystemExit: If ``h5py`` is not installed (exits with code 1).
    """
    try:
        import h5py  # pylint: disable=import-outside-toplevel
    except ImportError:
        print(
            "ERROR: h5py is required. Install it with:  pip install h5py",
            file=sys.stderr,
        )
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    with h5py.File(h5_path, "r") as h5f:
        session_id = h5f.attrs.get("session_id", "unknown")
        device_id = h5f.attrs.get("device_id", "unknown")
        print(f"Session : {session_id}")
        print(f"Device  : {device_id}")
        print(f"Output  : {output_dir}")
        print()

        groups = list(h5f.keys())
        if not groups:
            print("No acquisition groups found in HDF5 file.")
            return

        for group_name in groups:
            grp = h5f[group_name]

            if "time_s" not in grp or "voltage_V" not in grp:
                print(f"  [skip] {group_name}: missing time_s or voltage_V datasets")
                continue

            time_data = grp["time_s"][:]
            volt_data = grp["voltage_V"][:]

            out_file = output_dir / f"{group_name}.csv"

            # Collect metadata attributes for header comments
            attrs = dict(grp.attrs)

            with out_file.open("w", newline="") as f:
                for key, val in attrs.items():
                    f.write(f"# {key}: {val}\n")
                writer = csv.writer(f)
                writer.writerow(["time_s", "voltage_V"])
                for t, v in zip(time_data, volt_data):
                    writer.writerow([f"{t:.6e}", f"{v:.6e}"])

            print(f"  Wrote {len(time_data):,} samples → {out_file.name}")


def main() -> None:
    """Parse command-line arguments and run the HDF5 unpacker.

    Resolves the input file path, determines the output directory (defaults to
    an ``unpacked/`` subfolder next to the input file), and delegates to
    :func:`unpack`.

    Raises:
        SystemExit: If the input file does not exist (exits with code 1).
    """
    parser = argparse.ArgumentParser(
        description="Unpack oscilloscope HDF5 export to CSV files."
    )
    parser.add_argument("h5_file", type=pathlib.Path, help="Input .h5 file")
    parser.add_argument(
        "--output-dir",
        type=pathlib.Path,
        default=None,
        help="Output directory (default: same as input file, subfolder 'unpacked')",
    )
    args = parser.parse_args()

    h5_path = args.h5_file.resolve()
    if not h5_path.exists():
        print(f"ERROR: File not found: {h5_path}", file=sys.stderr)
        sys.exit(1)

    output_dir = args.output_dir or (h5_path.parent / "unpacked")
    unpack(h5_path, output_dir)
    print("\nDone.")


if __name__ == "__main__":
    main()
