import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_config.dart';
import '../../models/contact.dart';
import '../../providers/auth_provider.dart';
import '../../providers/contacts_provider.dart';
import '../../services/monitor_service.dart';
import '../../services/notification_service.dart';
import '../../theme/app_theme.dart';
import '../analytics/weekly_reports_screen.dart';
import '../auth/login_screen.dart';
import '../monitor/monitor_health_screen.dart';
import '../profile/profile_screen.dart';
import '../settings/server_settings_screen.dart';
import 'widgets/contact_card.dart';
import 'add_contact_sheet.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String _searchQuery = '';
  String _statusFilter = 'all';
  bool _showSearch = false;
  final _searchCtrl = TextEditingController();
  final MonitorService _monitorService = MonitorService();
  WhatsAppSessionStatus? _sessionStatus;
  bool _sessionLoading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initializeContacts();
      _loadSessionStatus();
    });
  }

  Future<void> _initializeContacts() async {
    final contacts = context.read<ContactsProvider>();
    await contacts.loadContacts();
    contacts.startLiveUpdates();
    await NotificationService().requestPermission();
  }

  Future<void> _loadSessionStatus({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _sessionLoading = true;
      });
    }

    try {
      final sessionStatus = await _monitorService.getSessionStatus();
      if (!mounted) return;
      setState(() {
        _sessionStatus = sessionStatus;
        _sessionLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sessionStatus = null;
        _sessionLoading = false;
      });
    }
  }

  Future<void> _refreshHome() async {
    final contacts = context.read<ContactsProvider>();
    await contacts.loadContacts();
    await _loadSessionStatus(silent: true);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
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

  void _showAddContact() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => const AddContactSheet(),
    );
  }

  List<Contact> _filteredContacts(List<Contact> all) {
    var result = all;
    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      result = result
          .where((c) =>
              c.name.toLowerCase().contains(q) || c.phone.contains(q))
          .toList();
    }
    if (_statusFilter != 'all') {
      result = result.where((c) => c.status == _statusFilter).toList();
    }
    return result;
  }

  int _onlineCount(List<Contact> all) =>
      all.where((c) => c.status == 'online').length;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final contacts = context.watch<ContactsProvider>();

    return Scaffold(
      appBar: _showSearch
          ? AppBar(
              leading: IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => setState(() {
                  _showSearch = false;
                  _searchQuery = '';
                  _searchCtrl.clear();
                }),
              ),
              title: TextField(
                controller: _searchCtrl,
                autofocus: true,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  hintText: 'Search contacts...',
                  hintStyle: TextStyle(color: Colors.white70),
                  border: InputBorder.none,
                ),
                onChanged: (v) => setState(() => _searchQuery = v),
              ),
              actions: [
                if (_searchQuery.isNotEmpty)
                  IconButton(
                    icon: const Icon(Icons.clear),
                    onPressed: () => setState(() {
                      _searchQuery = '';
                      _searchCtrl.clear();
                    }),
                  ),
              ],
            )
          : AppBar(
              title: const Text('WA Last Seen Tracker'),
              actions: [
                IconButton(
                  icon: const Icon(Icons.search),
                  tooltip: 'Search',
                  onPressed: () => setState(() => _showSearch = true),
                ),
                IconButton(
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh',
                  onPressed: _refreshHome,
                ),
                PopupMenuButton<String>(
                  onSelected: (item) {
                    switch (item) {
                      case 'profile':
                        Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => const ProfileScreen()));
                        break;
                      case 'analytics':
                        Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => const WeeklyReportsScreen()));
                        break;
                      case 'monitor':
                        Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => const MonitorHealthScreen()));
                        break;
                      case 'settings':
                        if (AppConfig.allowServerOverride) {
                          Navigator.of(context).push(MaterialPageRoute(
                              builder: (_) => const ServerSettingsScreen()));
                        }
                        break;
                      case 'logout':
                        _logout();
                        break;
                    }
                  },
                  itemBuilder: (_) => [
                    PopupMenuItem(
                      value: 'profile',
                      child: Row(
                        children: const [
                          Icon(Icons.person_outline, size: 18),
                          SizedBox(width: 8),
                          Text('Profile & Settings'),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'analytics',
                      child: Row(
                        children: const [
                          Icon(Icons.bar_chart_outlined, size: 18),
                          SizedBox(width: 8),
                          Text('Weekly Reports'),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'monitor',
                      child: Row(
                        children: const [
                          Icon(Icons.monitor_heart_outlined, size: 18),
                          SizedBox(width: 8),
                          Text('Monitor Health'),
                        ],
                      ),
                    ),
                    if (AppConfig.allowServerOverride)
                      PopupMenuItem(
                        value: 'settings',
                        child: Row(
                          children: const [
                            Icon(Icons.dns_outlined, size: 18),
                            SizedBox(width: 8),
                            Text('Server Settings'),
                          ],
                        ),
                      ),
                    const PopupMenuDivider(),
                    PopupMenuItem(
                      value: 'logout',
                      child: Row(
                        children: const [
                          Icon(Icons.logout, size: 18, color: Colors.red),
                          SizedBox(width: 8),
                          Text('Logout',
                              style: TextStyle(color: Colors.red)),
                        ],
                      ),
                    ),
                  ],
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: CircleAvatar(
                      radius: 16,
                      backgroundColor: AppTheme.primaryGreen,
                      child: Text(
                        auth.user?.name.substring(0, 1).toUpperCase() ?? 'U',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
      body: RefreshIndicator(
        onRefresh: _refreshHome,
        child: _buildBody(contacts),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showAddContact,
        icon: const Icon(Icons.add),
        label: const Text('Add Contact'),
      ),
    );
  }

  Widget _buildStatusFilterChips(List<Contact> allContacts) {
    final onlineCount = _onlineCount(allContacts);
    final filters = <Map<String, dynamic>>[
      {'label': 'All (${allContacts.length})', 'value': 'all'},
      {'label': 'Online ($onlineCount)', 'value': 'online'},
      {'label': 'Offline', 'value': 'offline'},
      {'label': 'Hidden', 'value': 'hidden'},
    ];
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: filters.map((f) {
          final selected = _statusFilter == f['value'];
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: Text(f['label'] as String),
              selected: selected,
              selectedColor: AppTheme.primaryGreen,
              labelStyle: TextStyle(
                color: selected ? Colors.white : null,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
              onSelected: (_) =>
                  setState(() => _statusFilter = f['value'] as String),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildBody(ContactsProvider contacts) {
    final sessionBanner = _buildSessionBanner();

    if (contacts.loading && contacts.contacts.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (contacts.error != null && contacts.contacts.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            const Text(
              'Could not connect to server',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              contacts.error!,
              style: const TextStyle(color: Colors.grey, fontSize: 12),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => contacts.loadContacts(),
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (contacts.contacts.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (sessionBanner != null) ...[
            sessionBanner,
            const SizedBox(height: 24),
          ],
          const SizedBox(height: 40),
          Icon(Icons.people_outline, size: 80, color: Colors.grey.shade400),
          const SizedBox(height: 16),
          Text(
            'No contacts tracked yet',
            textAlign: TextAlign.center,
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(color: Colors.grey.shade600),
          ),
          const SizedBox(height: 8),
          Text(
            'Tap + to add your first contact',
            textAlign: TextAlign.center,
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: Colors.grey),
          ),
        ],
      );
    }

    final filtered = _filteredContacts(contacts.contacts);

    return Column(
      children: [
        const SizedBox(height: 8),
        if (sessionBanner != null) ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: sessionBanner,
          ),
          const SizedBox(height: 8),
        ],
        _buildStatusFilterChips(contacts.contacts),
        const SizedBox(height: 4),
        Expanded(
          child: filtered.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.search_off,
                          size: 56, color: Colors.grey.shade400),
                      const SizedBox(height: 12),
                      Text('No matching contacts',
                          style: TextStyle(color: Colors.grey.shade600)),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) =>
                      ContactCard(contact: filtered[i]),
                ),
        ),
      ],
    );
  }

  Widget? _buildSessionBanner() {
    if (_sessionLoading && _sessionStatus == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: const [
              SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              SizedBox(width: 12),
              Expanded(
                child: Text('Checking WhatsApp session...'),
              ),
            ],
          ),
        ),
      );
    }

    if (_sessionStatus == null) {
      return null;
    }

    late final Color color;
    late final IconData icon;
    switch (_sessionStatus!.status) {
      case 'connected':
        color = Colors.green;
        icon = Icons.link;
        break;
      case 'login_required':
        color = Colors.orange;
        icon = Icons.login;
        break;
      case 'loading':
        color = Colors.blue;
        icon = Icons.sync;
        break;
      case 'profile_in_use':
        color = Colors.orange;
        icon = Icons.open_in_browser;
        break;
      case 'error':
        color = Colors.red;
        icon = Icons.error_outline;
        break;
      default:
        color = Colors.grey;
        icon = Icons.help_outline;
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'WhatsApp Session: ${_sessionStatus!.statusDisplay}',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: color,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _sessionStatus!.message,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.grey.shade700,
                        ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
