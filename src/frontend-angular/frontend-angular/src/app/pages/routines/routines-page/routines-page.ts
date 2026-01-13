import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import {
  RoutinesApi,
  RoutineListItem,
} from '../../../core/services/routines-api';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './routines-page.html',
  styleUrls: ['./routines-page.css'],
})
export class RoutinesPage {
  private api = inject(RoutinesApi);

  loading = signal(true);
  creating = signal(false);
  error = signal<string | null>(null);

  routines = signal<RoutineListItem[]>([]);

  newName = '';
  newNotes = '';

  deletingId = signal<number | null>(null);

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set(null);

    this.api.list().subscribe({
      next: (data) => {
        this.routines.set(data ?? []);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.message ?? 'Error cargando rutinas');
        this.loading.set(false);
      },
    });
  }

  create() {
    const name = this.newName.trim();
    if (!name) return;

    this.creating.set(true);
    this.error.set(null);

    this.api.create({ name, notes: this.newNotes?.trim() || null }).subscribe({
      next: () => {
        this.newName = '';
        this.newNotes = '';
        this.creating.set(false);
        this.load();
      },
      error: (e) => {
        this.error.set(e?.message ?? 'Error creando rutina');
        this.creating.set(false);
      },
    });
  }

  deleteRoutine(id: number) {
    const ok = confirm(
      '¿Eliminar esta rutina?\n\nSe borrarán también sus ejercicios (cascade).'
    );
    if (!ok) return;

    this.deletingId.set(id);
    this.error.set(null);

    this.api.delete(id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.load();
      },
      error: (e) => {
        this.deletingId.set(null);
        this.error.set(e?.message ?? 'Error eliminando rutina');
      },
    });
  }
}
