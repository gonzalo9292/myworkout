import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { firstValueFrom } from 'rxjs';

type AnalyticsByDay = { date: string; volume: number };
type AnalyticsByExercise = { exercise: string; volume: number };

type AnalyticsSummaryResponse = {
  from: string;
  to: string;
  summary: {
    workouts: number;
    exercises: number;
    sets: number;
    total_reps: number;
    total_volume: number;
  };
  by_day: AnalyticsByDay[];
  by_exercise: AnalyticsByExercise[];
};

type AnalyticsRebuildLatestResponse = {
  range: { from: string; to: string; days: number };
  result: AnalyticsSummaryResponse;
};

@Component({
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './analytics-page.html',
  styleUrls: ['./analytics-page.css'],
})
export class AnalyticsPage {
  private http = inject(HttpClient);

  // RUTAS RELATIVAS (proxy): /analytics/...
  private readonly baseUrl = '/analytics';

  loading = signal(false);
  rebuilding = signal(false);

  error = signal<string | null>(null);
  rebuildError = signal<string | null>(null);

  // PDF state
  generatingPdf = signal(false);
  pdfError = signal<string | null>(null);

  fromDate = signal<string>(this.todayMinusDaysYmd(6));
  toDate = signal<string>(this.todayYmd());
  days = signal<number>(90);

  result = signal<AnalyticsSummaryResponse | null>(null);

  // --- Chart sizing (SVG)
  chartW = 720;
  chartH = 240;
  pad = 22;
  gridYs = [50, 90, 130, 170, 210];

  // --- computed helpers
  maxDayVolume = computed(() => {
    const rows = this.result()?.by_day ?? [];
    let m = 0;
    for (const r of rows) m = Math.max(m, Number(r.volume || 0));
    return m;
  });

  maxExerciseVolume = computed(() => {
    const rows = this.result()?.by_exercise ?? [];
    let m = 0;
    for (const r of rows) m = Math.max(m, Number(r.volume || 0));
    return m;
  });

  topExercises = computed(() => {
    const rows = this.result()?.by_exercise ?? [];
    return rows.slice(0, 5);
  });

  // -----------------------------
  // Guardar “evento de informe generado” en Mongo (vía gateway)
  // POST /analytics/reports  -> gateway -> analytics-api -> Mongo
  // -----------------------------
  private saveReportToMongo(filename: string, r: AnalyticsSummaryResponse) {
    const payload = {
      from: (this.fromDate() || r.from || '').trim(),
      to: (this.toDate() || r.to || '').trim(),
      filename,
      result: r, // enviamos toda la analítica calculada en ese momento
      source: 'frontend-angular',
      trigger: 'user_click',
    };

    return this.http.post(`${this.baseUrl}/reports`, payload);
  }

  // --- actions
  loadSummary() {
    const from = (this.fromDate() || '').trim();
    const to = (this.toDate() || '').trim();

    this.error.set(null);
    this.rebuildError.set(null);
    this.pdfError.set(null);

    if (!this.isYmd(from) || !this.isYmd(to)) {
      this.error.set('Las fechas deben estar en formato YYYY-MM-DD.');
      return;
    }

    this.loading.set(true);

    const params = new HttpParams().set('from', from).set('to', to);

    this.http
      .get<AnalyticsSummaryResponse>(`${this.baseUrl}/summary`, { params })
      .subscribe({
        next: (data) => {
          this.result.set(data ?? null);
          this.loading.set(false);
        },
        error: (e) => {
          this.loading.set(false);
          this.error.set(
            e?.error?.detail || e?.message || 'Error cargando el resumen.'
          );
        },
      });
  }

  rebuildLatest() {
    const d = this.days();

    this.error.set(null);
    this.rebuildError.set(null);
    this.pdfError.set(null);

    if (!Number.isFinite(d) || d < 1) {
      this.rebuildError.set('El campo "días" debe ser un número >= 1.');
      return;
    }

    this.rebuilding.set(true);

    const params = new HttpParams().set('days', String(d));

    this.http
      .post<AnalyticsRebuildLatestResponse>(
        `${this.baseUrl}/rebuild/latest`,
        null,
        { params }
      )
      .subscribe({
        next: (data) => {
          this.result.set(data?.result ?? null);
          if (data?.range?.from) this.fromDate.set(data.range.from);
          if (data?.range?.to) this.toDate.set(data.range.to);
          this.rebuilding.set(false);
        },
        error: (e) => {
          this.rebuilding.set(false);
          this.rebuildError.set(
            e?.error?.detail || e?.message || 'Error ejecutando rebuild.'
          );
        },
      });
  }

  quick7() {
    this.days.set(7);
    this.rebuildLatest();
  }
  quick30() {
    this.days.set(30);
    this.rebuildLatest();
  }
  quick90() {
    this.days.set(90);
    this.rebuildLatest();
  }

  // --- PDF: captura visual del informe actual (sin backend)
  async generatePdfFromView() {
    const r = this.result();
    if (!r) return;

    this.pdfError.set(null);
    this.generatingPdf.set(true);

    // Nombre en español, claro y sin timestamp
    const from = (this.fromDate() || r.from || '').trim();
    const to = (this.toDate() || r.to || '').trim();
    const fromTxt = this.formatYmdToDmyForFile(from);
    const toTxt = this.formatYmdToDmyForFile(to);
    const filename = `Progreso_del_${fromTxt}_al_${toTxt}.pdf`;

    try {
      // 1) Intentar guardar en Mongo (vía gateway). Si falla, seguimos con el PDF.
      try {
        await firstValueFrom(this.saveReportToMongo(filename, r));
      } catch (e: any) {
        // No bloqueamos el PDF, pero dejamos aviso en UI
        this.pdfError.set(
          e?.error?.detail ||
            e?.message ||
            'No se pudo registrar el informe en MongoDB, pero el PDF se generará igualmente.'
        );
      }

      // 2) Generar PDF (lo que ya tenías)
      const el = document.getElementById('report-root');
      if (!el) {
        this.pdfError.set('No se ha encontrado el contenedor del informe.');
        return;
      }

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: document.documentElement.clientWidth,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      const imgProps = pdf.getImageProperties(imgData);
      const imgWidth = usableWidth;
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

      if (imgHeight <= usableHeight) {
        pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
      } else {
        let remainingHeight = imgHeight;

        pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
        remainingHeight -= usableHeight;

        while (remainingHeight > 0) {
          pdf.addPage();
          const offsetY = margin - (imgHeight - remainingHeight);
          pdf.addImage(imgData, 'PNG', margin, offsetY, imgWidth, imgHeight);
          remainingHeight -= usableHeight;
        }
      }

      pdf.save(filename);
    } catch (e: any) {
      this.pdfError.set(e?.message || 'Error generando el PDF.');
    } finally {
      this.generatingPdf.set(false);
    }
  }

  // --- line chart builders
  dayPoints(): Array<{ x: number; y: number; label: string }> {
    const rows = this.result()?.by_day ?? [];
    const n = rows.length;
    const max = this.maxDayVolume();

    const w = this.chartW;
    const h = this.chartH;

    const left = this.pad;
    const right = w - this.pad;
    const top = this.pad;
    const bottom = h - 26;

    if (n === 0) return [];

    const dx = n === 1 ? 0 : (right - left) / (n - 1);

    return rows.map((r, i) => {
      const x = left + dx * i;
      const v = Number(r.volume || 0);
      const t = max <= 0 ? 0 : v / max;
      const y = bottom - t * (bottom - top);

      return {
        x,
        y,
        label: `${this.formatDate(r.date)} — ${this.formatNum(v)}`,
      };
    });
  }

  linePath(): string {
    const pts = this.dayPoints();
    if (pts.length === 0) return '';
    if (pts.length === 1)
      return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 0.01} ${pts[0].y}`;
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  areaPath(): string {
    const pts = this.dayPoints();
    if (pts.length === 0) return '';

    const bottom = this.chartH - 26;

    const line = this.linePath();
    const first = pts[0];
    const last = pts[pts.length - 1];

    return `${line} L ${last.x} ${bottom} L ${first.x} ${bottom} Z`;
  }

  // --- utils
  toInt(v: string): number {
    const n = Number(String(v).trim());
    if (!Number.isFinite(n)) return 90;
    return Math.max(1, Math.min(3650, Math.trunc(n)));
  }

  pct(value: number, max: number): number {
    const v = Number(value || 0);
    const m = Number(max || 0);
    if (m <= 0) return 0;
    return Math.max(0, Math.min(100, (v / m) * 100));
  }

  formatNum(x: number): string {
    const n = Number(x ?? 0);
    if (!Number.isFinite(n)) return '0';
    const rounded = Math.round(n * 100) / 100;
    return String(rounded);
  }

  formatDate(ymdOrIso: string): string {
    if (!ymdOrIso) return ymdOrIso;
    const ymd = ymdOrIso.includes('T') ? ymdOrIso.split('T')[0] : ymdOrIso;
    if (!this.isYmd(ymd)) return ymdOrIso;
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  }

  formatShort(ymdOrIso: string): string {
    if (!ymdOrIso) return '';
    const ymd = ymdOrIso.includes('T') ? ymdOrIso.split('T')[0] : ymdOrIso;
    if (!this.isYmd(ymd)) return ymdOrIso;
    const [, m, d] = ymd.split('-');
    return `${d}/${m}`;
  }

  isYmd(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  }

  todayYmd(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  todayMinusDaysYmd(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - (Number(days) || 0));
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // YYYY-MM-DD -> DD-MM-YYYY para nombre del archivo
  private formatYmdToDmyForFile(ymd: string): string {
    if (!this.isYmd(ymd)) return ymd;
    const [y, m, d] = ymd.split('-');
    return `${d}-${m}-${y}`;
  }
}
