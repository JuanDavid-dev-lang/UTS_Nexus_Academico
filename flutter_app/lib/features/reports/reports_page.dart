import 'package:flutter/material.dart';
import '../../core/services/api_client.dart';

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key});

  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  String summary = '';
  String period = '2026-1';

  Future<void> _download(String path) async {
    await ApiClient.instance.get(path);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Generado en backend')));
    }
  }

  Future<void> loadSummary() async {
    final response = await ApiClient.instance.get('/reports/summary');
    setState(() => summary = response.data.toString());
  }

  Future<void> exportPdf() async {
    await _download('/reports/pdf/combined?period=$period');
  }

  Future<void> exportExcel() async {
    await _download('/reports/excel/combined?period=$period');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reportes')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DropdownButton<String>(
              value: period,
              items: const [
                DropdownMenuItem(value: '2026-1', child: Text('2026-1')),
                DropdownMenuItem(value: '2026-2', child: Text('2026-2')),
              ],
              onChanged: (value) => setState(() => period = value ?? '2026-1'),
            ),
            Wrap(
              spacing: 12,
              children: [
                FilledButton(onPressed: loadSummary, child: const Text('Ver resumen')),
                FilledButton(onPressed: exportPdf, child: const Text('Exportar PDF')),
                FilledButton(onPressed: exportExcel, child: const Text('Exportar Excel')),
              ],
            ),
            const SizedBox(height: 16),
            Expanded(
              child: SingleChildScrollView(
                child: Text(summary.isEmpty ? 'Sin datos todavía.' : summary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
