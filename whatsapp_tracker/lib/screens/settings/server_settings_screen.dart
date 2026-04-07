import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';

class ServerSettingsScreen extends StatefulWidget {
  const ServerSettingsScreen({super.key});

  @override
  State<ServerSettingsScreen> createState() => _ServerSettingsScreenState();
}

class _ServerSettingsScreenState extends State<ServerSettingsScreen> {
  final _ctrl = TextEditingController();
  bool _checking = false;
  bool? _healthy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final url = await ApiService.getBaseUrl();
    setState(() => _ctrl.text = url);
  }

  Future<void> _save() async {
    final url = _ctrl.text.trim();
    if (url.isEmpty) return;
    await ApiService.setBaseUrl(url);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Server URL saved'),
        backgroundColor: AppTheme.primaryGreen,
      ),
    );
  }

  Future<void> _check() async {
    final url = _ctrl.text.trim();
    if (url.isEmpty) return;
    await ApiService.setBaseUrl(url);
    setState(() {
      _checking = true;
      _healthy = null;
    });
    final ok = await ApiService.checkHealth();
    setState(() {
      _checking = false;
      _healthy = ok;
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Server Settings'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Backend Server URL',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Enter the URL of your backend server (e.g. http://192.168.1.10:3000). For Android emulator use http://10.0.2.2:3000.',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Colors.grey),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _ctrl,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Server URL',
                prefixIcon: Icon(Icons.dns_outlined),
                hintText: 'http://10.0.2.2:3000',
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    icon: _checking
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child:
                                CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.wifi_find),
                    label: const Text('Test Connection'),
                    onPressed: _checking ? null : _check,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.save_outlined),
                    label: const Text('Save'),
                    onPressed: _save,
                  ),
                ),
              ],
            ),
            if (_healthy != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _healthy!
                      ? Colors.green.shade50
                      : Colors.red.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                      color: _healthy!
                          ? Colors.green.shade300
                          : Colors.red.shade300),
                ),
                child: Row(
                  children: [
                    Icon(
                      _healthy! ? Icons.check_circle : Icons.error,
                      color: _healthy! ? Colors.green : Colors.red,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _healthy!
                          ? 'Connected! Server is reachable.'
                          : 'Connection failed. Check URL and make sure server is running.',
                      style: TextStyle(
                          color: _healthy! ? Colors.green : Colors.red,
                          fontSize: 13),
                    ),
                  ],
                ),
              ),
            ],
            const Spacer(),
            const Divider(),
            const SizedBox(height: 8),
            Text(
              'Setup Instructions',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const _StepTile(
                step: '1', text: 'Install Node.js on your server machine'),
            const _StepTile(
                step: '2',
                text: 'Run: npm install in the backend/ folder'),
            const _StepTile(
                step: '3',
                text:
                    'Run: npx prisma migrate dev --name init'),
            const _StepTile(
                step: '4', text: 'Run: npm start to launch the server'),
            const _StepTile(
                step: '5',
                text:
                    'Enter your server\'s IP address and port above'),
          ],
        ),
      ),
    );
  }
}

class _StepTile extends StatelessWidget {
  final String step;
  final String text;
  const _StepTile({required this.step, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            decoration: const BoxDecoration(
              color: AppTheme.tealGreen,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(step,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.bold)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
              child: Text(text,
                  style: Theme.of(context).textTheme.bodySmall)),
        ],
      ),
    );
  }
}
