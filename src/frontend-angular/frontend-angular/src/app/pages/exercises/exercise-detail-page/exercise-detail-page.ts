import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { ExercisesApi } from '../../../core/services/exercises-api';
import { ExerciseDetail } from '../../../core/models/exercises.model';

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './exercise-detail-page.html',
  styleUrls: ['./exercise-detail-page.css'],
})
export class ExerciseDetailPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ExercisesApi);

  loading = signal(true);
  error = signal<string | null>(null);
  exercise = signal<ExerciseDetail | null>(null);

  constructor() {
    const idRaw = this.route.snapshot.paramMap.get('id');
    const id = Number(idRaw);

    if (!id || Number.isNaN(id)) {
      this.error.set('ID de ejercicio inválido');
      this.loading.set(false);
      return;
    }

    this.api.getById(id).subscribe({
      next: (data: ExerciseDetail) => {
        this.exercise.set(data);
        this.loading.set(false);
      },
      error: (e) => {
        if (e?.status === 404) {
          this.error.set('Ejercicio no encontrado');
        } else {
          this.error.set('No se pudo cargar el ejercicio');
        }
        this.loading.set(false);
      },
    });
  }

  imgSrc(ex: ExerciseDetail) {
    return ex.image_url || 'https://via.placeholder.com/960x540?text=MyWorkout';
  }

  /**
   * Limpia espacios/saltos “raros” que pueden venir del HTML original
   */
  cleanDescription(ex: ExerciseDetail): string | null {
    const raw = (ex.description_text ?? '').toString();
    const cleaned = raw
      .replace(/\r/g, '')
      .replace(/\n+/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    return cleaned ? cleaned : null;
  }

  goBack() {
    this.router.navigate(['/exercises']);
  }

  todo() {
    alert('Siguiente paso: añadir a entrenamiento');
  }
}
