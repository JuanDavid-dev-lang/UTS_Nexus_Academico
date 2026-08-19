import 'package:flutter/material.dart';

enum RubriEmotion { neutral, happy, sad, offline }

const _sprites = <RubriEmotion, String>{
  RubriEmotion.neutral: 'assets/rubri/neutral.png',
  RubriEmotion.happy: 'assets/rubri/happy.png',
  RubriEmotion.sad: 'assets/rubri/sad.png',
  RubriEmotion.offline: 'assets/rubri/offline.png',
};

const _labels = <RubriEmotion, String>{
  RubriEmotion.neutral: 'Rubri neutral',
  RubriEmotion.happy: 'Rubri feliz',
  RubriEmotion.sad: 'Rubri triste',
  RubriEmotion.offline: 'Rubri sin conexión',
};

class Rubri extends StatefulWidget {
  final RubriEmotion emotion;
  final double size;
  final bool animated;

  const Rubri({
    super.key,
    this.emotion = RubriEmotion.neutral,
    this.size = 96,
    this.animated = true,
  });

  @override
  State<Rubri> createState() => _RubriState();
}

class _RubriState extends State<Rubri> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _float;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3600),
    );
    _float = Tween(begin: 0.0, end: -3.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
    if (widget.animated) _controller.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant Rubri oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncAnimation();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncAnimation();
  }

  void _syncAnimation() {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    if (widget.animated && !reduceMotion) {
      if (!_controller.isAnimating) _controller.repeat(reverse: true);
    } else {
      _controller.stop();
      _controller.value = 0;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    final image = Semantics(
      image: true,
      label: _labels[widget.emotion],
      child: Image.asset(
        _sprites[widget.emotion]!,
        width: widget.size,
        height: widget.size,
        fit: BoxFit.contain,
        excludeFromSemantics: true,
      ),
    );
    if (!widget.animated || reduceMotion) return image;
    return AnimatedBuilder(
      animation: _float,
      child: image,
      builder: (_, child) =>
          Transform.translate(offset: Offset(0, _float.value), child: child),
    );
  }
}
