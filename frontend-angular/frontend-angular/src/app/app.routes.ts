import { Routes } from '@angular/router';
import { ExercisesPage } from './pages/exercises/exercises-page';
import { WorkoutsPage } from './pages/workouts/workouts-page';
import { ProgressPage } from './pages/progress/progress-page';
import { LoginPage } from './pages/auth/login-page';
import { ExerciseDetailPage } from './pages/exercises/exercise-detail-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'exercises' },
  { path: 'exercises', component: ExercisesPage },
  { path: 'exercises/:id', component: ExerciseDetailPage }, // <-- NUEVO
  { path: 'workouts', component: WorkoutsPage },
  { path: 'progress', component: ProgressPage },
  { path: 'login', component: LoginPage },
  { path: '**', redirectTo: 'exercises' },
];
