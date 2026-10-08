/// Shortens a hash or address for display: `0x4f2a…9be1` (AGENTS.md). Copy the full value on tap.
String shortHex(String value) =>
    value.length <= 12 ? value : '${value.substring(0, 6)}…${value.substring(value.length - 4)}';
