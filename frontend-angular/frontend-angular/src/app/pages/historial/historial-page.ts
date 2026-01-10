import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

type ByDay = { date: string; volume: number };
type ByExercise = { exercise: string; volume: number };

type ReportDoc = {
  id: string;
  generated_at: string;
  range: { from?: string; to?: string };
  pdf: { filename?: string; generated?: boolean };
  result: {
    summary?: {
      workouts: number;
      exercises?: number;
      sets: number;
      total_reps: number;
      total_volume: number;
    };
    by_day: ByDay[];
    by_exercise: ByExercise[];
  };
};

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="page">
      <header class="header">
        <div>
          <h1>Historial</h1>
          <p class="muted">Informes generados y guardados en MongoDB.</p>
        </div>

        <div class="actions">
          <button class="btn" (click)="loadHistory()" [disabled]="loading()">
            {{ loading() ? 'Cargando…' : 'Cargar historial' }}
          </button>

          <button
            class="btn ghost"
            (click)="clearDetail()"
            [disabled]="!detail()"
          >
            Cerrar detalle
          </button>
        </div>
      </header>

      <section class="grid">
        <!-- LISTADO (solo: fecha + PDF + acciones) -->
        <section class="card">
          <div class="card-title">Listado</div>

          <div class="empty" *ngIf="!loading() && items().length === 0">
            No hay informes todavía.
          </div>

          <div class="list" *ngIf="items().length > 0">
            <article class="row" *ngFor="let it of items()">
              <div class="row-left">
                <div class="when">{{ formatIso(it.generated_at) }}</div>

                <div class="pdfline">
                  <span class="pdf-label">PDF</span>
                  <span class="pdf-name" [title]="it.pdf?.filename || ''">
                    {{ it.pdf?.filename || '—' }}
                  </span>
                </div>
              </div>

              <div class="row-right">
                <button class="btn ghost small" (click)="loadDetail(it.id)">
                  Ver detalle
                </button>

                <button class="btn danger small" (click)="deleteReport(it)">
                  Eliminar
                </button>
              </div>
            </article>
          </div>
        </section>

        <!-- DETALLE -->
        <section class="card detail" *ngIf="detail() as d; else emptyDetail">
          <div class="card-title">Detalle del informe</div>

          <section class="hero">
            <div class="hero-left">
              <div class="hero-label">Rango</div>
              <div class="hero-range">{{ formatRange(d.range) }}</div>

              <div class="hero-sub">
                <span class="hero-sub-label">Generado</span>
                <span class="hero-sub-val">{{
                  formatIso(d.generated_at)
                }}</span>
              </div>

              <div class="hero-sub">
                <span class="hero-sub-label">PDF</span>
                <span class="hero-sub-val mono" [title]="d.pdf?.filename || ''">
                  {{ d.pdf?.filename || '—' }}
                </span>
              </div>
            </div>

            <div class="hero-right" *ngIf="d.result?.summary as s">
              <div class="kpis">
                <div class="kpi">
                  <div class="kpi-label">Entrenos</div>
                  <div class="kpi-num">{{ s.workouts }}</div>
                </div>
                <div class="kpi">
                  <div class="kpi-label">Series</div>
                  <div class="kpi-num">{{ s.sets }}</div>
                </div>
                <div class="kpi">
                  <div class="kpi-label">Reps</div>
                  <div class="kpi-num">{{ s.total_reps }}</div>
                </div>
                <div class="kpi">
                  <div class="kpi-label">Volumen</div>
                  <div class="kpi-num">{{ s.total_volume }}</div>
                </div>
              </div>
            </div>
          </section>

          <section class="detail-grid">
            <!-- Volumen por día -->
            <section class="subcard">
              <div class="sub-title">Volumen por día</div>

              <div
                class="muted tiny"
                *ngIf="(d.result.by_day?.length || 0) === 0"
              >
                No hay datos por día en este informe.
              </div>

              <div class="table" *ngIf="(d.result.by_day?.length || 0) > 0">
                <div class="t-head">
                  <div>Fecha</div>
                  <div class="right">Volumen</div>
                </div>
                <div class="t-row" *ngFor="let row of d.result.by_day">
                  <div>{{ formatDate(row.date) }}</div>
                  <div class="right">{{ row.volume }}</div>
                </div>
              </div>
            </section>

            <!-- Top ejercicios -->
            <section class="subcard">
              <div class="sub-title">
                Top ejercicios
                <span class="muted tiny">(por volumen: reps×kg)</span>
              </div>

              <div class="muted tiny" *ngIf="topExercisesDetail().length === 0">
                No hay ranking de ejercicios en este informe.
              </div>

              <div class="bars" *ngIf="topExercisesDetail().length > 0">
                <div
                  class="barrow"
                  *ngFor="let ex of topExercisesDetail(); let i = index"
                >
                  <!-- Rank separado: NO lo pisa la barra -->
                  <div class="rank" [title]="'Top #' + (i + 1)">
                    {{ i + 1 }}
                  </div>

                  <!-- Nombre del ejercicio -->
                  <div class="exname" [title]="ex.exercise">
                    {{ ex.exercise }}
                  </div>

                  <!-- Barra -->
                  <div class="bartrack" [title]="'' + ex.volume">
                    <div
                      class="barfill"
                      [style.width.%]="
                        pct(ex.volume, maxExerciseVolumeDetail())
                      "
                    ></div>
                  </div>

                  <!-- Valor -->
                  <div class="barval">{{ ex.volume }}</div>
                </div>
              </div>
            </section>
          </section>
        </section>

        <ng-template #emptyDetail>
          <section class="card detail">
            <div class="card-title">Detalle del informe</div>
            <div class="empty">Selecciona “Ver detalle” en un informe.</div>
          </section>
        </ng-template>
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
        justify-content: space-between;
        align-items: end;
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

      .btn {
        border: none;
        border-radius: 12px;
        padding: 10px 14px;
        font-weight: 900;
        cursor: pointer;
        background: #111;
        color: #fff;
      }
      .btn.ghost {
        background: #f4f4f4;
        color: #111;
      }
      .btn.small {
        padding: 6px 10px;
        font-size: 13px;
      }
      .btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .btn.danger {
        background: #111;
        color: #fff;
        border: none;
      }

      .btn.danger:hover {
        background: #000;
      }

      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        align-items: start;
      }
      .card {
        border: 1px solid #eee;
        background: #fff;
        border-radius: 18px;
        padding: 14px;
      }
      .card-title {
        font-weight: 950;
        margin-bottom: 10px;
      }

      .empty {
        padding: 14px;
        text-align: center;
        border-radius: 14px;
        background: #fafafa;
        border: 1px dashed #eee;
      }

      /* LISTADO */
      .list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        padding: 12px;
        border: 1px solid #f0f0f0;
        border-radius: 16px;
        background: #fff;
      }
      .row-left {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
      }
      .row-right {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: end;
      }
      .when {
        font-weight: 950;
      }

      .pdfline {
        display: flex;
        gap: 10px;
        align-items: center;
        min-width: 0;
      }
      .pdf-label {
        font-size: 12px;
        font-weight: 950;
        opacity: 0.6;
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }
      .pdf-name {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 360px;
      }

      /* DETALLE */
      .hero {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: 12px;
        padding: 12px;
        border: 1px solid #eee;
        border-radius: 16px;
        background: #fafafa;
        margin-bottom: 12px;
      }

      .hero-label {
        font-size: 12px;
        font-weight: 950;
        opacity: 0.6;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        margin-bottom: 6px;
      }

      .hero-range {
        font-size: 18px;
        font-weight: 950;
        margin-bottom: 10px;
      }

      .hero-sub {
        display: flex;
        gap: 10px;
        align-items: baseline;
        margin-top: 6px;
        min-width: 0;
      }

      .hero-sub-label {
        font-size: 12px;
        font-weight: 950;
        opacity: 0.6;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        flex: 0 0 auto;
      }

      .hero-sub-val {
        font-weight: 900;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      .kpis {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        align-items: stretch;
      }

      .kpi {
        border: 1px solid #eee;
        background: #fff;
        border-radius: 14px;
        padding: 10px;
      }

      .kpi-label {
        font-size: 12px;
        font-weight: 950;
        opacity: 0.6;
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .kpi-num {
        margin-top: 8px;
        font-size: 22px;
        font-weight: 950;
        font-variant-numeric: tabular-nums;
      }

      .detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .subcard {
        border: 1px solid #eee;
        border-radius: 16px;
        padding: 12px;
        background: #fff;
      }
      .sub-title {
        font-weight: 950;
        margin-bottom: 10px;
      }

      .table {
        display: flex;
        flex-direction: column;
      }
      .t-head,
      .t-row {
        display: grid;
        grid-template-columns: 1fr 110px;
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

      /* BARS (arreglado: rank separado + nombre visible) */
      .bars {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .barrow {
        display: grid;
        grid-template-columns: 34px 1fr 170px 64px;
        gap: 10px;
        align-items: center;
      }
      .rank {
        width: 28px;
        height: 28px;
        border-radius: 12px;
        background: #111;
        color: #fff;
        font-weight: 950;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .exname {
        font-weight: 950;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
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

      @media (max-width: 980px) {
        .grid {
          grid-template-columns: 1fr;
        }
        .row-right {
          align-items: start;
        }
        .pdf-name {
          max-width: 100%;
        }
        .hero {
          grid-template-columns: 1fr;
        }
        .detail-grid {
          grid-template-columns: 1fr;
        }
        .barrow {
          grid-template-columns: 34px 1fr;
        }
        .bartrack {
          grid-column: 1 / -1;
        }
        .barval {
          text-align: left;
        }
      }
    `,
  ],
})
export class HistorialPage {
  private http = inject(HttpClient);
  private readonly baseUrl = '/analytics';

  loading = signal(false);

  items = signal<ReportDoc[]>([]);
  detail = signal<ReportDoc | null>(null);

  topExercisesDetail = computed(() => {
    const d = this.detail();
    const rows = d?.result?.by_exercise ?? [];
    return rows.slice(0, 8);
  });

  maxExerciseVolumeDetail = computed(() => {
    const rows = this.topExercisesDetail();
    let m = 0;
    for (const r of rows) m = Math.max(m, Number(r.volume || 0));
    return m;
  });

  loadHistory() {
    this.loading.set(true);
    this.http.get<{ items: ReportDoc[] }>(`${this.baseUrl}/reports`).subscribe({
      next: (res) => {
        this.items.set(res?.items ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }

  loadDetail(id: string) {
    this.http.get<ReportDoc>(`${this.baseUrl}/reports/${id}`).subscribe({
      next: (doc) => this.detail.set(doc ?? null),
      error: () => this.detail.set(null),
    });
  }

  clearDetail() {
    this.detail.set(null);
  }

  deleteReport(it: ReportDoc) {
    const ok = confirm(
      `¿Eliminar este informe?\n\n${this.formatIso(it.generated_at)}\n${
        it.pdf?.filename || '—'
      }`
    );
    if (!ok) return;

    this.http
      .delete<{ deleted: boolean }>(`${this.baseUrl}/reports/${it.id}`)
      .subscribe({
        next: () => {
          // Si estaba seleccionado, cerramos el detalle
          if (this.detail()?.id === it.id) this.detail.set(null);
          // Recargar listado
          this.loadHistory();
        },
        error: () => {
          alert('No se ha podido eliminar el informe.');
        },
      });
  }

  pct(value: number, max: number): number {
    const v = Number(value || 0);
    const m = Number(max || 0);
    if (m <= 0) return 0;
    return Math.max(0, Math.min(100, (v / m) * 100));
  }

  formatIso(iso?: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  formatRange(r?: { from?: string; to?: string }): string {
    if (!r?.from || !r?.to) return '—';
    return `${this.formatDate(r.from)} → ${this.formatDate(r.to)}`;
  }

  formatDate(ymdOrIso: string): string {
    if (!ymdOrIso) return '—';
    const ymd = ymdOrIso.includes('T') ? ymdOrIso.split('T')[0] : ymdOrIso;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymdOrIso;
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  }
}
