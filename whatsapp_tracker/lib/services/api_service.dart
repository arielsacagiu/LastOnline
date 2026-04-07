import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';
import '../models/user.dart';
import '../models/contact.dart';
import '../models/last_seen_log.dart';

class ApiService {
  static const String _baseUrlKey = 'server_url';
  static const _secureStorage = FlutterSecureStorage();
  static const String _tokenKey = 'auth_token';

  static Future<String> getBaseUrl() async {
    if (!AppConfig.allowServerOverride) {
      return AppConfig.defaultBaseUrl;
    }
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_baseUrlKey) ?? AppConfig.defaultBaseUrl;
  }

  static Future<void> setBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_baseUrlKey, url);
  }

  static Future<String?> getToken() async {
    return await _secureStorage.read(key: _tokenKey);
  }

  static Future<void> saveToken(String token) async {
    await _secureStorage.write(key: _tokenKey, value: token);
  }

  static Future<void> clearToken() async {
    await _secureStorage.delete(key: _tokenKey);
  }

  static Future<Map<String, String>> _headers() async {
    final token = await getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Future<Map<String, dynamic>> register(
      String name, String email, String password) async {
    final base = await getBaseUrl();
    final res = await http.post(
      Uri.parse('$base/api/auth/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'name': name, 'email': email, 'password': password}),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode == 201) {
      await saveToken(data['token']);
      return {'success': true, 'user': User.fromJson(data['user'])};
    }
    return {'success': false, 'error': data['error'] ?? 'Registration failed'};
  }

  static Future<Map<String, dynamic>> login(
      String email, String password) async {
    final base = await getBaseUrl();
    final res = await http.post(
      Uri.parse('$base/api/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode == 200) {
      await saveToken(data['token']);
      return {'success': true, 'user': User.fromJson(data['user'])};
    }
    return {'success': false, 'error': data['error'] ?? 'Login failed'};
  }

  static Future<User?> getMe() async {
    final base = await getBaseUrl();
    final headers = await _headers();
    try {
      final res = await http.get(
        Uri.parse('$base/api/auth/me'),
        headers: headers,
      );
      if (res.statusCode == 200) {
        return User.fromJson(jsonDecode(res.body));
      }
    } catch (_) {}
    return null;
  }

  static Future<List<Contact>> getContacts() async {
    final base = await getBaseUrl();
    final headers = await _headers();
    final res = await http.get(
      Uri.parse('$base/api/contacts'),
      headers: headers,
    );
    if (res.statusCode == 200) {
      final List<dynamic> data = jsonDecode(res.body);
      return data.map((c) => Contact.fromJson(c)).toList();
    }
    throw Exception('Failed to load contacts');
  }

  static Future<Contact> addContact(String name, String phone, {String? circle}) async {
    final base = await getBaseUrl();
    final headers = await _headers();
    final body = <String, dynamic>{'name': name, 'phone': phone};
    if (circle != null) body['circle'] = circle;
    final res = await http.post(
      Uri.parse('$base/api/contacts'),
      headers: headers,
      body: jsonEncode(body),
    );
    if (res.statusCode == 201) {
      return Contact.fromJson(jsonDecode(res.body));
    }
    final data = jsonDecode(res.body);
    throw Exception(data['error'] ?? 'Failed to add contact');
  }

  static Future<void> deleteContact(int id) async {
    final base = await getBaseUrl();
    final headers = await _headers();
    final res = await http.delete(
      Uri.parse('$base/api/contacts/$id'),
      headers: headers,
    );
    if (res.statusCode != 200) {
      throw Exception('Failed to delete contact');
    }
  }

  static Future<List<LastSeenLog>> getLogs(int contactId, {int page = 1, int limit = 100}) async {
    final base = await getBaseUrl();
    final headers = await _headers();
    final res = await http.get(
      Uri.parse('$base/api/logs/$contactId?page=$page&limit=$limit'),
      headers: headers,
    );
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      // Support both old (array) and new (paginated) response format
      if (data is List) {
        return data.map((l) => LastSeenLog.fromJson(l)).toList();
      }
      final List<dynamic> logs = data['logs'] ?? [];
      return logs.map((l) => LastSeenLog.fromJson(l)).toList();
    }
    throw Exception('Failed to load logs');
  }

  static Future<bool> checkHealth() async {
    final base = await getBaseUrl();
    try {
      final res = await http
          .get(Uri.parse('$base/api/health'))
          .timeout(const Duration(seconds: 5));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
