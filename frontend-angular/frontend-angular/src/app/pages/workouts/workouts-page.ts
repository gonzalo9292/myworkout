// src/app/pages/workouts/workouts-page.ts
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { WorkoutsApi } from '../../core/services/workouts-api';
import { WorkoutListItem } from '../../core/models/workouts.model';

import { RoutinesApi, RoutineListItem } from '../../core/services/routines-api';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Entrenamientos</h1>
        <p class="muted">
          Crea tu entrenamiento por fecha y registra series, repeticiones y
          peso.
        </p>
      </header>

      <section class="panel">
        <h2 class="panel-title">Entrenamiento por fecha</h2>

        <div class="row">
          <label class="field">
            <span class="label">Fecha</span>
            <input class="inp" type="date" [(ngModel)]="selectedDate" />
          </label>

          <label class="field">
            <span class="label">Rutina (opcional)</span>
            <select class="inp" [(ngModel)]="selectedRoutineId">
              <option [ngValue]="null">Sin rutina (entreno libre)</option>
              <option *ngFor="let r of routines()" [ngValue]="r.id">
                {{ r.name }}
              </option>
            </select>
          </label>

          <label class="field">
            <span class="label">Notas (opcional)</span>
            <input
              class="inp"
              type="text"
              [(ngModel)]="notes"
              placeholder="Ej: Pierna, me sentía bien"
            />
          </label>

          <button
            class="btn"
            (click)="resolveWorkout()"
            [disabled]="resolving() || !selectedDate"
          >
            {{ resolving() ? 'Comprobando…' : 'Abrir / Crear' }}
          </button>
        </div>

        <p class="hint muted">
          Si ya existe un entrenamiento para esa fecha, se abrirá. Si no existe,
          se creará. Si eliges una rutina, se copiará automáticamente al
          entreno.
        </p>

        <section *ngIf="resolveError()" class="state error">
          {{ resolveError() }}
        </section>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">Recientes</h2>
          <button
            class="btn ghost"
            (click)="loadRecent()"
            [disabled]="loading()"
          >
            {{ loading() ? 'Cargando…' : 'Recargar' }}
          </button>
        </div>

        <section *ngIf="loading()" class="state">
          Cargando entrenamientos…
        </section>
        <section *ngIf="error()" class="state error">{{ error() }}</section>

        <section *ngIf="!loading() && !error()" class="list">
          <article class="card" *ngFor="let w of recent()">
            <div class="info">
              <div class="date">{{ formatDate(w.workout_date) }}</div>
              <div class="notes muted" *ngIf="w.notes">{{ w.notes }}</div>
              <div class="notes muted" *ngIf="!w.notes">Sin notas</div>
            </div>

            <div class="actions">
              <a class="btn ghost" [routerLink]="['/workouts', w.id]"
                >Ver detalle</a
              >

              <button
                class="btn danger"
                (click)="deleteWorkout(w.id)"
                [disabled]="deletingId() === w.id"
              >
                {{ deletingId() === w.id ? 'Eliminando…' : 'Eliminar' }}
              </button>
            </div>
          </article>

          <p class="muted" *ngIf="recent().length === 0">
            Aún no hay entrenamientos. Crea el primero arriba.
          </p>
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
        margin: 0 0 10px;
        font-size: 15px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        opacity: 0.75;
      }

      .row {
        display: grid;
        grid-template-columns: 240px 280px 1fr auto;
        gap: 10px;
        align-items: end;
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
      .btn.danger {
        background: #2b2b2b;
      }
      .btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .hint {
        margin: 10px 0 0;
        font-size: 13px;
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

      .list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .card {
        border: 1px solid #eee;
        border-radius: 14px;
        background: #fff;
        padding: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .info {
        flex: 1;
        min-width: 0;
      }
      .date {
        font-weight: 950;
      }
      .notes {
        margin-top: 2px;
        font-size: 13px;
      }
      .actions {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      @media (max-width: 980px) {
        .row {
          grid-template-columns: 1fr;
        }
        .actions {
          width: 100%;
          justify-content: flex-end;
          flex-wrap: wrap;
        }
      }
    `,
  ],
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
