import 'package:flutter/foundation.dart';

class AppConfig {
  AppConfig._();

  /// Set with:
  /// flutter build ... --dart-define=PRODUCTION_BASE_URL=https://api.your-domain.com
  static const String productionUrl = String.fromEnvironment(
    'PRODUCTION_BASE_URL',
    defaultValue: '',
  );

  /// Default URL used when running in debug / profile mode (Android emulator).
  static const String debugUrl = 'http://10.0.2.2:3000';

  /// Optional release/beta escape hatch:
  /// --dart-define=ALLOW_SERVER_OVERRIDE=true
  static const bool allowOverrideInRelease = bool.fromEnvironment(
    'ALLOW_SERVER_OVERRIDE',
    defaultValue: false,
  );

  static bool get hasProductionUrl => productionUrl.trim().isNotEmpty;

  /// Returns the compile-time default URL based on the current build mode.
  /// In release builds this is [productionUrl]; otherwise [debugUrl].
  static String get defaultBaseUrl {
    if (kReleaseMode) {
      if (!hasProductionUrl) {
        throw StateError(
          'Release build is missing PRODUCTION_BASE_URL. '
          'Build with --dart-define=PRODUCTION_BASE_URL=https://api.your-domain.com',
        );
      }
      return productionUrl;
    }

    return debugUrl;
  }

  /// Whether the user should be allowed to manually override the server URL.
  /// Enabled in non-release builds, or explicitly via dart-define for beta builds.
  static bool get allowServerOverride => !kReleaseMode || allowOverrideInRelease;
}
