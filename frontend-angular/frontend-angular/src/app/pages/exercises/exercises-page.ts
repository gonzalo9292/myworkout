import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExercisesApi } from '../../core/services/exercises-api';
import { ExerciseListItem } from '../../core/models/exercises.model';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Catálogo de ejercicios</h1>
        <p class="muted">Busca, filtra y abre el detalle del ejercicio.</p>
      </header>

      <section class="toolbar">
        <input
          class="search"
          type="text"
          placeholder="Buscar por nombre..."
          [(ngModel)]="q"
          (ngModelChange)="onQueryChange($event)"
        />

        <div class="spacer"></div>

        <div class="meta">
          <span class="pill">
            Mostrando {{ filtered().length }} / {{ all().length }}
          </span>
        </div>
      </section>

      <section *ngIf="loading()" class="state">Cargando ejercicios…</section>
      <section *ngIf="error()" class="state error">
        Error cargando ejercicios: {{ error() }}
      </section>

      <section *ngIf="!loading() && !error()" class="grid">
        <article class="card" *ngFor="let ex of paged()">
          <div class="thumb">
            <img [src]="imgSrc(ex)" [alt]="ex.name" loading="lazy" />
          </div>

          <!-- IMPORTANTE: body flexible para empujar actions abajo -->
          <div class="card-body">
            <div class="title" [title]="ex.name">{{ ex.name }}</div>

            <div class="desc" *ngIf="ex.description_text">
              {{ ex.description_text }}
            </div>

            <div class="actions">
              <button class="btn" (click)="openDetail(ex.id)">
                Ver detalle
              </button>
            </div>
          </div>
        </article>
      </section>

      <section *ngIf="!loading() && !error()" class="pager">
        <button
          class="btn ghost"
          (click)="prevPage()"
          [disabled]="page() === 1"
        >
          Anterior
        </button>

        <span class="muted"> Página {{ page() }} / {{ totalPages() }} </span>

        <button
          class="btn ghost"
          (click)="nextPage()"
          [disabled]="page() === totalPages()"
        >
          Siguiente
        </button>

        <div class="perpage">
          <span class="muted">Por página:</span>
          <select
            [(ngModel)]="pageSize"
            (ngModelChange)="onPageSizeChange($event)"
          >
            <option [ngValue]="12">12</option>
            <option [ngValue]="24">24</option>
            <option [ngValue]="48">48</option>
          </select>
        </div>
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
        gap: 12px;
        align-items: center;
        padding: 12px;
        border: 1px solid #eee;
        border-radius: 12px;
        background: #fff;
      }

      .search {
        flex: 1;
        min-width: 240px;
        padding: 10px 12px;
        border: 1px solid #e6e6e6;
        border-radius: 10px;
        outline: none;
      }
      .search:focus {
        border-color: #cfcfcf;
      }

      .spacer {
        flex: 1;
      }

      .pill {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        background: #f4f4f4;
        font-weight: 700;
        font-size: 12px;
      }

      .state {
        margin: 18px 0;
        padding: 14px;
        border-radius: 12px;
        background: #fafafa;
      }
      .state.error {
        background: #fff5f5;
        border: 1px solid #ffd6d6;
      }

      .grid {
        margin-top: 18px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 14px;
        align-items: stretch;
      }

      .card {
        border: 1px solid #eee;
        border-radius: 14px;
        overflow: hidden;
        background: #fff;

        /* clave: card ocupa toda la celda y permite empujar acciones abajo */
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 260px;
      }

      /* imagen con alto fijo => cards consistentes */
      .thumb {
        height: 160px;
        background: #f6f6f6;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .card-body {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;

        /* clave: rellena el espacio restante */
        flex: 1;
      }

      .title {
        font-weight: 800;
        line-height: 1.2;

        /* reserva 2 líneas SIEMPRE */
        min-height: calc(1.2em * 2);

        /* y recorta a 2 líneas si se pasa */
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* recorte consistente del texto */
      .desc {
        font-size: 13px;
        opacity: 0.75;

        /* reserva 3 líneas SIEMPRE */
        line-height: 1.35;
        min-height: calc(1.35em * 3);

        /* recorta a 3 líneas */
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* clave: acciones abajo */
      .actions {
        margin-top: auto;
        display: flex;
      }

      .btn {
        border: none;
        border-radius: 10px;
        padding: 10px 12px;
        font-weight: 800;
        cursor: pointer;
        background: #111;
        color: #fff;
      }
      .btn.ghost {
        background: #f4f4f4;
        color: #111;
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .pager {
        margin: 18px 0 6px;
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
      }

      .perpage {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      select {
        padding: 8px;
        border-radius: 10px;
        border: 1px solid #e6e6e6;
      }
    `,
  ],
})
export class ExercisesPage {
  private api = inject(ExercisesApi);

  // estado
  all = signal<ExerciseListItem[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  // filtros (como signal para que computed sea reactivo)
  q = signal('');

  // paginación
  page = signal(1);
  pageSize = signal(24);

  constructor() {
    this.load();

    // si cambia q o pageSize, volvemos a página 1
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

  // Normaliza para buscar bien: sin acentos y en minúsculas
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
    // value viene como number por [ngValue]
    this.pageSize.set(Number(value) || 24);
  }

  filtered = computed(() => {
    const query = this.normalize(this.q());

    if (!query) return this.all();

    return this.all().filter((ex) => {
      const name = this.normalize(ex.name ?? '');
      return name.includes(query);
      // Si quieres incluir descripción:
      // const desc = this.normalize(ex.description_text ?? '');
      // return name.includes(query) || desc.includes(query);
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
    // ya todas tienen, pero por seguridad mantenemos fallback
    return ex.image_url || 'https://via.placeholder.com/640x360?text=MyWorkout';
  }

  openDetail(id: number) {
    // siguiente paso: ruta /exercises/:id o modal
    alert(`Detalle del ejercicio ${id} (siguiente paso)`);
  }
}
