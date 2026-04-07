# Android Release Build Instructions

## 1. Generate Keystore
```bash
keytool -genkey -v -keystore ~/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

## 2. Configure Signing
Copy `android/key.properties.example` to `android/key.properties` (this file is git-ignored) and update with your keystore details:

```properties
storeFile=/path/to/your/upload-keystore.jks
storePassword=your-keystore-password
keyAlias=upload
keyPassword=your-key-password
```

## 3. Update Production URL
Before building release, update `lib/config/app_config.dart`:
```dart
static const String productionUrl = 'https://your-production-backend.com';
```

## 4. Build Release APK/AAB
```bash
# For Play Store (recommended)
flutter build appbundle --release

# For direct APK distribution
flutter build apk --release
```

## 5. Upload to Play Store
- Use the generated `build/app/outputs/bundle/release/app-release.aab` file
- Upload to Google Play Console

## Current Configuration
- **App ID**: `com.whatsapptracker.whatsapp_tracker`
- **Version**: `1.0.0` (versionCode: 1)
- **Label**: `WA Last Seen Tracker`
- **Signing**: Release keystore with minification enabled
- **ProGuard**: Configured for Flutter, secure storage, and networking libraries
