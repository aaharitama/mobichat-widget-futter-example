import 'package:flutter/material.dart';

import 'mobichat_settings.dart';

class MobichatSettingsPage extends StatefulWidget {
  const MobichatSettingsPage({super.key, required this.host});

  final String host;

  @override
  State<MobichatSettingsPage> createState() => _MobichatSettingsPageState();
}

class _MetadataRow {
  _MetadataRow([String key = '', String value = ''])
      : key = TextEditingController(text: key),
        value = TextEditingController(text: value);

  final TextEditingController key;
  final TextEditingController value;

  void dispose() {
    key.dispose();
    value.dispose();
  }
}

class _MobichatSettingsPageState extends State<MobichatSettingsPage> {
  final _formKey = GlobalKey<FormState>();
  final _appId = TextEditingController();
  final _userId = TextEditingController();
  final _sourceId = TextEditingController();
  final _visitorId = TextEditingController();
  final _fcmToken = TextEditingController();
  final _identityHash = TextEditingController();
  final _metadata = <_MetadataRow>[];
  bool _loading = true;
  bool _submitting = false;
  String? _status;
  bool _statusIsError = false;

  @override
  void initState() {
    super.initState();
    MobichatSettings.load().then((settings) {
      if (!mounted) return;
      setState(() {
        _fill(settings);
        _loading = false;
      });
    });
  }

  @override
  void dispose() {
    for (final controller in [
      _appId,
      _userId,
      _sourceId,
      _visitorId,
      _fcmToken,
      _identityHash
    ]) {
      controller.dispose();
    }
    for (final row in _metadata) {
      row.dispose();
    }
    super.dispose();
  }

  void _fill(MobichatSettings settings) {
    _appId.text = settings.appId;
    _userId.text = settings.userId;
    _sourceId.text = settings.sourceId;
    _visitorId.text = settings.visitorId;
    _fcmToken.text = settings.fcmToken;
    _identityHash.text = settings.identityHash;
    for (final row in _metadata) {
      row.dispose();
    }
    _metadata
      ..clear()
      ..addAll(settings.metadata.entries
          .map((entry) => _MetadataRow(entry.key, entry.value)));
  }

  MobichatSettings _currentSettings() => MobichatSettings(
        appId: _appId.text.trim(),
        userId: _userId.text.trim(),
        sourceId: _sourceId.text.trim(),
        visitorId: _visitorId.text.trim(),
        fcmToken: _fcmToken.text.trim(),
        identityHash: _identityHash.text.trim(),
        metadata: {
          for (final row in _metadata)
            if (row.key.text.trim().isNotEmpty)
              row.key.text.trim(): row.value.text.trim(),
        },
      );

  void _showStatus(String message, {bool error = false}) => setState(() {
        _status = message;
        _statusIsError = error;
      });

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    await _currentSettings().save();
    if (mounted) _showStatus('Saved. The chat opens with these values.');
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;
    var settings = _currentSettings();
    // Mobichat keys the contact by visitor ID. Generating one here and saving it makes the chat
    // reuse it, so the conversation joins the contact created by this submit.
    if (settings.visitorId.isEmpty) {
      settings = settings.copyWith(visitorId: generateVisitorId());
      _visitorId.text = settings.visitorId;
    }
    setState(() {
      _submitting = true;
      _status = null;
    });
    try {
      await settings.save();
      final result = await submitMobichatSettings(widget.host, settings);
      if (!mounted) return;
      if (result.saved) {
        _showStatus('Submitted for user ${result.userId ?? settings.userId} '
            '(${result.verified ? 'verified' : 'unverified'} identity).');
      } else {
        _showStatus(
            'Mobichat did not store the identity: '
            '${result.reason ?? (result.rateLimited ? 'rate_limited' : 'anonymous')}.',
            error: true);
      }
    } catch (error) {
      if (mounted) _showStatus('Submit failed: $error', error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _resetToDefaults() async {
    await MobichatSettings.clearSaved();
    setState(() {
      _fill(MobichatSettings.defaults);
      _status = null;
    });
  }

  String? _required(String? value) =>
      value == null || value.trim().isEmpty ? 'Required' : null;

  Widget _field(TextEditingController controller, String label,
          {String? helper,
          String? Function(String?)? validator,
          Widget? suffix}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: controller,
          validator: validator,
          decoration: InputDecoration(
            labelText: label,
            helperText: helper,
            helperMaxLines: 2,
            border: const OutlineInputBorder(),
            isDense: true,
            suffixIcon: suffix,
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('mobichatSettings'),
        actions: [
          IconButton(
            tooltip: 'Reset to example values',
            icon: const Icon(Icons.settings_backup_restore),
            onPressed: _loading ? null : _resetToDefaults,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _field(_appId, 'app_id', validator: _required),
                  _field(_userId, 'user_id', validator: _required),
                  _field(_sourceId, 'source_id',
                      helper: 'Where the user comes from, e.g. a phone number'),
                  _field(
                    _visitorId,
                    'visitor_id',
                    helper: 'Empty keeps the ID saved on this device; '
                        'submit generates one',
                    suffix: IconButton(
                      tooltip: 'Generate a new visitor ID',
                      icon: const Icon(Icons.autorenew),
                      onPressed: () => _visitorId.text = generateVisitorId(),
                    ),
                  ),
                  _field(_fcmToken, 'fcm_token',
                      helper: "Empty sends this device's Firebase token"),
                  _field(_identityHash, 'identity_hash',
                      helper:
                          'HMAC of user_id from your server. Empty is unverified'),
                  Row(
                    children: [
                      Expanded(
                          child: Text('metadata (screening info)',
                              style: theme.textTheme.titleSmall)),
                      TextButton.icon(
                        icon: const Icon(Icons.add),
                        label: const Text('Add'),
                        // The widget keeps at most 10 metadata keys.
                        onPressed: _metadata.length >= 10
                            ? null
                            : () =>
                                setState(() => _metadata.add(_MetadataRow())),
                      ),
                    ],
                  ),
                  Text(
                    'Keys match screening fields by id, type or title (e.g. name, '
                    'company, membership). The chat skips the screening form when '
                    'every required field has a value.',
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 12),
                  for (final row in _metadata)
                    Row(
                      key: ObjectKey(row),
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: _field(row.key, 'key')),
                        const SizedBox(width: 8),
                        Expanded(flex: 2, child: _field(row.value, 'value')),
                        IconButton(
                          tooltip: 'Remove',
                          icon: const Icon(Icons.remove_circle_outline),
                          onPressed: () => setState(() {
                            _metadata.remove(row);
                            row.dispose();
                          }),
                        ),
                      ],
                    ),
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    icon: _submitting
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.cloud_upload_outlined),
                    label: const Text('Submit to Mobichat'),
                    onPressed: _submitting ? null : _submit,
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: _submitting ? null : _save,
                    child: const Text('Save only'),
                  ),
                  if (_status != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _status!,
                      style: theme.textTheme.bodyMedium?.copyWith(
                          color: _statusIsError
                              ? theme.colorScheme.error
                              : theme.colorScheme.primary),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Text('Host: ${widget.host}',
                      style: theme.textTheme.bodySmall),
                ],
              ),
            ),
    );
  }
}
