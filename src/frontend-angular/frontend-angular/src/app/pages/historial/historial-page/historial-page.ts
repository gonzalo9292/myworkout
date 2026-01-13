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
  templateUrl: './historial-page.html',
  styleUrls: ['./historial-page.css'],
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
          if (this.detail()?.id === it.id) this.detail.set(null);
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
