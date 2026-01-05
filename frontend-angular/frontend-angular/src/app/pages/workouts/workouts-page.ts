// src/app/pages/workouts/workouts-page.ts
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { WorkoutsApi } from '../../core/services/workouts-api';
import { WorkoutListItem } from '../../core/models/workouts.model';

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
        <h2 class="panel-title">Entrenamiento del día</h2>

        <div class="row">
          <label class="field">
            <span class="label">Fecha</span>
            <input class="inp" type="date" [(ngModel)]="selectedDate" />
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
          se creará.
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
              <div class="date">{{ w.workout_date }}</div>
              <div class="notes muted" *ngIf="w.notes">{{ w.notes }}</div>
              <div class="notes muted" *ngIf="!w.notes">Sin notas</div>
            </div>

            <a class="btn ghost" [routerLink]="['/workouts', w.id]"
              >Ver detalle</a
            >
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
        grid-template-columns: 240px 1fr auto;
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

      @media (max-width: 860px) {
        .row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class WorkoutsPage {
  private api = inject(WorkoutsApi);
  private router = inject(Router);

  loading = signal(true);
  error = signal<string | null>(null);
  recent = signal<WorkoutListItem[]>([]);

  selectedDate = '';
  notes = '';

  resolving = signal(false);
  resolveError = signal<string | null>(null);

  constructor() {
    // fecha por defecto: hoy
    this.selectedDate = this.todayYmd();
    this.loadRecent();
  }

  private todayYmd(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  loadRecent() {
    this.loading.set(true);
    this.error.set(null);

    this.api.listRecent().subscribe({
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

    this.api.getByDate(date).subscribe({
      next: (existing) => {
        if (existing?.id) {
          this.resolving.set(false);
          this.router.navigate(['/workouts', existing.id]);
          return;
        }

        // crear
        const notes = (this.notes ?? '').trim();
        this.api.create({ date, notes: notes || null }).subscribe({
          next: (created) => {
            this.resolving.set(false);
            this.loadRecent();

            const id = Number(created?.id);
            if (id) this.router.navigate(['/workouts', id]);
            else
              this.resolveError.set(
                'Entrenamiento creado, pero no se recibió un ID válido.'
              );
          },
          error: (e) => {
            this.resolving.set(false);
            if (e?.status === 409)
              this.resolveError.set(
                'Ya existe un entrenamiento para esa fecha.'
              );
            else
              this.resolveError.set(
                e?.message ?? 'Error creando entrenamiento'
              );
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
}
