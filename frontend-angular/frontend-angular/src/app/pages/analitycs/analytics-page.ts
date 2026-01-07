// src/app/pages/analytics/analytics-page.ts
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { RouterModule } from '@angular/router';

type AnalyticsSummaryResponse = {
  from: string;
  to: string;
  summary: {
    workouts: number;
    exercises: number;
    sets: number;
    total_reps: number;
    total_volume: number; // ya viene redondeado en backend
  };
  by_day: Array<{ date: string; volume: number }>;
  by_exercise: Array<{ exercise: string; volume: number }>;
};

type RebuildLatestResponse = {
  range: { from: string; to: string; days: number };
  result: AnalyticsSummaryResponse;
};

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Analíticas</h1>
        <p class="muted">
          Resúmenes por rango y ranking de ejercicios por volumen.
        </p>
      </header>

      <!-- Acciones -->
      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">Resumen por rango</h2>

          <button class="btn" (click)="loadSummary()" [disabled]="loading()">
            {{ loading() ? 'Cargando…' : 'Cargar resumen' }}
          </button>
        </div>

        <div class="row">
          <label class="field">
            <span class="label">Desde</span>
            <input class="inp" type="date" [(ngModel)]="fromDate" />
          </label>

          <label class="field">
            <span class="label">Hasta</span>
            <input class="inp" type="date" [(ngModel)]="toDate" />
          </label>

          <div class="help muted">
            Consejo: usa rangos completos (por ejemplo un mes) para ver volumen
            y ranking.
          </div>
        </div>

        <section *ngIf="error()" class="state error">
          {{ error() }}
        </section>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">Últimos N días</h2>

          <button
            class="btn ghost"
            (click)="rebuildLatest()"
            [disabled]="loading()"
          >
            {{ loading() ? 'Cargando…' : 'Rebuild latest' }}
          </button>
        </div>

        <div class="row latest">
          <label class="field">
            <span class="label">Días</span>
            <input
              class="inp"
              type="number"
              min="1"
              step="1"
              [(ngModel)]="days"
            />
          </label>

          <div class="help muted">
            Esto llama a <code>/analytics/rebuild/latest</code> y devuelve el
            resumen del rango calculado (from/to).
          </div>
        </div>
      </section>

      <!-- Resultados -->
      <section *ngIf="data()" class="content">
        <section class="panel">
          <h2 class="panel-title">Resumen</h2>

          <div class="kpis" *ngIf="data() as d">
            <div class="kpi">
              <div class="kpi-label">Rango</div>
              <div class="kpi-val">{{ formatRange(d.from, d.to) }}</div>
            </div>

            <div class="kpi">
              <div class="kpi-label">Entrenamientos</div>
              <div class="kpi-val">{{ d.summary.workouts }}</div>
            </div>

            <div class="kpi">
              <div class="kpi-label">Ejercicios</div>
              <div class="kpi-val">{{ d.summary.exercises }}</div>
            </div>

            <div class="kpi">
              <div class="kpi-label">Series</div>
              <div class="kpi-val">{{ d.summary.sets }}</div>
            </div>

            <div class="kpi">
              <div class="kpi-label">Reps totales</div>
              <div class="kpi-val">{{ d.summary.total_reps }}</div>
            </div>

            <div class="kpi">
              <div class="kpi-label">Volumen total</div>
              <div class="kpi-val">
                {{ formatNumber(d.summary.total_volume) }}
              </div>
            </div>
          </div>

          <p class="muted small" *ngIf="data() as d">
            Volumen = reps × kg. (Si kg es nulo, se toma como 0.)
          </p>
        </section>

        <section class="panel">
          <h2 class="panel-title">Volumen por día</h2>

          <div *ngIf="(data()?.by_day?.length ?? 0) === 0" class="empty muted">
            No hay datos en ese rango.
          </div>

          <table class="tbl" *ngIf="(data()?.by_day?.length ?? 0) > 0">
            <thead>
              <tr>
                <th>Fecha</th>
                <th class="right">Volumen</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of data()!.by_day">
                <td>{{ formatDate(r.date) }}</td>
                <td class="right">{{ formatNumber(r.volume) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h2 class="panel-title">Ranking por ejercicio</h2>

          <div
            *ngIf="(data()?.by_exercise?.length ?? 0) === 0"
            class="empty muted"
          >
            No hay datos en ese rango.
          </div>

          <div class="rank" *ngIf="(data()?.by_exercise?.length ?? 0) > 0">
            <article
              class="rank-item"
              *ngFor="let r of data()!.by_exercise; let i = index"
            >
              <div class="rank-left">
                <div class="badge">{{ i + 1 }}</div>
                <div class="ex-name">{{ r.exercise }}</div>
              </div>

              <div class="rank-right">
                <div class="vol">{{ formatNumber(r.volume) }}</div>
                <div class="muted small">volumen</div>
              </div>
            </article>
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
        padding: 24px 16px;
      }

      .page-header h1 {
        margin: 0 0 6px;
        font-size: 34px;
      }
      .muted {
        opacity: 0.7;
      }
      .small {
        font-size: 12.5px;
      }

      .panel {
        margin-top: 16px;
        border: 1px solid #eee;
        background: #fff;
        border-radius: 16px;
        padding: 14px;
      }

      .panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }

      .panel-title {
        margin: 0;
        font-size: 15px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        opacity: 0.75;
      }

      .row {
        display: grid;
        grid-template-columns: 240px 240px 1fr;
        gap: 10px;
        align-items: end;
      }
      .row.latest {
        grid-template-columns: 240px 1fr;
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
        border-radius: 10px;
        outline: none;
        min-width: 0;
        background: #fff;
      }

      .help {
        font-size: 13px;
        line-height: 1.35;
      }
      code {
        background: #f4f4f4;
        border: 1px solid #eee;
        padding: 2px 6px;
        border-radius: 8px;
        font-size: 12px;
      }

      .btn {
        border: none;
        border-radius: 12px;
        padding: 10px 12px;
        font-weight: 900;
        cursor: pointer;
        background: #111;
        color: #fff;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
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

      .state {
        margin-top: 10px;
        padding: 14px;
        border-radius: 12px;
        background: #fafafa;
        border: 1px solid #eee;
      }
      .state.error {
        background: #fff5f5;
        border-color: #ffd6d6;
      }

      .content {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      .kpis {
        display: grid;
        grid-template-columns: 1.4fr repeat(5, 1fr);
        gap: 10px;
      }
      .kpi {
        border: 1px solid #eee;
        border-radius: 14px;
        padding: 12px;
        background: #fafafa;
      }
      .kpi-label {
        font-size: 12px;
        font-weight: 900;
        opacity: 0.7;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        margin-bottom: 6px;
      }
      .kpi-val {
        font-weight: 950;
        font-size: 18px;
        line-height: 1.1;
      }

      .tbl {
        width: 100%;
        border-collapse: collapse;
        overflow: hidden;
        border-radius: 14px;
        border: 1px solid #eee;
      }
      .tbl th,
      .tbl td {
        padding: 10px 12px;
        border-bottom: 1px solid #eee;
        font-size: 13px;
      }
      .tbl th {
        background: #fafafa;
        text-align: left;
        font-weight: 950;
      }
      .tbl tr:last-child td {
        border-bottom: none;
      }
      .right {
        text-align: right;
      }

      .rank {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .rank-item {
        border: 1px solid #eee;
        border-radius: 14px;
        padding: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .rank-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .badge {
        width: 34px;
        height: 34px;
        border-radius: 12px;
        background: #111;
        color: #fff;
        font-weight: 950;
        display: grid;
        place-items: center;
        flex: 0 0 auto;
      }
      .ex-name {
        font-weight: 950;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .rank-right {
        text-align: right;
        flex: 0 0 auto;
      }
      .vol {
        font-weight: 950;
        font-size: 16px;
      }

      .empty {
        padding: 8px 0;
      }

      @media (max-width: 980px) {
        .row {
          grid-template-columns: 1fr;
        }
        .kpis {
          grid-template-columns: 1fr 1fr;
        }
      }
    `,
  ],
})
export class AnalyticsPage {
  private http = inject(HttpClient);

  // IMPORTANTE: endpoints relativos (evita hardcodear localhost:8000)
  private readonly baseUrl = '/analytics';

  loading = signal(false);
  error = signal<string | null>(null);

  data = signal<AnalyticsSummaryResponse | null>(null);

  fromDate = '';
  toDate = '';
  days = 90;

  constructor() {
    // Por defecto: semana actual (Lunes -> hoy) o algo simple: hoy-6 a hoy
    const today = new Date();
    const to = this.toYmd(today);
    const from = this.toYmd(this.addDays(today, -6));

    this.fromDate = from;
    this.toDate = to;
  }

  loadSummary() {
    const from = (this.fromDate ?? '').trim();
    const to = (this.toDate ?? '').trim();

    if (!from || !to) {
      this.error.set('Debes indicar desde/hasta.');
      return;
    }
    if (from > to) {
      this.error.set('El rango es inválido: "desde" es posterior a "hasta".');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const params = new HttpParams().set('from', from).set('to', to);

    this.http
      .get<AnalyticsSummaryResponse>(`${this.baseUrl}/summary`, { params })
      .subscribe({
        next: (res) => {
          this.data.set(res ?? null);
          this.loading.set(false);
        },
        error: (e) => {
          this.loading.set(false);
          // CORS suele caer aquí con status 0 / Unknown Error
          if (e?.status === 0) {
            this.error.set(
              'No se pudo llamar al Analytics API (probable CORS o proxy no configurado).'
            );
          } else {
            this.error.set(e?.error?.detail ?? 'Error cargando el resumen.');
          }
        },
      });
  }

  rebuildLatest() {
    const d = Number(this.days);
    if (!Number.isFinite(d) || d < 1) {
      this.error.set('Días inválidos.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const params = new HttpParams().set('days', String(d));

    this.http
      .post<RebuildLatestResponse>(`${this.baseUrl}/rebuild/latest`, null, {
        params,
      })
      .subscribe({
        next: (res) => {
          const result = res?.result ?? null;
          this.data.set(result);

          // opcional: sincronizamos los inputs del rango con lo calculado
          if (result?.from) this.fromDate = result.from;
          if (result?.to) this.toDate = result.to;

          this.loading.set(false);
        },
        error: (e) => {
          this.loading.set(false);
          if (e?.status === 0) {
            this.error.set(
              'No se pudo llamar al Analytics API (probable CORS o proxy no configurado).'
            );
          } else {
            this.error.set(
              e?.error?.detail ?? 'Error ejecutando rebuild latest.'
            );
          }
        },
      });
  }

  formatDate(ymd: string): string {
    if (!ymd) return ymd;
    const onlyDate = ymd.includes('T') ? ymd.split('T')[0] : ymd;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(onlyDate)) return ymd;
    const [y, m, d] = onlyDate.split('-');
    return `${d}/${m}/${y}`;
  }

  formatRange(from: string, to: string): string {
    return `${this.formatDate(from)} → ${this.formatDate(to)}`;
  }

  formatNumber(n: number): string {
    const num = Number(n ?? 0);
    return new Intl.NumberFormat('es-ES', {
      maximumFractionDigits: 2,
    }).format(num);
  }

  private addDays(d: Date, days: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
  }

  private toYmd(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
