import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ExercisesApi } from '../../../core/services/exercises-api';
import { ExerciseListItem } from '../../../core/models/exercises.model';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './exercises-page.html',
  styleUrls: ['./exercises-page.css'],
})
export class ExercisesPage {
  private api = inject(ExercisesApi);
  private router = inject(Router);

  all = signal<ExerciseListItem[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  q = signal('');

  page = signal(1);
  pageSize = signal(24);

  constructor() {
    this.load();

    effect(() => {
      this.q();
      this.pageSize();
      this.page.set(1);
    });
  }

  load() {
    this.loading.set(true);
    this.error.set(null);

    this.api.list().subscribe({
      next: (data) => {
        this.all.set(data ?? []);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.message ?? 'Error desconocido');
        this.loading.set(false);
      },
    });
  }

  private normalize(s: string): string {
    return (s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  onQueryChange(value: string) {
    this.q.set(value ?? '');
  }

  onPageSizeChange(value: number) {
    this.pageSize.set(Number(value) || 24);
  }

  filtered = computed(() => {
    const query = this.normalize(this.q());
    if (!query) return this.all();

    return this.all().filter((ex) => {
      const name = this.normalize(ex.name ?? '');
      return name.includes(query);
    });
  });

  totalPages = computed(() => {
    const total = this.filtered().length;
    const size = this.pageSize();
    return Math.max(1, Math.ceil(total / size));
  });

  paged = computed(() => {
    const p = this.page();
    const size = this.pageSize();
    const start = (p - 1) * size;
    return this.filtered().slice(start, start + size);
  });

  prevPage() {
    this.page.set(Math.max(1, this.page() - 1));
  }

  nextPage() {
    this.page.set(Math.min(this.totalPages(), this.page() + 1));
  }

  imgSrc(ex: ExerciseListItem) {
    return ex.image_url || 'https://via.placeholder.com/640x360?text=MyWorkout';
  }

  trackById(_index: number, item: ExerciseListItem) {
    return item.id;
  }

  openDetail(id: number) {
    // Navega al detalle: /exercises/:id
    this.router.navigate(['/exercises', id]);
  }
}
