import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../models/contact.dart';
import '../../../providers/contacts_provider.dart';
import '../../../theme/app_theme.dart';
import '../../contact_detail/contact_detail_screen.dart';

class ContactCard extends StatelessWidget {
  final Contact contact;
  const ContactCard({super.key, required this.contact});

  Color _statusColor(String? status) {
    switch (status) {
      case 'online':
        return AppTheme.primaryGreen;
      case 'offline':
        return Colors.grey;
      case 'hidden':
        return Colors.orange;
      case 'qr_required':
        return Colors.blueGrey;
      case 'error':
        return Colors.red;
      default:
        return Colors.grey.shade400;
    }
  }

  IconData _statusIcon(String? status) {
    switch (status) {
      case 'online':
        return Icons.circle;
      case 'offline':
        return Icons.circle_outlined;
      case 'hidden':
        return Icons.visibility_off_outlined;
      case 'qr_required':
        return Icons.qr_code_2_outlined;
      case 'error':
        return Icons.error_outline;
      default:
        return Icons.help_outline;
    }
  }

  String _statusLabel(String? status, String? lastSeen) {
    switch (status) {
      case 'online':
        return 'Online now';
      case 'offline':
        return lastSeen ?? 'Last seen unknown';
      case 'hidden':
        return 'Last seen hidden';
      case 'qr_required':
        return 'QR scan required on server';
      case 'error':
        return 'Check error';
      default:
        return 'Not checked yet';
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = contact.status;
    final statusColor = _statusColor(status);
    final statusIcon = _statusIcon(status);
    final statusLabel = _statusLabel(status, contact.lastSeenValue);
    final lastActivityAt = contact.lastActivityAt;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ContactDetailScreen(contact: contact),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Stack(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: AppTheme.tealGreen.withValues(alpha: 0.15),
                    child: Text(
                      contact.name.substring(0, 1).toUpperCase(),
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.tealGreen,
                      ),
                    ),
                  ),
                  if (status == 'online')
                    Positioned(
                      bottom: 0,
                      right: 0,
                      child: Container(
                        width: 14,
                        height: 14,
                        decoration: BoxDecoration(
                          color: AppTheme.primaryGreen,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color:
                                Theme.of(context).cardTheme.color ??
                                Theme.of(context).colorScheme.surface,
                            width: 2,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      contact.name,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '+${contact.phone}',
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(color: Colors.grey),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(statusIcon, size: 12, color: statusColor),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            statusLabel,
                            style: TextStyle(
                              fontSize: 12,
                              color: statusColor,
                              fontWeight: FontWeight.w500,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (lastActivityAt != null)
                    Text(
                      DateFormat('HH:mm').format(lastActivityAt.toLocal()),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey,
                        fontSize: 11,
                      ),
                    ),
                  const SizedBox(height: 8),
                  IconButton(
                    icon: const Icon(
                      Icons.delete_outline,
                      size: 20,
                      color: Colors.redAccent,
                    ),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: () => _confirmDelete(context),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _confirmDelete(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove Contact'),
        content: Text(
          'Stop tracking ${contact.name}? All logs will be deleted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () async {
              Navigator.of(ctx).pop();
              await context.read<ContactsProvider>().deleteContact(contact.id);
            },
            child: const Text('Remove'),
          ),
        ],
      ),
    );
  }
}
