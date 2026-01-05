// src/app/pages/workouts/workout-detail-page.ts
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { WorkoutsApi } from '../../core/services/workouts-api';
import { ExercisesApi } from '../../core/services/exercises-api';

import { WorkoutDetail, WorkoutItem } from '../../core/models/workouts.model';
import { ExerciseListItem } from '../../core/models/exercises.model';

@Component({
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <section class="page">
      <header class="topbar">
        <button class="back" (click)="goBack()">← Volver</button>

        <div class="spacer"></div>

        <a class="btn ghost" routerLink="/exercises">Catálogo</a>
      </header>

      <section *ngIf="loading()" class="state">Cargando entrenamiento…</section>
      <section *ngIf="error()" class="state error">{{ error() }}</section>

      <section *ngIf="!loading() && !error() && workout() as w" class="content">
        <header class="header">
          <div>
            <h1 class="title">Entrenamiento · {{ w.workout_date }}</h1>
            <p class="muted" *ngIf="w.notes">{{ w.notes }}</p>
            <p class="muted" *ngIf="!w.notes">Sin notas.</p>
          </div>

          <div class="pill">Ejercicios: {{ w.items?.length ?? 0 }}</div>
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
              <span class="label">Notas (opcional)</span>
              <input
                class="inp"
                [(ngModel)]="itemNotes"
                placeholder="Ej: técnica estricta"
              />
            </label>

            <button
              class="btn"
              (click)="addItem()"
              [disabled]="addingItem() || !selectedExerciseId"
            >
              {{ addingItem() ? 'Añadiendo…' : 'Añadir' }}
            </button>
          </div>

          <p class="hint muted">
            Después podrás registrar las series con reps y peso (peso opcional).
          </p>
        </section>

        <!-- Lista -->
        <section class="panel">
          <h2 class="panel-title">Ejercicios del entrenamiento</h2>

          <div *ngIf="(w.items?.length ?? 0) === 0" class="empty muted">
            Este entrenamiento está vacío. Añade un ejercicio arriba.
          </div>

          <div class="items" *ngIf="(w.items?.length ?? 0) > 0">
            <article class="item" *ngFor="let it of w.items">
              <div class="thumb">
                <img
                  [src]="it.exercise_image_url || placeholder"
                  [alt]="it.exercise_name"
                  loading="lazy"
                />
              </div>

              <div class="info">
                <div class="name">{{ it.exercise_name }}</div>
                <div class="notes muted" *ngIf="it.notes">{{ it.notes }}</div>

                <!-- sets list -->
                <div class="sets" *ngIf="(it.sets?.length ?? 0) > 0">
                  <div class="set-row" *ngFor="let s of it.sets">
                    <span class="tag">Serie {{ s.set_index }}</span>

                    <span class="meta">
                      <strong *ngIf="s.reps != null">{{ s.reps }}</strong
                      ><span *ngIf="s.reps == null" class="muted">—</span>
                      reps
                    </span>

                    <span class="meta">
                      <strong *ngIf="s.weight_kg != null">{{
                        s.weight_kg
                      }}</strong
                      ><span *ngIf="s.weight_kg == null" class="muted">—</span>
                      kg
                    </span>

                    <button
                      class="btn tiny danger"
                      (click)="deleteSet(it.id, s.id)"
                      [disabled]="deletingSetId() === s.id"
                    >
                      {{ deletingSetId() === s.id ? '…' : 'X' }}
                    </button>
                  </div>
                </div>

                <!-- add set form -->
                <div class="addset">
                  <label class="mini">
                    <span class="mini-label">Reps</span>
                    <input
                      class="mini-inp"
                      type="number"
                      min="0"
                      step="1"
                      [(ngModel)]="repsByItem[it.id]"
                    />
                  </label>

                  <label class="mini">
                    <span class="mini-label">Kg (opcional)</span>
                    <input
                      class="mini-inp"
                      type="number"
                      min="0"
                      step="0.5"
                      [(ngModel)]="weightByItem[it.id]"
                    />
                  </label>

                  <button
                    class="btn tiny"
                    (click)="addSet(it)"
                    [disabled]="addingSetItemId() === it.id"
                  >
                    {{
                      addingSetItemId() === it.id
                        ? 'Añadiendo…'
                        : 'Añadir serie'
                    }}
                  </button>
                </div>

                <p class="mini-hint muted">
                  Si no hay peso (abdominales, dominadas, etc.), deja Kg vacío.
                </p>
              </div>

              <div class="actions">
                <button
                  class="btn danger"
                  (click)="deleteItem(it.id)"
                  [disabled]="deletingItemId() === it.id"
                >
                  {{
                    deletingItemId() === it.id
                      ? 'Eliminando…'
                      : 'Eliminar ejercicio'
                  }}
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

      .btn.tiny {
        padding: 8px 10px;
        border-radius: 10px;
        font-weight: 950;
      }
      .btn.tiny.danger {
        background: #3a3a3a;
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
        grid-template-columns: 1.4fr 1fr auto;
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
        grid-template-columns: 96px 1fr auto;
        gap: 12px;
        align-items: start;
        border: 1px solid #eee;
        border-radius: 14px;
        padding: 12px;
        background: #fff;
      }

      .thumb {
        width: 96px;
        height: 72px;
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

      .info {
        min-width: 0;
      }
      .name {
        font-weight: 950;
        line-height: 1.2;
      }

      .sets {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .set-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border: 1px solid #eee;
        border-radius: 12px;
        background: #fafafa;
      }

      .tag {
        font-size: 12px;
        font-weight: 950;
        background: #f4f4f4;
        border: 1px solid #ededed;
        border-radius: 999px;
        padding: 6px 9px;
      }

      .meta {
        font-size: 13px;
      }

      .addset {
        margin-top: 10px;
        display: flex;
        gap: 10px;
        align-items: end;
        flex-wrap: wrap;
      }

      .mini {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .mini-label {
        font-size: 11px;
        font-weight: 900;
        opacity: 0.7;
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }
      .mini-inp {
        width: 140px;
        padding: 9px 10px;
        border: 1px solid #e6e6e6;
        border-radius: 10px;
        outline: none;
      }

      .mini-hint {
        margin: 8px 0 0;
        font-size: 12.5px;
      }

      .actions {
        display: flex;
        align-items: start;
        justify-content: flex-end;
      }

      @media (max-width: 980px) {
        .form {
          grid-template-columns: 1fr;
        }
        .item {
          grid-template-columns: 96px 1fr;
        }
        .actions {
          grid-column: 1 / -1;
        }
      }
    `,
  ],
})
export class WorkoutDetailPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private workoutsApi = inject(WorkoutsApi);
  private exercisesApi = inject(ExercisesApi);

  placeholder = 'https://via.placeholder.com/640x360?text=MyWorkout';

  loading = signal(true);
  error = signal<string | null>(null);

  workoutId = signal<number | null>(null);
  workout = signal<WorkoutDetail | null>(null);

  exercises = signal<ExerciseListItem[]>([]);
  selectedExerciseId: number | null = null;
  itemNotes = '';

  addingItem = signal(false);
  deletingItemId = signal<number | null>(null);

  addingSetItemId = signal<number | null>(null);
  deletingSetId = signal<number | null>(null);

  // inputs por item (evita que un input pise al de otro)
  repsByItem: Record<number, number | null> = {};
  weightByItem: Record<number, number | null> = {};

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || Number.isNaN(id)) {
      this.loading.set(false);
      this.error.set('ID de entrenamiento inválido');
      return;
    }

    this.workoutId.set(id);
    this.loadWorkout();
    this.loadExercises();
  }

  goBack() {
    this.router.navigate(['/workouts']);
  }

  private loadWorkout() {
    const id = this.workoutId();
    if (!id) return;

    this.loading.set(true);
    this.error.set(null);

    this.workoutsApi.getById(id).subscribe({
      next: (data) => {
        this.workout.set(data);
        this.loading.set(false);
        this.ensureInputsInitialized(data?.items ?? []);
      },
      error: (e) => {
        if (e?.status === 404) this.error.set('Entrenamiento no encontrado');
        else this.error.set('No se pudo cargar el entrenamiento');
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

  private ensureInputsInitialized(items: WorkoutItem[]) {
    for (const it of items) {
      if (!(it.id in this.repsByItem)) this.repsByItem[it.id] = 10;
      if (!(it.id in this.weightByItem)) this.weightByItem[it.id] = null;
    }
  }

  addItem() {
    const workoutId = this.workoutId();
    const exerciseId = this.selectedExerciseId;

    if (!workoutId || !exerciseId) return;

    const notes = (this.itemNotes ?? '').trim();

    this.addingItem.set(true);

    this.workoutsApi
      .addItem(workoutId, { exerciseId, notes: notes || null })
      .subscribe({
        next: () => {
          this.selectedExerciseId = null;
          this.itemNotes = '';
          this.addingItem.set(false);
          this.loadWorkout();
        },
        error: (e) => {
          this.addingItem.set(false);
          this.error.set(e?.message ?? 'Error añadiendo ejercicio');
        },
      });
  }

  deleteItem(itemId: number) {
    const workoutId = this.workoutId();
    if (!workoutId) return;

    this.deletingItemId.set(itemId);

    this.workoutsApi.deleteItem(workoutId, itemId).subscribe({
      next: () => {
        this.deletingItemId.set(null);
        this.loadWorkout();
      },
      error: (e) => {
        this.deletingItemId.set(null);
        this.error.set(e?.message ?? 'Error eliminando ejercicio');
      },
    });
  }

  addSet(it: WorkoutItem) {
    const workoutId = this.workoutId();
    if (!workoutId) return;

    const itemId = it.id;

    // setIndex: siguiente (max + 1)
    const nextIndex =
      ((it.sets ?? []).reduce(
        (m, s) => Math.max(m, Number(s.set_index || 0)),
        0
      ) || 0) + 1;

    const repsRaw = this.repsByItem[itemId];
    const weightRaw = this.weightByItem[itemId];

    const reps = repsRaw != null ? Number(repsRaw) : null;
    const weightKg =
      weightRaw != null && String(weightRaw).trim() !== ''
        ? Number(weightRaw)
        : null;

    // reps: si viene, debe ser >= 0
    if (reps != null && (!Number.isFinite(reps) || reps < 0)) {
      this.error.set('Reps inválidas');
      return;
    }

    // weight: si viene, >= 0
    if (weightKg != null && (!Number.isFinite(weightKg) || weightKg < 0)) {
      this.error.set('Peso inválido');
      return;
    }

    this.addingSetItemId.set(itemId);

    this.workoutsApi
      .addSet(workoutId, itemId, { setIndex: nextIndex, reps, weightKg })
      .subscribe({
        next: () => {
          this.addingSetItemId.set(null);
          this.loadWorkout();
        },
        error: (e) => {
          this.addingSetItemId.set(null);
          this.error.set(e?.message ?? 'Error añadiendo serie');
        },
      });
  }

  deleteSet(itemId: number, setId: number) {
    const workoutId = this.workoutId();
    if (!workoutId) return;

    this.deletingSetId.set(setId);

    this.workoutsApi.deleteSet(workoutId, itemId, setId).subscribe({
      next: () => {
        this.deletingSetId.set(null);
        this.loadWorkout();
      },
      error: (e) => {
        this.deletingSetId.set(null);
        this.error.set(e?.message ?? 'Error eliminando serie');
      },
    });
  }
}
