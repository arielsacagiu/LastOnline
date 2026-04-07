import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/contacts_provider.dart';

class AddContactSheet extends StatefulWidget {
  const AddContactSheet({super.key});

  @override
  State<AddContactSheet> createState() => _AddContactSheetState();
}

class _AddContactSheetState extends State<AddContactSheet> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  String? _selectedCircle;
  bool _loading = false;

  static const _circles = ['family', 'friends', 'work', 'other'];

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  String _circleLabel(String c) => '${c[0].toUpperCase()}${c.substring(1)}';

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    final ok = await context
        .read<ContactsProvider>()
        .addContact(_nameCtrl.text.trim(), _phoneCtrl.text.trim(),
            circle: _selectedCircle);
    if (!mounted) return;
    setState(() => _loading = false);
    if (ok) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Contact added successfully'),
          backgroundColor: Color(0xFF25D366),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              context.read<ContactsProvider>().error ?? 'Failed to add contact'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.person_add, color: Color(0xFF25D366)),
                const SizedBox(width: 12),
                Text('Add Contact to Track',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.bold)),
                const Spacer(),
                IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop()),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Enter the contact\'s name and WhatsApp phone number (with country code)',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Colors.grey),
            ),
            const SizedBox(height: 20),
            TextFormField(
              controller: _nameCtrl,
              decoration: const InputDecoration(
                labelText: 'Contact Name',
                prefixIcon: Icon(Icons.person_outline),
                hintText: 'e.g. John Doe',
              ),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Name is required' : null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Phone Number',
                prefixIcon: Icon(Icons.phone_outlined),
                hintText: 'e.g. 1234567890 (with country code)',
              ),
              validator: (v) {
                if (v == null || v.trim().isEmpty) return 'Phone is required';
                final cleaned = v.replaceAll(RegExp(r'[^0-9+]'), '');
                if (cleaned.length < 7) return 'Enter a valid phone number';
                return null;
              },
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: _selectedCircle,
              decoration: const InputDecoration(
                labelText: 'Circle (optional)',
                prefixIcon: Icon(Icons.group_outlined),
              ),
              items: _circles
                  .map((c) => DropdownMenuItem(
                        value: c,
                        child: Text(_circleLabel(c)),
                      ))
                  .toList(),
              onChanged: (v) => setState(() => _selectedCircle = v),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : const Text('Start Tracking'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
