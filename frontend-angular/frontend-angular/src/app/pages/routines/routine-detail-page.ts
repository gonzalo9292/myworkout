import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { RoutinesApi, RoutineDetail } from '../../core/services/routines-api';
import { ExercisesApi } from '../../core/services/exercises-api';
import { ExerciseListItem } from '../../core/models/exercises.model';

@Component({
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <section class="page">
      <header class="topbar">
        <button class="back" (click)="goBack()">← Volver a rutinas</button>

        <div class="spacer"></div>

        <a class="btn ghost" routerLink="/exercises">Abrir catálogo</a>
      </header>

      <section *ngIf="loading()" class="state">Cargando rutina…</section>
      <section *ngIf="error()" class="state error">{{ error() }}</section>

      <section *ngIf="!loading() && !error() && routine() as r" class="content">
        <header class="header">
          <div>
            <h1 class="title">{{ r.name }}</h1>
            <p class="muted" *ngIf="r.notes">{{ r.notes }}</p>
            <p class="muted" *ngIf="!r.notes">Sin notas.</p>
          </div>

          <div class="pill">Ejercicios: {{ r.items?.length ?? 0 }}</div>
        </header>

        <!-- Añadir ejercicio -->
        <section class="panel">
          <h2 class="panel-title">Añadir ejercicio</h2>

          <div class="form">
            <label class="field">
              <span class="label">Ejercicio</span>
              <select class="select" [(ngModel)]="selectedExerciseId">
                <option [ngValue]="null">Selecciona un ejercicio…</option>
                <option *ngFor="let ex of exercises()" [ngValue]="ex.id">
                  {{ ex.name }}
                </option>
              </select>
            </label>

            <label class="field">
              <span class="label">Series</span>
              <input
                class="inp"
                type="number"
                min="1"
                step="1"
                [(ngModel)]="sets"
                placeholder="Ej: 4"
              />
            </label>

            <label class="field">
              <span class="label">Repeticiones</span>
              <input
                class="inp"
                type="text"
                [(ngModel)]="reps"
                placeholder="Ej: 8-12"
              />
            </label>

            <label class="field">
              <span class="label">Notas (opcional)</span>
              <input
                class="inp"
                type="text"
                [(ngModel)]="itemNotes"
                placeholder="Ej: sube peso en la última"
              />
            </label>

            <button
              class="btn"
              (click)="addItem()"
              [disabled]="adding() || !canAdd()"
            >
              {{ adding() ? 'Añadiendo…' : 'Añadir a la rutina' }}
            </button>
          </div>

          <p class="hint muted">
            Consejo: “Repeticiones” es texto libre (8-12, AMRAP, 10/8/6, etc.).
            El “Peso” es opcional (si lo dejas vacío, no se guarda).
          </p>
        </section>

        <!-- Lista de items -->
        <section class="panel">
          <h2 class="panel-title">Ejercicios de la rutina</h2>

          <div *ngIf="(r.items?.length ?? 0) === 0" class="empty muted">
            Esta rutina está vacía. Añade ejercicios arriba.
          </div>

          <div class="items" *ngIf="(r.items?.length ?? 0) > 0">
            <article class="item" *ngFor="let it of r.items">
              <div class="thumb">
                <img
                  [src]="it.exercise_image_url || placeholder"
                  [alt]="it.exercise_name"
                  loading="lazy"
                />
              </div>

              <div class="info">
                <div class="name">{{ it.exercise_name }}</div>

                <div class="meta">
                  <span class="tag" *ngIf="it.sets">{{ it.sets }} series</span>
                  <span class="tag" *ngIf="it.reps">{{ it.reps }} reps</span>
                  <span class="tag" *ngIf="it.weight_kg != null"
                    >{{ it.weight_kg }} kg</span
                  >
                  <span
                    class="tag"
                    *ngIf="!it.sets && !it.reps && it.weight_kg == null"
                    >Sin plan</span
                  >
                </div>

                <div class="notes" *ngIf="it.notes">{{ it.notes }}</div>
              </div>

              <div class="actions">
                <button
                  class="btn danger"
                  (click)="deleteItem(it.id)"
                  [disabled]="deletingId() === it.id"
                >
                  {{ deletingId() === it.id ? 'Eliminando…' : 'Eliminar' }}
                </button>
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
        padding: 22px 16px 28px;
      }

      .topbar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
      }

      .spacer {
        flex: 1;
      }

      .back {
        background: none;
        border: none;
        cursor: pointer;
        font-weight: 900;
        padding: 8px 10px;
        border-radius: 10px;
      }
      .back:hover {
        background: #f4f4f4;
      }

      .state {
        padding: 16px;
        background: #fafafa;
        border-radius: 12px;
        border: 1px solid #eee;
      }
      .state.error {
        background: #fff5f5;
        border-color: #ffd6d6;
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

      .content {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .header {
        display: flex;
        align-items: start;
        gap: 12px;
        justify-content: space-between;
      }

      .title {
        margin: 0;
        font-size: 40px;
        line-height: 1.1;
        letter-spacing: -0.02em;
      }

      .muted {
        opacity: 0.7;
      }

      .pill {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        background: #f4f4f4;
        font-weight: 900;
        font-size: 12px;
        margin-top: 6px;
      }

      .panel {
        border: 1px solid #eee;
        background: #fff;
        border-radius: 16px;
        padding: 14px;
      }

      .panel-title {
        margin: 0 0 10px;
        font-size: 15px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        opacity: 0.75;
      }

      .form {
        display: grid;
        grid-template-columns: 1.4fr 0.5fr 0.6fr 0.6fr 1fr auto;
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

      .inp,
      .select {
        padding: 10px 12px;
        border: 1px solid #e6e6e6;
        border-radius: 10px;
        outline: none;
        min-width: 0;
      }

      .hint {
        margin: 10px 0 0;
        font-size: 13px;
      }

      .empty {
        padding: 10px 0;
      }

      .items {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .item {
        display: grid;
        grid-template-columns: 84px 1fr auto;
        gap: 12px;
        align-items: center;
        border: 1px solid #eee;
        border-radius: 14px;
        padding: 10px;
        background: #fff;
      }

      .thumb {
        width: 84px;
        height: 62px;
        border-radius: 12px;
        overflow: hidden;
        background: #f6f6f6;
        border: 1px solid #eee;
      }

      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .name {
        font-weight: 950;
        line-height: 1.2;
      }

      .meta {
        margin-top: 6px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .tag {
        font-size: 12px;
        font-weight: 900;
        background: #f4f4f4;
        border: 1px solid #ededed;
        border-radius: 999px;
        padding: 6px 9px;
      }

      .notes {
        margin-top: 6px;
        font-size: 13px;
        opacity: 0.75;
      }

      @media (max-width: 980px) {
        .form {
          grid-template-columns: 1fr;
        }
        .item {
          grid-template-columns: 84px 1fr;
        }
        .actions {
          grid-column: 1 / -1;
          display: flex;
          justify-content: flex-end;
        }
      }
    `,
  ],
})
export class RoutineDetailPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private routinesApi = inject(RoutinesApi);
  private exercisesApi = inject(ExercisesApi);

  placeholder = 'https://via.placeholder.com/640x360?text=MyWorkout';

  loading = signal(true);
  error = signal<string | null>(null);

  routineId = signal<number | null>(null);
  routine = signal<RoutineDetail | null>(null);

  // para el selector de ejercicios
  exercises = signal<ExerciseListItem[]>([]);
  selectedExerciseId: number | null = null;

  // plan del item
  sets: number | null = 3;
  reps = '8-12';
  weightKg: number | null = null; // NUEVO: peso opcional
  itemNotes = '';

  adding = signal(false);
  deletingId = signal<number | null>(null);

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || Number.isNaN(id)) {
      this.loading.set(false);
      this.error.set('ID de rutina inválido');
      return;
    }

    this.routineId.set(id);

    // Cargamos:
    // 1) Detalle rutina
    // 2) Catálogo ejercicios (para poder añadir)
    this.loadRoutine();
    this.loadExercises();
  }

  goBack() {
    this.router.navigate(['/routines']);
  }

  private loadRoutine() {
    const id = this.routineId();
    if (!id) return;

    this.loading.set(true);
    this.error.set(null);

    this.routinesApi.getById(id).subscribe({
      next: (data) => {
        this.routine.set(data);
        this.loading.set(false);
      },
      error: (e) => {
        if (e?.status === 404) this.error.set('Rutina no encontrada');
        else this.error.set('No se pudo cargar la rutina');
        this.loading.set(false);
      },
    });
  }

  private loadExercises() {
    this.exercisesApi.list().subscribe({
      next: (data) => this.exercises.set(data ?? []),
      error: () => this.exercises.set([]),
    });
  }

  canAdd(): boolean {
    if (!this.routineId()) return false;
    if (!this.selectedExerciseId) return false;

    // sets opcional, pero si viene debe ser >= 1
    if (this.sets != null) {
      const s = Number(this.sets);
      if (!Number.isFinite(s) || s < 1) return false;
    }

    // reps opcional: aquí lo tratamos como requerido (tu decisión original)
    const reps = (this.reps ?? '').trim();
    if (reps.length === 0) return false;

    // peso opcional, pero si viene debe ser >= 0
    if (this.weightKg != null) {
      const w = Number(this.weightKg);
      if (!Number.isFinite(w) || w < 0) return false;
    }

    return true;
  }

  addItem() {
    const routineId = this.routineId();
    const exerciseId = this.selectedExerciseId;

    if (!routineId || !exerciseId) return;

    const reps = (this.reps ?? '').trim();
    const notes = (this.itemNotes ?? '').trim();

    this.adding.set(true);
    this.error.set(null);

    this.routinesApi
      .addItem(routineId, {
        exerciseId,
        sets: this.sets != null ? Number(this.sets) : null,
        reps,
        weightKg: this.weightKg != null ? Number(this.weightKg) : null,
        notes: notes || null,
        // position lo dejamos que el backend lo calcule al final
      })
      .subscribe({
        next: () => {
          // reset UI mínimo
          this.selectedExerciseId = null;
          this.itemNotes = '';
          this.weightKg = null;

          this.adding.set(false);
          this.loadRoutine();
        },
        error: (e) => {
          this.adding.set(false);
          this.error.set(e?.message ?? 'Error añadiendo ejercicio');
        },
      });
  }

  deleteItem(itemId: number) {
    const routineId = this.routineId();
    if (!routineId || !itemId) return;

    this.deletingId.set(itemId);
    this.error.set(null);

    this.routinesApi.deleteItem(routineId, itemId).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.loadRoutine();
      },
      error: (e) => {
        this.deletingId.set(null);
        this.error.set(e?.message ?? 'Error eliminando item');
      },
    });
  }
}
