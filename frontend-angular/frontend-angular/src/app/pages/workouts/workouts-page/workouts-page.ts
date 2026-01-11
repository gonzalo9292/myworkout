import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { WorkoutsApi } from '../../../core/services/workouts-api';
import { WorkoutListItem } from '../../../core/models/workouts.model';

import {
  RoutinesApi,
  RoutineListItem,
} from '../../../core/services/routines-api';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './workouts-page.html',
  styleUrls: ['./workouts-page.css'],
})
export class WorkoutsPage {
  private workoutsApi = inject(WorkoutsApi);
  private routinesApi = inject(RoutinesApi);
  private router = inject(Router);

  loading = signal(true);
  error = signal<string | null>(null);
  recent = signal<WorkoutListItem[]>([]);

  routines = signal<RoutineListItem[]>([]);

  selectedDate = '';
  selectedRoutineId: number | null = null;
  notes = '';

  resolving = signal(false);
  resolveError = signal<string | null>(null);

  deletingId = signal<number | null>(null);

  constructor() {
    this.selectedDate = this.todayYmd();
    this.loadRoutines();
    this.loadRecent();
  }

  private todayYmd(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  formatDate(value: string): string {
    if (!value) return value;

    // Caso 1: "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-');
      return `${d}/${m}/${y}`;
    }

    // Caso 2: ISO "2026-01-05T00:00:00.000Z" (o similar)
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return `${d}/${m}/${y}`;
    }

    // Caso 3: cualquier otro formato parseable
    const dt = new Date(value);
    if (!Number.isNaN(dt.getTime())) {
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }

    return value;
  }

  loadRoutines() {
    this.routinesApi.list().subscribe({
      next: (data) => this.routines.set(data ?? []),
      error: () => this.routines.set([]),
    });
  }

  loadRecent() {
    this.loading.set(true);
    this.error.set(null);

    this.workoutsApi.listRecent().subscribe({
      next: (data) => {
        this.recent.set(data ?? []);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.message ?? 'Error cargando entrenamientos');
        this.loading.set(false);
      },
    });
  }

  resolveWorkout() {
    const date = (this.selectedDate ?? '').trim();
    if (!date) return;

    this.resolving.set(true);
    this.resolveError.set(null);

    this.workoutsApi.getByDate(date).subscribe({
      next: (existing) => {
        if (existing?.id) {
          this.resolving.set(false);
          this.router.navigate(['/workouts', existing.id]);
          return;
        }

        const notes = (this.notes ?? '').trim();

        this.workoutsApi
          .create({
            date,
            notes: notes || null,
            routineId: this.selectedRoutineId ?? null,
          })
          .subscribe({
            next: (created) => {
              this.resolving.set(false);
              this.loadRecent();

              const id = Number(created?.id);
              if (id) this.router.navigate(['/workouts', id]);
              else {
                this.resolveError.set(
                  'Entrenamiento creado, pero no se recibió un ID válido.'
                );
              }
            },
            error: (e) => {
              this.resolving.set(false);
              if (e?.status === 409) {
                this.resolveError.set(
                  'Ya existe un entrenamiento para esa fecha.'
                );
              } else {
                this.resolveError.set(
                  e?.message ?? 'Error creando entrenamiento'
                );
              }
            },
          });
      },
      error: (e) => {
        this.resolving.set(false);
        this.resolveError.set(
          e?.message ?? 'Error consultando entrenamiento por fecha'
        );
      },
    });
  }

  deleteWorkout(id: number) {
    if (!id) return;

    const ok = confirm(
      '¿Eliminar este entrenamiento? Se borrará todo su detalle.'
    );
    if (!ok) return;

    this.deletingId.set(id);

    this.workoutsApi.delete(id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.loadRecent();
      },
      error: (e) => {
        this.deletingId.set(null);
        this.error.set(e?.message ?? 'Error eliminando entrenamiento');
      },
    });
  }
}
