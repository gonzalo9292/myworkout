import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RoutinesApi, RoutineListItem } from '../../core/services/routines-api';
import { RouterModule } from '@angular/router';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Rutinas</h1>
        <p class="muted">Crea rutinas y entra a ver su detalle.</p>
      </header>

      <section class="toolbar">
        <input
          class="inp"
          placeholder="Nombre de la rutina"
          [(ngModel)]="newName"
        />

        <input
          class="inp"
          placeholder="Notas (opcional)"
          [(ngModel)]="newNotes"
        />

        <button
          class="btn"
          (click)="create()"
          [disabled]="creating() || !newName.trim()"
        >
          {{ creating() ? 'Creando…' : 'Crear rutina' }}
        </button>

        <div class="spacer"></div>

        <span class="pill">Total: {{ routines().length }}</span>
      </section>

      <section *ngIf="loading()" class="state">Cargando rutinas…</section>
      <section *ngIf="error()" class="state error">{{ error() }}</section>

      <section *ngIf="!loading() && !error()" class="list">
        <article class="row" *ngFor="let r of routines()">
          <div class="info">
            <div class="name">{{ r.name }}</div>
            <div class="notes" *ngIf="r.notes">{{ r.notes }}</div>
          </div>

          <a class="btn ghost" [routerLink]="['/routines', r.id]"
            >Ver detalle</a
          >
        </article>

        <p *ngIf="routines().length === 0" class="muted">
          Aún no tienes rutinas. Crea la primera arriba.
        </p>
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

      .toolbar {
        margin-top: 18px;
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
        padding: 12px;
        border: 1px solid #eee;
        border-radius: 12px;
        background: #fff;
      }

      .inp {
        min-width: 220px;
        padding: 10px 12px;
        border: 1px solid #e6e6e6;
        border-radius: 10px;
        outline: none;
      }

      .spacer {
        flex: 1;
      }

      .pill {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        background: #f4f4f4;
        font-weight: 800;
        font-size: 12px;
      }

      .state {
        margin-top: 16px;
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
        margin-top: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .row {
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
      .name {
        font-weight: 900;
      }
      .notes {
        opacity: 0.75;
        font-size: 13px;
        margin-top: 2px;
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
      }
      .btn.ghost {
        background: #f4f4f4;
        color: #111;
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
})
export class RoutinesPage {
  private api = inject(RoutinesApi);

  loading = signal(true);
  creating = signal(false);
  error = signal<string | null>(null);

  routines = signal<RoutineListItem[]>([]);

  newName = '';
  newNotes = '';

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
}
