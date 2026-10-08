import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core_api.dart';
import 'rights.dart';
import 'wallet_providers.dart';

class RightsState {
  const RightsState({this.requests = const [], this.isLoading = true, this.error = false});

  final List<RightsRequestRow> requests;
  final bool isLoading;
  final bool error;

  RightsState copyWith({List<RightsRequestRow>? requests, bool? isLoading, bool? error}) {
    return RightsState(
      requests: requests ?? this.requests,
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
    );
  }
}

class RightsController extends AutoDisposeNotifier<RightsState> {
  @override
  RightsState build() {
    _fetch();
    return const RightsState();
  }

  Future<void> _fetch() async {
    final principal = ref.watch(walletAddressProvider).value;
    if (principal == null) return;
    
    try {
      final rows = await ref.read(coreApiProvider).getRights(principal);
      state = state.copyWith(requests: rows, isLoading: false, error: false);
    } catch (_) {
      state = state.copyWith(isLoading: false, error: true);
    }
  }

  Future<void> refresh() => _fetch();

  Future<void> submit(String fiduciary, String type, String note) async {
    final principal = ref.read(walletAddressProvider).value;
    if (principal == null) return;
    
    await ref.read(coreApiProvider).submitRightsRequest(principal, fiduciary, type, note);
    await _fetch();
  }
}

final rightsProvider = AutoDisposeNotifierProvider<RightsController, RightsState>(RightsController.new);
