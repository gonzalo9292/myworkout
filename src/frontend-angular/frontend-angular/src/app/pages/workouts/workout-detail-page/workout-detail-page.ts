import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { WorkoutsApi } from '../../../core/services/workouts-api';
import { ExercisesApi } from '../../../core/services/exercises-api';

import {
  WorkoutDetail,
  WorkoutItem,
} from '../../../core/models/workouts.model';
import { ExerciseListItem } from '../../../core/models/exercises.model';

@Component({
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './workout-detail-page.html',
  styleUrls: ['./workout-detail-page.css'],
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

  // selector ejercicios
  exercises = signal<ExerciseListItem[]>([]);
  selectedExerciseId: number | null = null;
  itemNotes = '';

  // estados acciones
  addingItem = signal(false);
  deletingItemId = signal<number | null>(null);

  addingSetItemId = signal<number | null>(null);
  deletingSetId = signal<number | null>(null);

  // inputs por item (formularios de “nueva serie”)
  repsByItem: Record<number, number | null> = {};
  weightByItem: Record<number, number | null> = {};

  // UI: item con formulario “Añadir serie” abierto
  openAddSetForItemId = signal<number | null>(null);

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

  // soporta "YYYY-MM-DD" y también ISO "YYYY-MM-DDTHH:mm:ss..."
  formatDate(value: string): string {
    if (!value) return value;

    const onlyDate = value.includes('T') ? value.split('T')[0] : value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(onlyDate)) return value;

    const [y, m, d] = onlyDate.split('-');
    return `${d}/${m}/${y}`;
  }

  isAddSetOpen(itemId: number): boolean {
    return this.openAddSetForItemId() === itemId;
  }

  toggleAddSet(it: WorkoutItem) {
    const itemId = it.id;

    // abrir
    if (!this.isAddSetOpen(itemId)) {
      if (!(itemId in this.repsByItem)) this.repsByItem[itemId] = 10;
      if (!(itemId in this.weightByItem)) this.weightByItem[itemId] = null;
      this.openAddSetForItemId.set(itemId);
      return;
    }

    // cerrar
    this.openAddSetForItemId.set(null);
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
    this.error.set(null);

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
    this.error.set(null);

    this.workoutsApi.deleteItem(workoutId, itemId).subscribe({
      next: () => {
        if (this.openAddSetForItemId() === itemId) {
          this.openAddSetForItemId.set(null);
        }
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

    if (reps != null && (!Number.isFinite(reps) || reps < 0)) {
      this.error.set('Reps inválidas');
      return;
    }

    if (weightKg != null && (!Number.isFinite(weightKg) || weightKg < 0)) {
      this.error.set('Peso inválido');
      return;
    }

    this.addingSetItemId.set(itemId);
    this.error.set(null);

    this.workoutsApi
      .addSet(workoutId, itemId, { setIndex: nextIndex, reps, weightKg })
      .subscribe({
        next: () => {
          this.addingSetItemId.set(null);
          this.openAddSetForItemId.set(null);
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
    this.error.set(null);

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
