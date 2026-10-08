import 'package:flutter/material.dart';

void main() => runApp(const SammatiApp());

/// Placeholder shell; screens, theme and routing land with the wallet lane.
class SammatiApp extends StatelessWidget {
  const SammatiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(backgroundColor: Color(0xFFF6F7FB)),
    );
  }
}