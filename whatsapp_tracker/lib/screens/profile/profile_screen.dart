import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/contact.dart';
import '../../providers/auth_provider.dart';
import '../../providers/contacts_provider.dart';
import '../../services/notification_service.dart';
import '../../theme/app_theme.dart';
import '../auth/login_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _notificationsEnabled = true;
  Set<int> _mutedContacts = {};
  bool _loadingPrefs = true;

  @override
  void initState() {
    super.initState();
    _loadPrefs();
  }

  Future<void> _loadPrefs() async {
    final notifService = NotificationService();
    final enabled = await notifService.isEnabled();
    final muted = await notifService.getMutedContactIds();
    if (!mounted) return;
    setState(() {
      _notificationsEnabled = enabled;
      _mutedContacts = muted;
      _loadingPrefs = false;
    });
  }

  Future<void> _toggleNotifications(bool value) async {
    setState(() => _notificationsEnabled = value);
    await NotificationService().setEnabled(value);
  }

  Future<void> _toggleContactMute(int contactId, bool muted) async {
    setState(() {
      if (muted) {
        _mutedContacts.add(contactId);
      } else {
        _mutedContacts.remove(contactId);
      }
    });
    await NotificationService().setContactMuted(contactId, muted);
  }

  Future<void> _logout() async {
    final auth = context.read<AuthProvider>();
    final contacts = context.read<ContactsProvider>();
    await auth.logout();
    await contacts.stopLiveUpdates();
    contacts.clear();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final contacts = context.watch<ContactsProvider>();
    final user = auth.user;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile & Settings')),
      body: _loadingPrefs
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _buildProfileHeader(user?.name ?? 'User', user?.email ?? ''),
                const SizedBox(height: 24),
                _buildSectionHeader('Notifications'),
                const SizedBox(height: 8),
                _buildNotificationToggle(),
                if (_notificationsEnabled && contacts.contacts.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _buildSectionHeader('Per-Contact Notifications'),
                  const SizedBox(height: 4),
                  Text(
                    'Mute specific contacts to stop getting alerts for them',
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: Colors.grey),
                  ),
                  const SizedBox(height: 8),
                  ...contacts.contacts
                      .map((c) => _buildContactNotifTile(c)),
                ],
                const SizedBox(height: 24),
                _buildSectionHeader('Account'),
                const SizedBox(height: 8),
                _buildInfoTile(
                    Icons.email_outlined, 'Email', user?.email ?? ''),
                _buildInfoTile(
                    Icons.badge_outlined, 'Name', user?.name ?? ''),
                _buildInfoTile(Icons.people_outline, 'Tracked Contacts',
                    '${contacts.contacts.length}'),
                const SizedBox(height: 24),
                _buildSectionHeader('App Info'),
                const SizedBox(height: 8),
                _buildInfoTile(
                    Icons.info_outline, 'Version', '1.0.0'),
                _buildInfoTile(
                    Icons.code, 'Build', '1'),
                const SizedBox(height: 32),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: const BorderSide(color: Colors.red),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    icon: const Icon(Icons.logout),
                    label: const Text('Sign Out'),
                    onPressed: _logout,
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
    );
  }

  Widget _buildProfileHeader(String name, String email) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            CircleAvatar(
              radius: 32,
              backgroundColor: AppTheme.tealGreen,
              child: Text(
                name.isNotEmpty ? name[0].toUpperCase() : 'U',
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    email,
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(color: Colors.grey),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Text(
      title,
      style: Theme.of(context).textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.bold,
            color: AppTheme.tealGreen,
          ),
    );
  }

  Widget _buildNotificationToggle() {
    return Card(
      child: SwitchListTile(
        title: const Text('Push Notifications'),
        subtitle:
            const Text('Get alerts when contacts come online or go offline'),
        secondary: Icon(
          _notificationsEnabled
              ? Icons.notifications_active
              : Icons.notifications_off_outlined,
          color:
              _notificationsEnabled ? AppTheme.primaryGreen : Colors.grey,
        ),
        value: _notificationsEnabled,
        activeColor: AppTheme.primaryGreen,
        onChanged: _toggleNotifications,
      ),
    );
  }

  Widget _buildContactNotifTile(Contact contact) {
    final isMuted = _mutedContacts.contains(contact.id);
    return Card(
      margin: const EdgeInsets.only(bottom: 4),
      child: ListTile(
        leading: CircleAvatar(
          radius: 18,
          backgroundColor: AppTheme.tealGreen.withValues(alpha: 0.15),
          child: Text(
            contact.name.isNotEmpty
                ? contact.name[0].toUpperCase()
                : '?',
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              color: AppTheme.tealGreen,
              fontSize: 14,
            ),
          ),
        ),
        title: Text(contact.name, style: const TextStyle(fontSize: 14)),
        subtitle: Text('+${contact.phone}',
            style: const TextStyle(fontSize: 12, color: Colors.grey)),
        trailing: Switch(
          value: !isMuted,
          activeColor: AppTheme.primaryGreen,
          onChanged: (enabled) =>
              _toggleContactMute(contact.id, !enabled),
        ),
      ),
    );
  }

  Widget _buildInfoTile(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 20, color: Colors.grey),
          const SizedBox(width: 12),
          Text(label,
              style: const TextStyle(fontSize: 14, color: Colors.grey)),
          const Spacer(),
          Text(value,
              style: const TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
