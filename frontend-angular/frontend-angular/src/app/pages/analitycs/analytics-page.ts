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
  template: `
    <section class="page">
      <header class="header">
        <div>
          <h1>Analíticas</h1>
          <p class="muted">
            Volumen (reps × kg), evolución por día y top ejercicios.
          </p>
        </div>

        <div class="actions">
          <button class="btn ghost" (click)="quick7()">7 días</button>
          <button class="btn ghost" (click)="quick30()">30 días</button>
          <button class="btn ghost" (click)="quick90()">90 días</button>

          <button
            class="btn"
            (click)="generatePdfFromView()"
            [disabled]="!result() || generatingPdf()"
            title="Descarga un PDF con la analítica visible en este momento"
          >
            {{ generatingPdf() ? 'Generando…' : 'Generar informe' }}
          </button>
        </div>
      </header>

      <!-- Controles -->
      <section class="card controls">
        <div class="controls-left">
          <label class="field">
            <span class="label">Desde</span>
            <input
              class="inp"
              type="date"
              [value]="fromDate()"
              (input)="fromDate.set(($any($event.target).value || '').trim())"
            />
          </label>

          <label class="field">
            <span class="label">Hasta</span>
            <input
              class="inp"
              type="date"
              [value]="toDate()"
              (input)="toDate.set(($any($event.target).value || '').trim())"
            />
          </label>

          <button class="btn" (click)="loadSummary()" [disabled]="loading()">
            {{ loading() ? 'Cargando…' : 'Cargar' }}
          </button>
        </div>

        <div class="controls-right">
          <div class="mini">
            <div class="mini-title">Últimos N días</div>
            <div class="mini-row">
              <input
                class="inp small"
                type="number"
                min="1"
                max="3650"
                [value]="days()"
                (input)="days.set(toInt($any($event.target).value || '90'))"
              />
              <button
                class="btn ghost"
                (click)="rebuildLatest()"
                [disabled]="rebuilding()"
              >
                {{ rebuilding() ? 'Rebuild…' : 'Rebuild' }}
              </button>
            </div>
            <div class="muted tiny">
              Rebuild recalcula el rango automáticamente.
            </div>
          </div>
        </div>

        <div *ngIf="error()" class="alert error">{{ error() }}</div>
        <div *ngIf="rebuildError()" class="alert error">
          {{ rebuildError() }}
        </div>
        <div *ngIf="pdfError()" class="alert error">
          {{ pdfError() }}
        </div>
      </section>

      <!-- Estado vacío -->
      <section *ngIf="!result() && !loading()" class="card empty">
        <div class="empty-title">Sin datos cargados</div>
        <div class="muted">
          Pulsa <strong>Cargar</strong> o usa <strong>Rebuild</strong> para ver
          las gráficas.
        </div>
      </section>

      <!-- Resultados (esto es lo que exportamos a PDF) -->
      <section *ngIf="result() as r" class="layout" id="report-root">
        <!-- KPIs -->
        <section class="kpis">
          <div class="kpi">
            <div class="kpi-label">Rango</div>
            <div class="kpi-val">
              {{ formatDate(r.from) }} → {{ formatDate(r.to) }}
            </div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Entrenamientos</div>
            <div class="kpi-num">{{ r.summary.workouts }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Series</div>
            <div class="kpi-num">{{ r.summary.sets }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Reps</div>
            <div class="kpi-num">{{ r.summary.total_reps }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Volumen total</div>
            <div class="kpi-num">{{ formatNum(r.summary.total_volume) }}</div>
          </div>
        </section>

        <!-- Charts -->
        <section class="charts">
          <!-- Line chart: volumen por día -->
          <section class="card chart">
            <div class="card-title-row">
              <div>
                <div class="title">Volumen por día</div>
                <div class="muted tiny" *ngIf="r.by_day.length">
                  {{ r.by_day.length }} día{{
                    r.by_day.length === 1 ? '' : 's'
                  }}
                </div>
              </div>
              <div class="muted tiny" *ngIf="r.by_day.length">
                Máx: {{ formatNum(maxDayVolume()) }}
              </div>
            </div>

            <div *ngIf="r.by_day.length === 0" class="muted">
              No hay datos en este rango.
            </div>

            <div *ngIf="r.by_day.length > 0" class="svg-wrap">
              <svg [attr.viewBox]="'0 0 ' + chartW + ' ' + chartH" class="svg">
                <!-- grid -->
                <g class="grid">
                  <line
                    *ngFor="let y of gridYs"
                    [attr.x1]="pad"
                    [attr.y1]="y"
                    [attr.x2]="chartW - pad"
                    [attr.y2]="y"
                  />
                </g>

                <!-- area -->
                <path class="area" [attr.d]="areaPath()" />

                <!-- line -->
                <path class="line" [attr.d]="linePath()" />

                <!-- points -->
                <g>
                  <circle
                    *ngFor="let p of dayPoints()"
                    class="pt"
                    [attr.cx]="p.x"
                    [attr.cy]="p.y"
                    r="4"
                  >
                    <title>{{ p.label }}</title>
                  </circle>
                </g>

                <!-- x labels (primero y último) -->
                <g class="labels">
                  <text
                    [attr.x]="pad"
                    [attr.y]="chartH - 8"
                    text-anchor="start"
                  >
                    {{ formatShort(r.by_day[0].date) }}
                  </text>
                  <text
                    [attr.x]="chartW - pad"
                    [attr.y]="chartH - 8"
                    text-anchor="end"
                  >
                    {{ formatShort(r.by_day[r.by_day.length - 1].date) }}
                  </text>
                </g>
              </svg>
            </div>
          </section>

          <!-- Bar chart: top ejercicios -->
          <section class="card chart">
            <div class="card-title-row">
              <div>
                <div class="title">Top ejercicios (volumen)</div>
                <div class="muted tiny" *ngIf="topExercises().length">
                  Top {{ topExercises().length }}
                </div>
              </div>
              <div class="muted tiny" *ngIf="topExercises().length">
                Máx: {{ formatNum(maxExerciseVolume()) }}
              </div>
            </div>

            <div *ngIf="topExercises().length === 0" class="muted">
              No hay ranking en este rango.
            </div>

            <div *ngIf="topExercises().length > 0" class="bars">
              <div
                class="barrow"
                *ngFor="let ex of topExercises(); let i = index"
              >
                <div class="barname">
                  <span class="badge">{{ i + 1 }}</span>
                  <span class="name" [title]="ex.exercise">{{
                    ex.exercise
                  }}</span>
                </div>

                <div class="bartrack" [title]="formatNum(ex.volume)">
                  <div
                    class="barfill"
                    [style.width.%]="pct(ex.volume, maxExerciseVolume())"
                  ></div>
                </div>

                <div class="barval">{{ formatNum(ex.volume) }}</div>
              </div>
            </div>
          </section>
        </section>

        <!-- Tabla simple -->
        <section class="card table" *ngIf="r.by_day.length > 0">
          <div class="title">Detalle por día</div>

          <div class="t-head">
            <div>Fecha</div>
            <div class="right">Volumen</div>
          </div>

          <div class="t-row" *ngFor="let d of r.by_day">
            <div>{{ formatDate(d.date) }}</div>
            <div class="right">{{ formatNum(d.volume) }}</div>
          </div>
        </section>
      </section>
    </section>
  `,
  styles: [
    `
      .page {
        max-width: 1100px;
        margin: 0 auto;
        padding: 24px 16px 36px;
      }

      .header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 16px;
      }

      h1 {
        margin: 0 0 6px;
        font-size: 34px;
        letter-spacing: -0.02em;
      }

      .muted {
        opacity: 0.7;
      }
      .tiny {
        font-size: 12px;
      }
      .actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .card {
        border: 1px solid #eee;
        background: #fff;
        border-radius: 18px;
        padding: 14px;
      }

      .controls {
        display: grid;
        grid-template-columns: 1fr 340px;
        gap: 14px;
        align-items: start;
      }

      .controls-left {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 10px;
        align-items: end;
      }

      .controls-right .mini-title {
        font-weight: 950;
        margin-bottom: 6px;
      }
      .mini-row {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .small {
        width: 120px;
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }

      .label {
        font-size: 12px;
        font-weight: 900;
        opacity: 0.7;
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .inp {
        padding: 10px 12px;
        border: 1px solid #e6e6e6;
        border-radius: 12px;
        outline: none;
        background: #fff;
      }

      .btn {
        border: none;
        border-radius: 12px;
        padding: 10px 12px;
        font-weight: 900;
        cursor: pointer;
        background: #111;
        color: #fff;
        white-space: nowrap;
      }
      .btn.ghost {
        background: #f4f4f4;
        color: #111;
      }
      .btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .alert {
        grid-column: 1 / -1;
        margin-top: 10px;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid #eee;
        background: #fafafa;
      }
      .alert.error {
        background: #fff5f5;
        border-color: #ffd6d6;
      }

      .empty {
        margin-top: 14px;
        text-align: center;
        padding: 22px;
      }
      .empty-title {
        font-weight: 950;
        margin-bottom: 6px;
      }

      .layout {
        margin-top: 14px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .kpis {
        display: grid;
        grid-template-columns: 1.4fr repeat(4, 1fr);
        gap: 10px;
      }
      .kpi {
        border: 1px solid #eee;
        background: #fff;
        border-radius: 16px;
        padding: 12px;
      }
      .kpi-label {
        font-size: 12px;
        font-weight: 900;
        opacity: 0.7;
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }
      .kpi-num {
        margin-top: 8px;
        font-size: 24px;
        font-weight: 950;
      }
      .kpi-val {
        margin-top: 8px;
        font-size: 14px;
        font-weight: 900;
      }

      .charts {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }

      .chart .title {
        font-weight: 950;
      }
      .card-title-row {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 12px;
        margin-bottom: 10px;
      }

      .svg-wrap {
        width: 100%;
      }
      .svg {
        width: 100%;
        height: 220px;
        display: block;
      }

      .grid line {
        stroke: #eee;
        stroke-width: 1;
      }

      .area {
        fill: rgba(0, 0, 0, 0.08);
      }
      .line {
        fill: none;
        stroke: #111;
        stroke-width: 3;
      }
      .pt {
        fill: #111;
      }
      .labels text {
        fill: #444;
        font-size: 12px;
      }

      .bars {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .barrow {
        display: grid;
        grid-template-columns: 1fr 220px 70px;
        gap: 10px;
        align-items: center;
      }

      .barname {
        display: flex;
        gap: 10px;
        align-items: center;
        min-width: 0;
      }
      .badge {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: #111;
        color: #fff;
        font-weight: 950;
        font-size: 12px;
        flex: 0 0 auto;
      }
      .name {
        font-weight: 950;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bartrack {
        height: 12px;
        border-radius: 999px;
        background: #f4f4f4;
        border: 1px solid #ededed;
        overflow: hidden;
      }
      .barfill {
        height: 100%;
        background: #111;
        border-radius: 999px;
      }
      .barval {
        text-align: right;
        font-weight: 900;
        font-variant-numeric: tabular-nums;
      }

      .table .title {
        font-weight: 950;
        margin-bottom: 10px;
      }
      .t-head,
      .t-row {
        display: grid;
        grid-template-columns: 1fr 140px;
        gap: 10px;
        padding: 10px 0;
      }
      .t-head {
        border-bottom: 1px solid #eee;
        font-weight: 950;
      }
      .t-row {
        border-bottom: 1px solid #f2f2f2;
      }
      .right {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      @media (max-width: 980px) {
        .header {
          align-items: start;
          flex-direction: column;
        }
        .controls {
          grid-template-columns: 1fr;
        }
        .controls-left {
          grid-template-columns: 1fr;
        }
        .charts {
          grid-template-columns: 1fr;
        }
        .kpis {
          grid-template-columns: 1fr 1fr;
        }
        .barrow {
          grid-template-columns: 1fr;
        }
        .barval {
          text-align: left;
        }
      }
    `,
  ],
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
  // NUEVO: guardar “evento de informe generado” en Mongo (vía gateway)
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

  // NUEVO: formateo YYYY-MM-DD -> DD-MM-YYYY para el nombre del archivo
  private formatYmdToDmyForFile(ymd: string): string {
    if (!this.isYmd(ymd)) return ymd;
    const [y, m, d] = ymd.split('-');
    return `${d}-${m}-${y}`;
  }
}
