import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import {
  RoutinesApi,
  RoutineDetail,
} from '../../../core/services/routines-api';
import { ExercisesApi } from '../../../core/services/exercises-api';
import { ExerciseListItem } from '../../../core/models/exercises.model';

@Component({
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './routine-detail-page.html',
  styleUrls: ['./routine-detail-page.css'],
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

  // selector de ejercicios
  exercises = signal<ExerciseListItem[]>([]);
  selectedExerciseId: number | null = null;

  // plan del item
  sets: number | null = 3;
  reps = '8-12';
  weightKg: number | null = null; // opcional (no hay input en tu HTML actual)
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

    // reps lo tratamos como requerido (según tu TS)
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
        // position lo deja el backend al final
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
