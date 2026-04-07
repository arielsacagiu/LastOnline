import 'package:flutter/material.dart';
import '../models/user.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  User? _user;
  bool _loading = false;
  String? _error;

  User? get user => _user;
  bool get loading => _loading;
  String? get error => _error;
  bool get isLoggedIn => _user != null;

  Future<void> tryAutoLogin() async {
    final token = await ApiService.getToken();
    if (token == null) return;
    final user = await ApiService.getMe();
    if (user != null) {
      _user = user;
      notifyListeners();
    }
  }

  Future<bool> login(String email, String password) async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final result = await ApiService.login(email, password);
      _loading = false;
      if (result['success']) {
        _user = result['user'] as User;
        notifyListeners();
        return true;
      }
      _error = result['error'] as String;
      notifyListeners();
      return false;
    } catch (e) {
      _loading = false;
      _error = 'Connection failed. Check your server address.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> register(String name, String email, String password) async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final result = await ApiService.register(name, email, password);
      _loading = false;
      if (result['success']) {
        _user = result['user'] as User;
        notifyListeners();
        return true;
      }
      _error = result['error'] as String;
      notifyListeners();
      return false;
    } catch (e) {
      _loading = false;
      _error = 'Connection failed. Check your server address.';
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await ApiService.clearToken();
    _user = null;
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
