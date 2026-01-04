import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ExercisesApi } from '../../core/services/exercises-api';
import { ExerciseDetail } from '../../core/models/exercises.model';

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="page">
      <header class="topbar">
        <button class="back" (click)="goBack()">← Volver al catálogo</button>
      </header>

      <section *ngIf="loading()" class="state">Cargando ejercicio…</section>

      <section *ngIf="error()" class="state error">
        {{ error() }}
      </section>

      <section
        *ngIf="!loading() && !error() && exercise() as ex"
        class="detail"
      >
        <!-- Columna izquierda: imagen (más vertical) -->
        <aside class="left">
          <div class="image-card">
            <img [src]="imgSrc(ex)" [alt]="ex.name" loading="lazy" />
          </div>
        </aside>

        <!-- Columna derecha: contenido -->
        <main class="right">
          <h1 class="title">{{ ex.name }}</h1>

          <section class="panel">
            <h2 class="panel-title">Descripción</h2>

            <p
              class="description"
              *ngIf="cleanDescription(ex) as desc; else noDesc"
            >
              {{ desc }}
            </p>

            <ng-template #noDesc>
              <p class="description muted">
                Este ejercicio no tiene descripción.
              </p>
            </ng-template>
          </section>

          <section class="panel" *ngIf="ex.muscles?.length">
            <h2 class="panel-title">Músculos trabajados</h2>

            <div class="chips">
              <span class="chip" *ngFor="let m of ex.muscles">{{
                m.name
              }}</span>
            </div>
          </section>

          <section class="actions">
            <button class="btn ghost" (click)="goBack()">Volver</button>
            <button class="btn" (click)="todo()">Añadir a entrenamiento</button>
          </section>
        </main>
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

      /* Topbar */
      .topbar {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        margin-bottom: 14px;
      }

      .back {
        background: none;
        border: none;
        cursor: pointer;
        font-weight: 800;
        padding: 8px 10px;
        border-radius: 10px;
      }
      .back:hover {
        background: #f4f4f4;
      }

      /* States */
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

      /* Layout */
      .detail {
        display: grid;
        grid-template-columns: 380px 1fr;
        gap: 22px;
        align-items: start;
      }

      .left {
        position: sticky;
        top: 18px;
        align-self: start;
      }

      /* Imagen más "alta" (vertical) */
      .image-card {
        border-radius: 18px;
        overflow: hidden;
        border: 1px solid #eee;
        background: #f6f6f6;

        /* más alta */
        height: 560px;

        /* importante para centrar la imagen con contain */
        display: flex;
        align-items: center;
        justify-content: center;

        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.06);
      }

      .image-card img {
        width: 100%;
        height: 100%;

        /*
          CLAVE:
          - contain evita el “zoom” y el recorte agresivo
          - así se ve completa aunque sea más grande/pequeña
        */
        object-fit: contain;
        object-position: center;

        /* un poco de aire para que no toque el borde */
        padding: 12px;

        display: block;
      }

      /* Content */
      .right {
        min-width: 0;
      }

      .title {
        margin: 6px 0 14px;
        font-size: 40px;
        line-height: 1.1;
        letter-spacing: -0.02em;
      }

      .panel {
        border: 1px solid #eee;
        background: #fff;
        border-radius: 16px;
        padding: 14px 14px 12px;
        margin-bottom: 14px;
      }

      .panel-title {
        margin: 0 0 10px;
        font-size: 15px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        opacity: 0.75;
      }

      /* Quitar “margen raro” al principio */
      .description {
        margin: 0; /* sin margen por defecto del <p> */
        padding: 0;
        text-indent: 0;
        line-height: 1.7;
        opacity: 0.9;
        white-space: normal;
      }

      .muted {
        opacity: 0.65;
      }

      /* Chips */
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        padding: 8px 10px;
        border-radius: 999px;
        background: #f4f4f4;
        border: 1px solid #ededed;
        font-weight: 800;
        font-size: 13px;
      }

      /* Actions */
      .actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 10px;
      }

      .btn {
        border: none;
        border-radius: 12px;
        padding: 11px 14px;
        font-weight: 900;
        cursor: pointer;
        background: #111;
        color: #fff;
      }

      .btn.ghost {
        background: #f4f4f4;
        color: #111;
      }

      .btn:hover {
        filter: brightness(0.95);
      }

      /* Responsive */
      @media (max-width: 920px) {
        .detail {
          grid-template-columns: 1fr;
        }
        .left {
          position: relative;
          top: auto;
        }
        .image-card {
          height: 360px;
        }
        .actions {
          justify-content: stretch;
        }
        .btn {
          flex: 1;
        }
      }
    `,
  ],
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
   * Limpia espacios/saltos “raros” que pueden venir del HTML original:
   * - recorta espacios al inicio/fin
   * - colapsa múltiples espacios
   * - elimina saltos extra
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
