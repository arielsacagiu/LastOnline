import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../models/live_update_event.dart';
import 'api_service.dart';

class LiveUpdatesService {
  final StreamController<LiveUpdateEvent> _eventsController =
      StreamController<LiveUpdateEvent>.broadcast();

  HttpClient? _client;
  bool _disposed = false;
  bool _running = false;

  Stream<LiveUpdateEvent> get events => _eventsController.stream;

  void start() {
    if (_running || _disposed) {
      return;
    }

    _running = true;
    unawaited(_run());
  }

  Future<void> _run() async {
    while (!_disposed) {
      HttpClient? activeClient;

      try {
        final token = await ApiService.getToken();
        if (token == null) {
          break;
        }

        final baseUrl = await ApiService.getBaseUrl();
        final uri = Uri.parse('$baseUrl/api/stream');

        activeClient = HttpClient()
          ..idleTimeout = const Duration(seconds: 20)
          ..connectionTimeout = const Duration(seconds: 10);
        _client = activeClient;

        final request = await activeClient.getUrl(uri);
        request.headers.set(HttpHeaders.acceptHeader, 'text/event-stream');
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');

        final response = await request.close();
        if (response.statusCode != 200) {
          final body = await response.transform(utf8.decoder).join();
          throw HttpException(
            body.isEmpty
                ? 'Live updates failed with status ${response.statusCode}'
                : body,
            uri: uri,
          );
        }

        await for (final event in _parseEvents(response)) {
          if (_disposed) {
            break;
          }
          _eventsController.add(event);
        }
      } catch (error, stackTrace) {
        if (!_disposed && !_eventsController.isClosed) {
          _eventsController.addError(error, stackTrace);
        }
      } finally {
        activeClient?.close(force: true);
        if (identical(_client, activeClient)) {
          _client = null;
        }
      }

      if (!_disposed) {
        await Future<void>.delayed(const Duration(seconds: 2));
      }
    }

    _running = false;
  }

  Stream<LiveUpdateEvent> _parseEvents(HttpClientResponse response) async* {
    String? eventName;
    final dataLines = <String>[];

    await for (final line
        in response.transform(utf8.decoder).transform(const LineSplitter())) {
      if (line.isEmpty) {
        final event = LiveUpdateEvent.tryParse(eventName, dataLines);
        if (event != null) {
          yield event;
        }
        eventName = null;
        dataLines.clear();
        continue;
      }

      if (line.startsWith(':')) {
        continue;
      }

      if (line.startsWith('event:')) {
        eventName = line.substring(6).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        dataLines.add(line.substring(5).trimLeft());
      }
    }

    final trailingEvent = LiveUpdateEvent.tryParse(eventName, dataLines);
    if (trailingEvent != null) {
      yield trailingEvent;
    }
  }

  Future<void> dispose() async {
    _disposed = true;
    _client?.close(force: true);
    _client = null;

    if (!_eventsController.isClosed) {
      await _eventsController.close();
    }
  }
}
