import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <div class="brand">
        <div class="logo">MW</div>
        <div class="brand-text">
          <div class="title">MyWorkout</div>
          <div class="subtitle">Entrena mejor. Registra. Analiza.</div>
        </div>
      </div>

      <nav class="nav">
        <a
          routerLink="/exercises"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          >Catálogo</a
        >
        <a
          routerLink="/routines"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          >Rutinas</a
        >
        <a
          routerLink="/progress"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          >Progreso</a
        >
        <a
          routerLink="/login"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          >Login</a
        >
      </nav>
    </header>

    <main class="content">
      <router-outlet></router-outlet>
    </main>

    <footer class="footer">
      <div class="footer-inner">MyWorkout · v0.1</div>
    </footer>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: #fafafa;
        color: #111;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial,
          sans-serif;
      }

      .topbar {
        position: sticky;
        top: 0;
        z-index: 10;
        width: 100%;
        background: white;
        border-bottom: 1px solid #e6e6e6;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 220px;
      }

      .logo {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: #111;
        color: white;
        display: grid;
        place-items: center;
        font-weight: 800;
        font-size: 14px;
      }

      .brand-text .title {
        font-weight: 800;
        line-height: 1.1;
      }

      .brand-text .subtitle {
        font-size: 12px;
        opacity: 0.7;
        line-height: 1.2;
      }

      .nav {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .nav a {
        text-decoration: none;
        color: #222;
        font-weight: 700;
        font-size: 14px;
        padding: 8px 12px;
        border-radius: 12px;
      }

      .nav a:hover {
        background: #f2f2f2;
      }

      .nav a.active {
        background: #111;
        color: white;
      }

      .content {
        max-width: 1100px;
        margin: 0 auto;
        padding: 18px 16px;
        min-height: calc(100vh - 120px);
      }

      .footer {
        width: 100%;
        background: white;
        border-top: 1px solid #e6e6e6;
        padding: 12px 16px;
      }

      .footer-inner {
        max-width: 1100px;
        margin: 0 auto;
        font-size: 12px;
        opacity: 0.75;
      }
    `,
  ],
})
export class App {}
